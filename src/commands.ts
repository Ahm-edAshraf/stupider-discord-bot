import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";

export type BotCommand = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const ping: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency."),
  async execute(interaction) {
    const sentAt = Date.now();
    await interaction.reply({ content: "Pong.", ephemeral: true });
    const latencyMs = Date.now() - sentAt;
    await interaction.editReply(`Pong. Response time: ${latencyMs}ms.`);
  },
};

const join: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your current voice channel."),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "Use this command inside a server.",
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member;
    if (!(member instanceof GuildMember) || !member.voice.channel) {
      await interaction.reply({
        content: "Join a voice channel first.",
        ephemeral: true,
      });
      return;
    }

    const channel = member.voice.channel;
    joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    await interaction.reply({
      content: `Joined ${channel.name}.`,
      ephemeral: true,
    });
  },
};

const leave: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave the current voice channel."),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Use this command inside a server.",
        ephemeral: true,
      });
      return;
    }

    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) {
      await interaction.reply({
        content: "I am not connected to a voice channel.",
        ephemeral: true,
      });
      return;
    }

    connection.destroy();
    await interaction.reply({ content: "Left the voice channel.", ephemeral: true });
  },
};

export const commands = [ping, join, leave];
export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
