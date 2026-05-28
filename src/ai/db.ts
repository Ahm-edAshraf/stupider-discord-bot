import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";

export type AiSettings = {
  enabled: boolean;
  dailyCap: number;
};

export type RecentMessage = {
  userId: string;
  username: string;
  content: string;
};

export type AiUsage = {
  replies: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const defaultSummary =
  "No strong server personality learned yet. Talk like a dumb, chaotic friend who keeps replies short.";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class AiDatabase {
  private readonly db: Database;

  constructor(private readonly dbPath = config.ai.dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
    this.purgeOldMessages();
  }

  close() {
    this.db.close();
  }

  saveMessage(input: {
    guildId: string;
    channelId: string;
    messageId?: string;
    userId: string;
    username: string;
    content: string;
    createdAt: number;
  }): boolean {
    const result = this.db
      .query(
        `insert or ignore into ai_messages
          (guild_id, channel_id, message_id, user_id, username, content, created_at)
         values
          ($guildId, $channelId, $messageId, $userId, $username, $content, $createdAt)`,
      )
      .run({
        $guildId: input.guildId,
        $channelId: input.channelId,
        $messageId: input.messageId ?? null,
        $userId: input.userId,
        $username: input.username,
        $content: input.content,
        $createdAt: input.createdAt,
      });

    if (result.changes < 1) {
      return false;
    }

    this.db
      .query(
        `insert into ai_guild_counters (guild_id, messages_since_summary)
         values ($guildId, 1)
         on conflict(guild_id) do update set
          messages_since_summary = messages_since_summary + 1`,
      )
      .run({ $guildId: input.guildId });

    return true;
  }

  getRecentMessages(guildId: string, channelId: string, limit: number): RecentMessage[] {
    return this.db
      .query<RecentMessage, { $guildId: string; $channelId: string; $limit: number }>(
        `select user_id as userId, username, content
         from ai_messages
         where guild_id = $guildId and channel_id = $channelId
         order by created_at desc, id desc
         limit $limit`,
      )
      .all({ $guildId: guildId, $channelId: channelId, $limit: limit })
      .reverse();
  }

  getGuildSettings(guildId: string): AiSettings {
    const row = this.db
      .query<{ enabled: number; dailyCap: number | null }, { $guildId: string }>(
        `select enabled, daily_cap as dailyCap
         from ai_guild_settings
         where guild_id = $guildId`,
      )
      .get({ $guildId: guildId });

    return {
      enabled: row ? row.enabled === 1 : true,
      dailyCap: row?.dailyCap ?? config.ai.dailyReplyCapPerGuild,
    };
  }

  setGuildEnabled(guildId: string, enabled: boolean) {
    this.db
      .query(
        `insert into ai_guild_settings (guild_id, enabled)
         values ($guildId, $enabled)
         on conflict(guild_id) do update set enabled = $enabled`,
      )
      .run({ $guildId: guildId, $enabled: enabled ? 1 : 0 });
  }

  setGuildDailyCap(guildId: string, dailyCap: number) {
    this.db
      .query(
        `insert into ai_guild_settings (guild_id, daily_cap)
         values ($guildId, $dailyCap)
         on conflict(guild_id) do update set daily_cap = $dailyCap`,
      )
      .run({ $guildId: guildId, $dailyCap: dailyCap });
  }

  isChannelDisabled(guildId: string, channelId: string): boolean {
    const row = this.db
      .query<{ disabled: number }, { $guildId: string; $channelId: string }>(
        `select 1 as disabled
         from ai_disabled_channels
         where guild_id = $guildId and channel_id = $channelId`,
      )
      .get({ $guildId: guildId, $channelId: channelId });

    return Boolean(row);
  }

  setChannelEnabled(guildId: string, channelId: string, enabled: boolean) {
    if (enabled) {
      this.db
        .query(
          `delete from ai_disabled_channels
          where guild_id = $guildId and channel_id = $channelId`,
        )
        .run({ $guildId: guildId, $channelId: channelId });
      return;
    }

    this.db
      .query(
        `insert or ignore into ai_disabled_channels (guild_id, channel_id)
         values ($guildId, $channelId)`,
      )
      .run({ $guildId: guildId, $channelId: channelId });
  }

  getPersonality(guildId: string): string {
    const row = this.db
      .query<{ summary: string }, { $guildId: string }>(
        `select summary
         from ai_guild_profiles
         where guild_id = $guildId`,
      )
      .get({ $guildId: guildId });

    return row?.summary ?? defaultSummary;
  }

  setPersonality(guildId: string, summary: string) {
    this.db
      .query(
        `insert into ai_guild_profiles (guild_id, summary, updated_at)
         values ($guildId, $summary, $updatedAt)
         on conflict(guild_id) do update set
          summary = $summary,
          updated_at = $updatedAt`,
      )
      .run({ $guildId: guildId, $summary: summary, $updatedAt: Date.now() });
  }

  resetPersonality(guildId: string) {
    this.db
      .query(`delete from ai_guild_profiles where guild_id = $guildId`)
      .run({ $guildId: guildId });
    this.resetSummaryCounter(guildId);
  }

  shouldSummarize(guildId: string, threshold = 75): boolean {
    const row = this.db
      .query<{ count: number }, { $guildId: string }>(
        `select messages_since_summary as count
         from ai_guild_counters
         where guild_id = $guildId`,
      )
      .get({ $guildId: guildId });

    return (row?.count ?? 0) >= threshold;
  }

  resetSummaryCounter(guildId: string) {
    this.db
      .query(
        `insert into ai_guild_counters (guild_id, messages_since_summary)
         values ($guildId, 0)
         on conflict(guild_id) do update set messages_since_summary = 0`,
      )
      .run({ $guildId: guildId });
  }

  getUsage(guildId: string, day = todayKey()): AiUsage {
    const row = this.db
      .query<AiUsage, { $guildId: string; $day: string }>(
        `select replies, input_tokens as inputTokens, output_tokens as outputTokens, total_tokens as totalTokens
         from ai_usage
         where guild_id = $guildId and day = $day`,
      )
      .get({ $guildId: guildId, $day: day });

    return row ?? { replies: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  getGlobalTokenUsage(day = todayKey()): number {
    const row = this.db
      .query<{ total: number | null }, { $day: string }>(
        `select sum(total_tokens) as total
         from ai_usage
         where day = $day`,
      )
      .get({ $day: day });

    return row?.total ?? 0;
  }

  recordUsage(guildId: string, inputTokens: number, outputTokens: number, totalTokens: number) {
    const day = todayKey();
    this.db
      .query(
        `insert into ai_usage
          (day, guild_id, replies, input_tokens, output_tokens, total_tokens)
         values
          ($day, $guildId, 1, $inputTokens, $outputTokens, $totalTokens)
         on conflict(day, guild_id) do update set
          replies = replies + 1,
          input_tokens = input_tokens + $inputTokens,
          output_tokens = output_tokens + $outputTokens,
          total_tokens = total_tokens + $totalTokens`,
      )
      .run({
        $day: day,
        $guildId: guildId,
        $inputTokens: inputTokens,
        $outputTokens: outputTokens,
        $totalTokens: totalTokens,
      });
  }

  purgeGuild(guildId: string) {
    this.db.transaction(() => {
      this.db.query(`delete from ai_messages where guild_id = $guildId`).run({ $guildId: guildId });
      this.db.query(`delete from ai_guild_profiles where guild_id = $guildId`).run({ $guildId: guildId });
      this.db.query(`delete from ai_guild_counters where guild_id = $guildId`).run({ $guildId: guildId });
      this.db.query(`delete from ai_usage where guild_id = $guildId`).run({ $guildId: guildId });
      this.db.query(`delete from ai_disabled_channels where guild_id = $guildId`).run({ $guildId: guildId });
      this.db.query(`delete from ai_guild_settings where guild_id = $guildId`).run({ $guildId: guildId });
    })();
  }

  purgeOldMessages() {
    const cutoff = Date.now() - config.ai.messageRetentionDays * 24 * 60 * 60 * 1_000;
    this.db.query(`delete from ai_messages where created_at < $cutoff`).run({ $cutoff: cutoff });
  }

  private migrate() {
    this.db.exec(`
      create table if not exists ai_messages (
        id integer primary key autoincrement,
        guild_id text not null,
        channel_id text not null,
        message_id text,
        user_id text not null,
        username text not null,
        content text not null,
        created_at integer not null
      );

      create index if not exists ai_messages_channel_created_idx
        on ai_messages (guild_id, channel_id, created_at);

      create table if not exists ai_guild_profiles (
        guild_id text primary key,
        summary text not null,
        updated_at integer not null
      );

      create table if not exists ai_guild_settings (
        guild_id text primary key,
        enabled integer not null default 1,
        daily_cap integer
      );

      create table if not exists ai_disabled_channels (
        guild_id text not null,
        channel_id text not null,
        primary key (guild_id, channel_id)
      );

      create table if not exists ai_guild_counters (
        guild_id text primary key,
        messages_since_summary integer not null default 0
      );

      create table if not exists ai_usage (
        day text not null,
        guild_id text not null,
        replies integer not null default 0,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        total_tokens integer not null default 0,
        primary key (day, guild_id)
      );
    `);

    const columns = this.db
      .query<{ name: string }, []>(`pragma table_info(ai_messages)`)
      .all();
    if (!columns.some((column) => column.name === "message_id")) {
      this.db.exec(`alter table ai_messages add column message_id text;`);
    }

    this.db.exec(`
      create unique index if not exists ai_messages_discord_message_idx
        on ai_messages (guild_id, channel_id, message_id)
        where message_id is not null;
    `);
  }
}
