import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { config } from "./config";

const rest = new REST({ version: "10" }).setToken(config.token);
const body = commands.map((command) => command.data.toJSON());

if (config.guildIds.length > 0) {
  for (const guildId of config.guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    console.log(`Deployed ${commands.length} slash commands to guild ${guildId}.`);
  }
} else {
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`Deployed ${commands.length} slash commands globally.`);
}
