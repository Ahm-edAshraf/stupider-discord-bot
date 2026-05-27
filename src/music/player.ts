import { Player } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client, SendableChannels } from "discord.js";
import { config } from "../config";
import { buildErrorEmbed, buildNowPlayingEmbed, musicControls } from "./ui";

export type MusicMetadata = {
  channel: SendableChannels;
};

async function sendToMusicChannel(
  metadata: MusicMetadata | null | undefined,
  payload: Parameters<SendableChannels["send"]>[0],
) {
  try {
    await metadata?.channel.send(payload);
  } catch (error) {
    console.error("Failed to send music status message:", error);
  }
}

export async function createMusicPlayer(client: Client): Promise<Player> {
  const player = new Player(client, {
    connectionTimeout: 30_000,
    probeTimeout: 15_000,
  });

  await player.extractors.register(YoutubeiExtractor, {
    cookie: config.youtubeCookie,
    streamOptions: {
      highWaterMark: 1 << 24,
    },
  });

  player.events.on("error", (queue, error) => {
    console.error(`Music queue error in ${queue.guild.name}:`, error);
    void sendToMusicChannel(queue.metadata as MusicMetadata | null, {
      embeds: [buildErrorEmbed("The music queue hit an error. Try the track again or use `/stop`.")],
    });
  });

  player.events.on("playerError", (queue, error, track) => {
    console.error(`Music player error in ${queue.guild.name} for ${track.title}:`, error);
    void sendToMusicChannel(queue.metadata as MusicMetadata | null, {
      embeds: [buildErrorEmbed(`I could not play **${track.title}**. YouTube may be blocking this stream.`)],
    });
  });

  player.events.on("playerStart", (queue, track) => {
    void sendToMusicChannel(queue.metadata as MusicMetadata | null, {
      embeds: [buildNowPlayingEmbed(queue, track)],
      components: musicControls(),
    });
  });

  return player;
}
