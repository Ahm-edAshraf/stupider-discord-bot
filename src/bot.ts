import { Client, Events, GatewayIntentBits } from "discord.js";
import { AiController } from "./ai/controller";
import { commandMap } from "./commands";
import { config } from "./config";
import { handleMusicButton } from "./music/actions";
import { createMusicPlayer } from "./music/player";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
});

const player = await createMusicPlayer(client);
const ai = new AiController();
const context = { player, ai };

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith("music:")) {
    try {
      await handleMusicButton(interaction, context);
    } catch (error) {
      console.error(`Music button failed: ${interaction.customId}`, error);
      const response = {
        content: "Something went wrong while running that music control.",
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: "Unknown command.",
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction, context);
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    const response = {
      content: "Something went wrong while running that command.",
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await ai.handleMessage(message);
  } catch (error) {
    console.error("AI message handler failed:", error);
  }
});

client.login(config.token);
