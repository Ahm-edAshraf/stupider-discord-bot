import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { config } from "./config";

const rest = new REST({ version: "10" }).setToken(config.token);
const body = commands.map((command) => command.data.toJSON());

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body });

const scope = config.guildId ? `guild ${config.guildId}` : "global";
console.log(`Deployed ${commands.length} slash commands to ${scope}.`);
