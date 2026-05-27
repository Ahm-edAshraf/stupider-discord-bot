import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import type { MusicContext } from "./music/actions";
import {
  pauseMusic,
  playMusic,
  resumeMusic,
  setVolume,
  showNowPlaying,
  showQueue,
  skipMusic,
  stopMusic,
} from "./music/actions";

export type BotCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: MusicContext) => Promise<void>;
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

const play: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a YouTube link or search result.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("YouTube URL or search terms.")
        .setRequired(true),
    ),
  async execute(interaction, context) {
    await playMusic(interaction, context);
  },
};

const queue: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the music queue.")
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Queue page to show.")
        .setMinValue(1),
    ),
  async execute(interaction, context) {
    await showQueue(interaction, context);
  },
};

const nowPlaying: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the current track."),
  async execute(interaction, context) {
    await showNowPlaying(interaction, context);
  },
};

const pause: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current track."),
  async execute(interaction, context) {
    await pauseMusic(interaction, context);
  },
};

const resume: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume playback."),
  async execute(interaction, context) {
    await resumeMusic(interaction, context);
  },
};

const skip: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current track."),
  async execute(interaction, context) {
    await skipMusic(interaction, context);
  },
};

const stop: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback and clear the queue."),
  async execute(interaction, context) {
    await stopMusic(interaction, context);
  },
};

const volume: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume.")
    .addIntegerOption((option) =>
      option
        .setName("percent")
        .setDescription("Volume from 1 to 100.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    ),
  async execute(interaction, context) {
    await setVolume(interaction, context);
  },
};

const leave: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave the current voice channel."),
  async execute(interaction, context) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Use this command inside a server.",
        ephemeral: true,
      });
      return;
    }

    const queue = context.player.nodes.get(interaction.guildId);
    const connection = getVoiceConnection(interaction.guildId);
    if (!queue && !connection) {
      await interaction.reply({
        content: "I am not connected to a voice channel.",
        ephemeral: true,
      });
      return;
    }

    queue?.delete();
    connection?.destroy();
    await interaction.reply({ content: "Left the voice channel.", ephemeral: true });
  },
};

export const commands = [
  ping,
  join,
  leave,
  play,
  queue,
  nowPlaying,
  pause,
  resume,
  skip,
  stop,
  volume,
];
export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
