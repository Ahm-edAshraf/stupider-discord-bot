import { Player } from "discord-player";
import type { Track } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client, SendableChannels } from "discord.js";
import youtubeDl from "youtube-dl-exec";
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

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  return String(error);
}

async function createYoutubeDlStream(track: Track) {
  const headers = config.youtubeCookie
    ? [`Cookie: ${config.youtubeCookie}`, "User-Agent: Mozilla/5.0"]
    : ["User-Agent: Mozilla/5.0"];

  const process = youtubeDl.exec(track.url, {
    format: track.live ? "best[height<=360]" : "bestaudio/best",
    output: "-",
    addHeader: headers,
    noWarnings: true,
    noProgress: true,
    quiet: true,
  });

  process.catch((error) => {
    console.error(`yt-dlp failed for ${track.title}:`, error);
  });

  if (!process.stdout) {
    throw new Error("yt-dlp did not return an audio stream.");
  }

  const stopProcess = () => {
    if (!process.killed) {
      process.kill();
    }
  };

  process.stdout.on("close", stopProcess);
  process.stdout.on("error", stopProcess);
  process.stdout.on("end", stopProcess);

  return process.stdout;
}

export async function createMusicPlayer(client: Client): Promise<Player> {
  const player = new Player(client, {
    connectionTimeout: 30_000,
    probeTimeout: 15_000,
  });

  console.log(
    `YouTube cookie configured: ${config.youtubeCookie ? `yes (${config.youtubeCookie.length} chars)` : "no"}.`,
  );

  await player.extractors.register(YoutubeiExtractor, {
    cookie: config.youtubeCookie,
    ignoreSignInErrors: true,
    createStream: createYoutubeDlStream,
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
      embeds: [
        buildErrorEmbed(
          `I could not play **${track.title}**.\n\nReason: \`${errorSummary(error).slice(0, 700)}\``,
        ),
      ],
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
