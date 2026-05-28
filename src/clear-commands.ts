import { REST, Routes } from "discord.js";
import { config } from "./config";

const rest = new REST({ version: "10" }).setToken(config.token);

async function clearCommands(scope: string, route: `/${string}`) {
  await rest.put(route, { body: [] });
  console.log(`Cleared ${scope} slash commands.`);
}

await clearCommands("global", Routes.applicationCommands(config.clientId));

if (config.guildIds.length > 0) {
  for (const guildId of config.guildIds) {
    await clearCommands(
      `guild ${guildId}`,
      Routes.applicationGuildCommands(config.clientId, guildId),
    );
  }
} else {
  console.log("No DISCORD_GUILD_IDS or DISCORD_GUILD_ID set, skipped guild slash commands.");
}

console.log("Run `bun run deploy` to register the current commands again.");
