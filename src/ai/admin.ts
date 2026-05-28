import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionsBitField } from "discord.js";
import type { BotContext } from "../context";

function requireAi(context: BotContext) {
  if (!context.ai) {
    throw new Error("AI controller was not initialized.");
  }

  return context.ai;
}

async function reply(interaction: ChatInputCommandInteraction, content: string) {
  await interaction.reply({ content, ephemeral: true });
}

function requireManageGuild(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) {
    return false;
  }

  return interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

export async function handleAiCommand(interaction: ChatInputCommandInteraction, context: BotContext) {
  if (!interaction.guildId || !interaction.inCachedGuild()) {
    await reply(interaction, "Use this command inside a server.");
    return;
  }

  if (!requireManageGuild(interaction)) {
    await reply(interaction, "You need Manage Server permission to change AI settings.");
    return;
  }

  const ai = requireAi(context);
  const subcommand = interaction.options.getSubcommand();
  const subcommandGroup = interaction.options.getSubcommandGroup(false);

  if (subcommand === "enable" || subcommand === "disable") {
    const enabled = subcommand === "enable";
    const scope = interaction.options.getString("scope", true);

    if (scope === "server") {
      ai.db.setGuildEnabled(interaction.guildId, enabled);
      await reply(interaction, `AI chat is now ${enabled ? "enabled" : "disabled"} for this server.`);
      return;
    }

    ai.db.setChannelEnabled(interaction.guildId, interaction.channelId, enabled);
    await reply(interaction, `AI chat is now ${enabled ? "enabled" : "disabled"} for this channel.`);
    return;
  }

  if (subcommand === "stats") {
    const stats = ai.getStats(interaction.guildId);
    const paused =
      stats.pausedUntil > Date.now()
        ? `yes, until ${new Date(stats.pausedUntil).toISOString()}`
        : "no";

    await reply(
      interaction,
      [
        `Ready: ${stats.ready ? "yes" : "no"}`,
        `Server enabled: ${stats.settings.enabled ? "yes" : "no"}`,
        `Daily cap: ${stats.settings.dailyCap}`,
        `Replies today: ${stats.usage.replies}`,
        `Tokens today: ${stats.usage.totalTokens}`,
        `Global tokens today: ${stats.globalTokens}`,
        `Paused: ${paused}`,
      ].join("\n"),
    );
    return;
  }

  if (subcommandGroup === "personality") {
    if (subcommand === "show") {
      await reply(interaction, ai.db.getPersonality(interaction.guildId));
      return;
    }

    if (subcommand === "reset") {
      ai.db.resetPersonality(interaction.guildId);
      await reply(interaction, "AI personality summary reset.");
      return;
    }

    if (subcommand === "set") {
      const summary = interaction.options.getString("text", true).trim();
      ai.db.setPersonality(interaction.guildId, summary);
      await reply(interaction, "AI personality summary updated.");
      return;
    }
  }

  if (subcommand === "cap") {
    const dailyCap = interaction.options.getInteger("daily", true);
    ai.db.setGuildDailyCap(interaction.guildId, dailyCap);
    await reply(interaction, `AI daily reply cap set to ${dailyCap}.`);
    return;
  }

  if (subcommand === "purge") {
    ai.db.purgeGuild(interaction.guildId);
    await reply(interaction, "AI memory, settings, and usage for this server were purged.");
    return;
  }

  await reply(interaction, "Unknown AI command.");
}
