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

const guildIds = optionalEnvList("DISCORD_GUILD_IDS", "DISCORD_GUILD_ID");

export const config = {
  token: requiredEnv("DISCORD_TOKEN"),
  clientId: requiredEnv("DISCORD_CLIENT_ID"),
  guildId: guildIds[0],
  guildIds,
  youtubeCookie: process.env.YOUTUBE_COOKIE?.trim() || undefined,
  youtubeCookiesFile: process.env.YOUTUBE_COOKIES_FILE?.trim() || undefined,
};
