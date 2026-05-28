import "dotenv/config";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnvList(...names: string[]): string[] {
  const values = names.flatMap((name) => process.env[name]?.split(",") ?? []);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function optionalBoolean(name: string, defaultValue = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

function optionalPositiveInteger(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

const guildIds = optionalEnvList("DISCORD_GUILD_IDS", "DISCORD_GUILD_ID");

export const config = {
  token: requiredEnv("DISCORD_TOKEN"),
  clientId: requiredEnv("DISCORD_CLIENT_ID"),
  guildId: guildIds[0],
  guildIds,
  youtubeCookie: process.env.YOUTUBE_COOKIE?.trim() || undefined,
  youtubeCookiesFile: process.env.YOUTUBE_COOKIES_FILE?.trim() || undefined,
  ai: {
    enabled: optionalBoolean("AI_ENABLED", false),
    groqApiKey: process.env.GROQ_API_KEY?.trim() || undefined,
    model: process.env.AI_MODEL?.trim() || "llama-3.1-8b-instant",
    dbPath: process.env.AI_DB_PATH?.trim() || "./data/ai.sqlite",
    dailyReplyCapPerGuild: optionalPositiveInteger("AI_DAILY_REPLY_CAP_PER_GUILD", 300),
    maxRecentMessages: optionalPositiveInteger("AI_MAX_RECENT_MESSAGES", 12),
    maxOutputTokens: optionalPositiveInteger("AI_MAX_OUTPUT_TOKENS", 64),
    globalDailyTokenCap: optionalPositiveInteger("AI_GLOBAL_DAILY_TOKEN_CAP", 450_000),
    maxMessageLength: optionalPositiveInteger("AI_MAX_MESSAGE_LENGTH", 1_000),
    messageRetentionDays: optionalPositiveInteger("AI_MESSAGE_RETENTION_DAYS", 30),
  },
};
