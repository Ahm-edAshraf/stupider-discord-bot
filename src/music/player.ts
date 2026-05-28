import { Player, StreamType } from "discord-player";
import type { ExtractorStreamable, Track } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client, SendableChannels } from "discord.js";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { Readable } from "node:stream";
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

const streamHeaders = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

function isWebmOpusUrl(streamUrl: string) {
  try {
    const url = new URL(streamUrl);
    const mime = url.searchParams.get("mime")?.toLowerCase() ?? "";
    return mime === "audio/webm" || mime.includes("webm");
  } catch {
    return false;
  }
}

function openNodeReadable(url: string, redirectsLeft = 3): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const get = parsedUrl.protocol === "http:" ? httpGet : httpsGet;
    const request = get(url, { headers: streamHeaders }, (response) => {
      const status = response.statusCode ?? 0;
      const redirect = response.headers.location;

      if (status >= 300 && status < 400 && redirect && redirectsLeft > 0) {
        response.destroy();
        const redirectUrl = new URL(redirect, url).toString();
        void openNodeReadable(redirectUrl, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Googlevideo stream fetch failed with HTTP ${status}.`));
        return;
      }

      response.once("error", reject);
      resolve(response);
    });

    request.once("error", reject);
    request.setTimeout(15_000, () => {
      request.destroy(new Error("Googlevideo stream connection timed out."));
    });
  });
}

async function createWebmOpusStream(streamUrl: string): Promise<ExtractorStreamable> {
  return {
    $fmt: StreamType.WebmOpus,
    stream: await openNodeReadable(streamUrl),
  };
}

async function createYoutubeDlStream(track: Track): Promise<ExtractorStreamable> {
  const jsRuntime = `bun:${process.execPath}` as const;
  const format = track.live
    ? "worst[protocol^=http]/best[protocol^=http]/best"
    : [
        "ba[acodec=opus][ext=webm][abr<=96][protocol^=http]",
        "ba[acodec=opus][ext=webm][abr<=128][protocol^=http]",
        "ba[acodec=opus][ext=webm][abr<=160][protocol^=http]",
        "ba[acodec=opus][ext=webm][protocol^=http]",
        "ba[ext=webm][protocol^=http]",
        "ba[protocol^=http]",
      ].join("/");

  const baseFlags = {
    bufferSize: "64K",
    forceIpv4: true,
    fragmentRetries: 10,
    jsRuntimes: jsRuntime,
    remoteComponents: "ejs:npm",
    noWarnings: true,
    noProgress: true,
    quiet: true,
    retries: 10,
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
      const result = await youtubeDl(track.url, { ...attempt.flags, getUrl: true });
      const streamUrl = String(result).trim().split("\n").find(Boolean);

      if (streamUrl) {
        console.log(`yt-dlp stream URL resolved for ${track.title} via ${attempt.name}.`);
        if (isWebmOpusUrl(streamUrl)) {
          try {
            const stream = await createWebmOpusStream(streamUrl);
            console.log(`Using WebM Opus passthrough for ${track.title}.`);
            return stream;
          } catch (error) {
            console.error(
              `WebM Opus passthrough failed for ${track.title}; falling back to FFmpeg: ${errorSummary(error)}`,
            );
          }
        }

        console.log(`Resolved stream for ${track.title} is not WebM Opus; falling back to FFmpeg.`);
        return streamUrl;
      }

      errors.push(`${attempt.name}: no stream URL returned`);
    } catch (error) {
      const message = errorSummary(error);
      console.error(`yt-dlp stream attempt failed for ${track.title} via ${attempt.name}: ${message}`);
      errors.push(`${attempt.name}: ${message}`);
    }
  }

  const message = `yt-dlp could not resolve a playable stream URL. ${errors.join(" | ").slice(0, 1_000)}`;
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
    createStream: config.youtubeCookiesFile
      ? (createYoutubeDlStream as unknown as (
          track: Track,
          extractor: YoutubeiExtractor,
        ) => Promise<string | Readable>)
      : undefined,
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
