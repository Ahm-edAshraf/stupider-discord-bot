import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { GuildQueue, Track } from "discord-player";

const embedColor = 0x1db954;
const errorColor = 0xed4245;
const idleColor = 0x5865f2;

export function musicControls(disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("music:pause")
        .setLabel("Pause")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId("music:resume")
        .setLabel("Resume")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId("music:skip")
        .setLabel("Skip")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId("music:queue")
        .setLabel("Queue")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId("music:stop")
        .setLabel("Stop")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("music:refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

export function buildNowPlayingEmbed(queue: GuildQueue, track: Track) {
  const progress = queue.node.createProgressBar({
    length: 18,
    timecodes: true,
  }) ?? "`00:00` ------------------ `00:00`";

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle("Now playing")
    .setURL(track.url)
    .setDescription(`[${track.title}](${track.url})`)
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: "Artist", value: track.author || "Unknown", inline: true },
      { name: "Duration", value: track.duration || "Live", inline: true },
      { name: "Volume", value: `${queue.node.volume}%`, inline: true },
      { name: "Requested by", value: track.requestedBy?.toString() ?? "Unknown", inline: true },
      { name: "Up next", value: `${queue.tracks.size} track${queue.tracks.size === 1 ? "" : "s"}`, inline: true },
      { name: "Status", value: queue.node.isPaused() ? "Paused" : "Playing", inline: true },
      { name: "Progress", value: progress },
    )
    .setFooter({ text: "Use the buttons below or slash commands to control playback." });
}

export function buildQueuedEmbed(track: Track, position: number) {
  return new EmbedBuilder()
    .setColor(idleColor)
    .setTitle("Added to queue")
    .setURL(track.url)
    .setDescription(`[${track.title}](${track.url})`)
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: "Artist", value: track.author || "Unknown", inline: true },
      { name: "Duration", value: track.duration || "Live", inline: true },
      { name: "Position", value: `#${position}`, inline: true },
    );
}

export function buildQueueEmbed(queue: GuildQueue, page = 1) {
  const tracks = queue.tracks.toArray();
  const pageSize = 10;
  const maxPage = Math.max(1, Math.ceil(tracks.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), maxPage);
  const start = (safePage - 1) * pageSize;
  const pageTracks = tracks.slice(start, start + pageSize);
  const current = queue.currentTrack;

  const queuedList = pageTracks.length
    ? pageTracks
        .map((track, index) => {
          const position = start + index + 1;
          return `**${position}.** [${track.title}](${track.url}) - ${track.duration || "Live"}`;
        })
        .join("\n")
    : "No queued tracks.";

  return new EmbedBuilder()
    .setColor(idleColor)
    .setTitle("Music queue")
    .setDescription(current ? `Current: [${current.title}](${current.url})` : "Nothing is playing.")
    .addFields({ name: `Up next - page ${safePage}/${maxPage}`, value: queuedList })
    .setFooter({ text: `${tracks.length} queued track${tracks.length === 1 ? "" : "s"}` });
}

export function buildStatusEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(idleColor)
    .setTitle(title)
    .setDescription(description);
}

export function buildErrorEmbed(description: string) {
  return new EmbedBuilder()
    .setColor(errorColor)
    .setTitle("Music error")
    .setDescription(description);
}
