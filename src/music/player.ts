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
  const jsRuntime = `bun:${process.execPath}` as const;
  const format = track.live
    ? "worst[protocol^=http]/best[protocol^=http]/best"
    : "ba[abr<=96][protocol^=http]/ba[abr<=128][protocol^=http]/ba[abr<=160][protocol^=http]/ba[protocol^=http]/ba";

  const baseFlags = {
    jsRuntimes: jsRuntime,
    remoteComponents: "ejs:npm",
    noWarnings: true,
    noProgress: true,
    quiet: true,
    getUrl: true,
  };

  const attempts = [
    {
      name: "cookies default",
      flags: {
        ...baseFlags,
        cookies: config.youtubeCookiesFile,
        format,
      },
    },
    {
      name: "cookies mweb",
      flags: {
        ...baseFlags,
        cookies: config.youtubeCookiesFile,
        extractorArgs: "youtube:player_client=mweb,web_safari",
        format,
      },
    },
    {
      name: "cookies web missing pot",
      flags: {
        ...baseFlags,
        cookies: config.youtubeCookiesFile,
        extractorArgs: "youtube:player_client=web,web_safari;formats=missing_pot",
        format,
      },
    },
    {
      name: "cookies tv",
      flags: {
        ...baseFlags,
        cookies: config.youtubeCookiesFile,
        extractorArgs: "youtube:player_client=tv,tv_embedded,tv_simply",
        format,
      },
    },
    {
      name: "guest mobile clients",
      flags: {
        ...baseFlags,
        extractorArgs: "youtube:player_client=android_vr,web_safari,tv_embedded",
        format,
      },
    },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      console.log(`Resolving yt-dlp stream for ${track.title} via ${attempt.name}.`);
      const result = await youtubeDl(track.url, attempt.flags);
      const streamUrl = String(result).trim().split("\n").find(Boolean);

      if (streamUrl) {
        console.log(`yt-dlp stream resolved for ${track.title} via ${attempt.name}.`);
        return streamUrl;
      }

      errors.push(`${attempt.name}: no stream URL returned`);
    } catch (error) {
      const message = errorSummary(error);
      console.error(`yt-dlp stream attempt failed for ${track.title} via ${attempt.name}: ${message}`);
      errors.push(`${attempt.name}: ${message}`);
    }
  }

  const message = `yt-dlp could not resolve a playable stream. ${errors.join(" | ").slice(0, 1_000)}`;
  console.error(message);
  throw new Error(message);
}

export async function createMusicPlayer(client: Client): Promise<Player> {
  const player = new Player(client, {
    connectionTimeout: 30_000,
    lagMonitor: 10_000,
    probeTimeout: 15_000,
  });

  console.log(
    `YouTube cookie configured: ${config.youtubeCookie ? `yes (${config.youtubeCookie.length} chars)` : "no"}.`,
  );
  console.log(`YouTube cookies file configured: ${config.youtubeCookiesFile ? "yes" : "no"}.`);

  await player.extractors.register(YoutubeiExtractor, {
    cookie: config.youtubeCookie,
    ignoreSignInErrors: true,
    createStream: config.youtubeCookiesFile ? createYoutubeDlStream : undefined,
    useYoutubeDL: !config.youtubeCookiesFile,
    logLevel: "LOW",
    streamOptions: {
      highWaterMark: 1 << 26,
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
