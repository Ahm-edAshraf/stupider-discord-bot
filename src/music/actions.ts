import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  SendableChannels,
} from "discord.js";
import type { GuildQueue, Player } from "discord-player";
import { QueryType } from "discord-player";
import {
  buildErrorEmbed,
  buildNowPlayingEmbed,
  buildQueueEmbed,
  buildQueuedEmbed,
  buildStatusEmbed,
  musicControls,
} from "./ui";
import type { MusicMetadata } from "./player";

export type MusicContext = {
  player: Player;
};

type MusicInteraction = ChatInputCommandInteraction | ButtonInteraction;

function asGuildMember(interaction: MusicInteraction): GuildMember | null {
  return interaction.inCachedGuild() ? interaction.member : null;
}

async function replyError(interaction: MusicInteraction, description: string) {
  const payload = { embeds: [buildErrorEmbed(description)], ephemeral: true };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

function getQueue(player: Player, guildId: string): GuildQueue<MusicMetadata> | null {
  return player.nodes.get<MusicMetadata>(guildId);
}

function getUserVoiceChannel(interaction: MusicInteraction) {
  return asGuildMember(interaction)?.voice.channel ?? null;
}

function getBotVoiceChannel(interaction: MusicInteraction) {
  return interaction.inCachedGuild() ? interaction.guild.members.me?.voice.channel ?? null : null;
}

async function ensureSameVoiceChannel(interaction: MusicInteraction, requireBot = true) {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, "Use this command inside a server.");
    return null;
  }

  const userChannel = getUserVoiceChannel(interaction);
  if (!userChannel) {
    await replyError(interaction, "Join a voice channel first.");
    return null;
  }

  const botChannel = getBotVoiceChannel(interaction);
  if (requireBot && !botChannel) {
    await replyError(interaction, "I am not connected to a voice channel.");
    return null;
  }

  if (botChannel && botChannel.id !== userChannel.id) {
    await replyError(interaction, `Join ${botChannel.name} to control the music.`);
    return null;
  }

  return userChannel;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function playMusic(interaction: ChatInputCommandInteraction, context: MusicContext) {
  const channel = await ensureSameVoiceChannel(interaction, false);
  if (!channel) {
    return;
  }

  const query = interaction.options.getString("query", true);
  const existingQueue = interaction.guildId ? getQueue(context.player, interaction.guildId) : null;
  const wasPlaying = existingQueue?.isPlaying() ?? false;

  await interaction.deferReply();

  try {
    const result = await context.player.play<MusicMetadata>(channel, query, {
      requestedBy: interaction.user,
      searchEngine: QueryType.AUTO,
      fallbackSearchEngine: QueryType.YOUTUBE_SEARCH,
      nodeOptions: {
        metadata: {
          channel: interaction.channel as SendableChannels,
        },
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 60_000,
        leaveOnStop: true,
        leaveOnStopCooldown: 5_000,
        selfDeaf: true,
        bufferingTimeout: 30_000,
        volume: 75,
      },
    });

    const queue = result.queue;
    const currentTrack = queue.currentTrack ?? result.track;

    if (wasPlaying) {
      await interaction.editReply({
        embeds: [buildQueuedEmbed(result.track, queue.tracks.size)],
        components: musicControls(),
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        buildStatusEmbed(
          "Starting playback",
          `Loading [${currentTrack.title}](${currentTrack.url}) in ${channel.name}.`,
        ),
      ],
      components: musicControls(),
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          `I could not play that YouTube result. Try another link/search, or check YOUTUBE_COOKIE if YouTube is blocking the droplet.\n\n\`${extractErrorMessage(error).slice(0, 500)}\``,
        ),
      ],
      components: [],
    });
  }
}

export async function showQueue(interaction: ChatInputCommandInteraction, context: MusicContext) {
  if (!interaction.guildId) {
    await replyError(interaction, "Use this command inside a server.");
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue || (!queue.currentTrack && queue.tracks.size === 0)) {
    await replyError(interaction, "There is nothing in the queue.");
    return;
  }

  const page = interaction.options.getInteger("page") ?? 1;
  await interaction.reply({
    embeds: [buildQueueEmbed(queue, page)],
    components: musicControls(),
  });
}

export async function showNowPlaying(interaction: ChatInputCommandInteraction, context: MusicContext) {
  if (!interaction.guildId) {
    await replyError(interaction, "Use this command inside a server.");
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  const track = queue?.currentTrack;

  if (!queue || !track) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  await interaction.reply({
    embeds: [buildNowPlayingEmbed(queue, track)],
    components: musicControls(),
  });
}

export async function pauseMusic(interaction: MusicInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue?.currentTrack) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  queue.node.pause();
  await respondWithStatus(interaction, "Paused", "Playback is paused.");
}

export async function resumeMusic(interaction: MusicInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue?.currentTrack) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  queue.node.resume();
  await respondWithStatus(interaction, "Resumed", "Playback is running.");
}

export async function skipMusic(interaction: MusicInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue?.currentTrack) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  const skipped = queue.node.skip();
  await respondWithStatus(
    interaction,
    skipped ? "Skipped" : "Skip failed",
    skipped ? "Moving to the next track." : "There was no next track to play.",
  );
}

export async function stopMusic(interaction: MusicInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue) {
    await replyError(interaction, "I am not playing anything.");
    return;
  }

  queue.delete();
  await respondWithStatus(interaction, "Stopped", "Cleared the queue and left voice.");
}

export async function setVolume(interaction: ChatInputCommandInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  if (!queue?.currentTrack) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  const volume = interaction.options.getInteger("percent", true);
  queue.node.setVolume(volume);

  await interaction.reply({
    embeds: [buildStatusEmbed("Volume updated", `Volume is now ${volume}%.`)],
    ephemeral: true,
  });
}

export async function handleMusicButton(interaction: ButtonInteraction, context: MusicContext) {
  const action = interaction.customId.replace("music:", "");

  if (action === "pause") return pauseMusic(interaction, context);
  if (action === "resume") return resumeMusic(interaction, context);
  if (action === "skip") return skipMusic(interaction, context);
  if (action === "stop") return stopMusic(interaction, context);
  if (action === "refresh") return refreshMusic(interaction, context);

  if (action === "queue") {
    if (!interaction.guildId) {
      await replyError(interaction, "Use this button inside a server.");
      return;
    }

    const queue = getQueue(context.player, interaction.guildId);
    if (!queue || (!queue.currentTrack && queue.tracks.size === 0)) {
      await replyError(interaction, "There is nothing in the queue.");
      return;
    }

    await interaction.reply({
      embeds: [buildQueueEmbed(queue)],
      components: musicControls(),
    });
    return;
  }

  await replyError(interaction, "Unknown music control.");
}

async function refreshMusic(interaction: ButtonInteraction, context: MusicContext) {
  if (!interaction.guildId || !(await ensureSameVoiceChannel(interaction))) {
    return;
  }

  const queue = getQueue(context.player, interaction.guildId);
  const track = queue?.currentTrack;

  if (!queue || !track) {
    await replyError(interaction, "Nothing is playing right now.");
    return;
  }

  await interaction.update({
    embeds: [buildNowPlayingEmbed(queue, track)],
    components: musicControls(),
  });
}

async function respondWithStatus(interaction: MusicInteraction, title: string, description: string) {
  const payload = {
    embeds: [buildStatusEmbed(title, description)],
    components: title === "Stopped" ? musicControls(true) : musicControls(),
  };

  if (interaction.isButton()) {
    await interaction.reply(payload);
    return;
  }

  await interaction.reply(payload);
}
