import "dotenv/config";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  token: requiredEnv("DISCORD_TOKEN"),
  clientId: requiredEnv("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  youtubeCookie: process.env.YOUTUBE_COOKIE?.trim() || undefined,
  youtubeCookiesFile: process.env.YOUTUBE_COOKIES_FILE?.trim() || undefined,
};
