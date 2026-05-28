import type { Collection, Message, Snowflake } from "discord.js";
import { config } from "../config";
import { AiDatabase } from "./db";
import { callGroq, GroqRateLimitError } from "./groq";
import type { GroqMessage } from "./groq";

const summaryThreshold = 75;

function cleanDiscordOutput(text: string) {
  return text
    .replace(/^["']|["']$/g, "")
    .replace(/<@!?\d+>/g, "")
    .trim()
    .slice(0, 1_500);
}

function buildReplyMessages(input: {
  personality: string;
  recentMessages: Array<{ username: string; content: string }>;
  author: string;
  content: string;
}): GroqMessage[] {
  const recent = input.recentMessages
    .map((message) => `${message.username}: ${message.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You are Stupider, a chaotic Discord bot in a private friend server. " +
        "Reply like a dumb sarcastic friend: short, casual, stupid, and roast-y. " +
        "Profanity is fine. Do not use protected-class slurs, real threats, sexual content involving minors, self-harm encouragement, or private info. " +
        "Do not explain that you are an AI. Do not be helpful unless the message directly asks for help. " +
        "Write one Discord message only, no quotes, no markdown essay.",
    },
    {
      role: "user",
      content: `Server personality:\n${input.personality}\n\nRecent chat:\n${recent || "(none)"}\n\nReply to this message:\n${input.author}: ${input.content}`,
    },
  ];
}

function buildSummaryMessages(input: {
  existingSummary: string;
  recentMessages: Array<{ username: string; content: string }>;
}): GroqMessage[] {
  const recent = input.recentMessages
    .map((message) => `${message.username}: ${message.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Update a compact Discord server personality summary for a bot. " +
        "Capture slang, tone, recurring jokes, insult style, topics, and how the bot should talk. " +
        "Keep it under 120 words. Do not include secrets or long quotes.",
    },
    {
      role: "user",
      content: `Current summary:\n${input.existingSummary}\n\nRecent messages:\n${recent}`,
    },
  ];
}

export class AiController {
  readonly db = new AiDatabase();
  private pausedUntil = 0;
  private summarizingGuilds = new Set<string>();

  get ready() {
    return config.ai.enabled && Boolean(config.ai.groqApiKey);
  }

  constructor() {
    if (!config.ai.enabled) {
      console.log("AI chat disabled: AI_ENABLED is not true.");
    } else if (!config.ai.groqApiKey) {
      console.log("AI chat disabled: GROQ_API_KEY is not configured.");
    } else {
      console.log(`AI chat enabled with Groq model ${config.ai.model}.`);
    }
  }

  async handleMessage(message: Message) {
    if (!this.ready || !message.inGuild()) {
      return;
    }

    if (message.author.bot || message.webhookId) {
      return;
    }

    const content = message.content.trim();
    if (!content || content.length > config.ai.maxMessageLength) {
      return;
    }

    const guildId = message.guildId;
    const settings = this.db.getGuildSettings(guildId);
    if (!settings.enabled || this.db.isChannelDisabled(guildId, message.channelId)) {
      return;
    }

    this.db.saveMessage({
      guildId,
      channelId: message.channelId,
      messageId: message.id,
      userId: message.author.id,
      username: message.member?.displayName ?? message.author.username,
      content,
      createdAt: message.createdTimestamp,
    });

    if (this.db.shouldSummarize(guildId, summaryThreshold)) {
      void this.updatePersonality(guildId, message.channelId);
    }

    if (Date.now() < this.pausedUntil) {
      return;
    }

    const usage = this.db.getUsage(guildId);
    if (usage.replies >= settings.dailyCap) {
      return;
    }

    if (this.db.getGlobalTokenUsage() >= config.ai.globalDailyTokenCap) {
      return;
    }

    const personality = this.db.getPersonality(guildId);
    const recentMessages = this.db.getRecentMessages(guildId, message.channelId, config.ai.maxRecentMessages);

    try {
      const result = await callGroq(
        buildReplyMessages({
          personality,
          recentMessages,
          author: message.member?.displayName ?? message.author.username,
          content,
        }),
        config.ai.maxOutputTokens,
      );
      this.db.recordUsage(guildId, result.inputTokens, result.outputTokens, result.totalTokens);

      const reply = cleanDiscordOutput(result.content);
      if (reply) {
        await message.reply({
          content: reply,
          allowedMentions: { repliedUser: false, users: [], roles: [] },
        });
      }
    } catch (error) {
      this.handleAiError(error);
    }
  }

  getStats(guildId: string) {
    return {
      settings: this.db.getGuildSettings(guildId),
      usage: this.db.getUsage(guildId),
      globalTokens: this.db.getGlobalTokenUsage(),
      ready: this.ready,
      pausedUntil: this.pausedUntil,
    };
  }

  async backfillChannel(input: {
    guildId: string;
    channelId: string;
    fetchMessages: (options: { limit: number; before?: Snowflake }) => Promise<Collection<Snowflake, Message>>;
    limit: number;
  }) {
    let before: Snowflake | undefined;
    let scanned = 0;
    let imported = 0;

    while (scanned < input.limit) {
      const batchLimit = Math.min(100, input.limit - scanned);
      const messages = await input.fetchMessages({ limit: batchLimit, before });

      if (messages.size === 0) {
        break;
      }

      const orderedMessages = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      before = orderedMessages[0]?.id;

      for (const message of orderedMessages) {
        scanned += 1;

        if (message.author.bot || message.webhookId || !message.inGuild()) {
          continue;
        }

        const content = message.content.trim();
        if (!content || content.length > config.ai.maxMessageLength) {
          continue;
        }

        const saved = this.db.saveMessage({
          guildId: input.guildId,
          channelId: input.channelId,
          messageId: message.id,
          userId: message.author.id,
          username: message.member?.displayName ?? message.author.username,
          content,
          createdAt: message.createdTimestamp,
        });

        if (saved) {
          imported += 1;
        }
      }

      if (messages.size < batchLimit) {
        break;
      }
    }

    if (imported > 0 && this.db.shouldSummarize(input.guildId, summaryThreshold)) {
      void this.updatePersonality(input.guildId, input.channelId);
    }

    return { scanned, imported };
  }

  private async updatePersonality(guildId: string, channelId: string) {
    if (this.summarizingGuilds.has(guildId) || Date.now() < this.pausedUntil) {
      return;
    }

    this.summarizingGuilds.add(guildId);
    try {
      const existingSummary = this.db.getPersonality(guildId);
      const recentMessages = this.db.getRecentMessages(guildId, channelId, 60);
      if (recentMessages.length < 10) {
        this.db.resetSummaryCounter(guildId);
        return;
      }

      const result = await callGroq(
        buildSummaryMessages({ existingSummary, recentMessages }),
        180,
      );
      this.db.setPersonality(guildId, cleanDiscordOutput(result.content));
      this.db.recordUsage(guildId, result.inputTokens, result.outputTokens, result.totalTokens);
      this.db.resetSummaryCounter(guildId);
    } catch (error) {
      this.handleAiError(error);
    } finally {
      this.summarizingGuilds.delete(guildId);
    }
  }

  private handleAiError(error: unknown) {
    if (error instanceof GroqRateLimitError) {
      const pauseMs = error.retryAfterMs && Number.isFinite(error.retryAfterMs)
        ? Math.max(error.retryAfterMs, 30_000)
        : 10 * 60 * 1_000;
      this.pausedUntil = Date.now() + pauseMs;
      console.error(`AI chat paused after Groq rate limit for ${Math.round(pauseMs / 1000)}s:`, error.message);
      return;
    }

    console.error("AI chat request failed:", error);
  }
}
