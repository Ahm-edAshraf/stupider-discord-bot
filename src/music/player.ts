import { Player } from "discord-player";
import type { ExtractorStreamable, Track } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client, SendableChannels } from "discord.js";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
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

const tempPathsByTrack = new Map<string, string[]>();

function addTempPath(track: Track, path: string) {
  const paths = tempPathsByTrack.get(track.id) ?? [];
  paths.push(path);
  tempPathsByTrack.set(track.id, paths);
}

async function cleanupTrackTempFiles(track: Track) {
  const paths = tempPathsByTrack.get(track.id) ?? [];
  tempPathsByTrack.delete(track.id);

  await Promise.allSettled(
    paths.map(async (path) => {
      await rm(path, { force: true, recursive: true });
      console.log(`Deleted temp music file: ${path}`);
    }),
  );
}

function scheduleCleanupTrackTempFiles(track: Track, delayMs = 60_000) {
  setTimeout(() => {
    void cleanupTrackTempFiles(track);
  }, delayMs).unref();
}

async function cleanupAllTempFiles() {
  const tracks = [...tempPathsByTrack.keys()];
  const paths = [...tempPathsByTrack.values()].flat();
  tempPathsByTrack.clear();

  await Promise.allSettled(
    paths.map(async (path) => {
      await rm(path, { force: true, recursive: true });
      console.log(`Deleted temp music file: ${path}`);
    }),
  );

  if (tracks.length > 0) {
    console.log(`Cleaned temp files for ${tracks.length} track(s).`);
  }
}

function scheduleCleanupAllTempFiles(delayMs = 60_000) {
  setTimeout(() => {
    void cleanupAllTempFiles();
  }, delayMs).unref();
}

async function createYoutubeDlStream(track: Track): Promise<ExtractorStreamable> {
  const jsRuntime = `bun:${process.execPath}` as const;
  const tempDir = await mkdtemp(join(tmpdir(), "stupider-music-"));
  const webmFile = join(tempDir, "audio.webm");
  const fallbackFile = join(tempDir, "audio");
  addTempPath(track, tempDir);

  const webmFormat = track.live
    ? null
    : [
        "ba[ext=webm][abr<=96]",
        "ba[ext=webm][abr<=128]",
        "ba[ext=webm][abr<=160]",
        "ba[ext=webm]",
      ].join("/");
  const fallbackFormat = track.live
    ? "worst[protocol^=http]/best[protocol^=http]/best"
    : [
        "ba[abr<=96][protocol^=http]",
        "ba[abr<=128][protocol^=http]",
        "ba[abr<=160][protocol^=http]",
        "ba[protocol^=http]",
        "ba",
      ].join("/");

  const baseFlags = {
    forceIpv4: true,
    fragmentRetries: 10,
    jsRuntimes: jsRuntime,
    remoteComponents: "ejs:npm",
    noWarnings: true,
    noProgress: true,
    quiet: true,
    retries: 10,
    noPlaylist: true,
  };

  const clients = [
    { name: "default", extractorArgs: undefined },
    { name: "mweb", extractorArgs: "youtube:player_client=mweb,web_safari" },
    { name: "web missing pot", extractorArgs: "youtube:player_client=web,web_safari;formats=missing_pot" },
    { name: "tv", extractorArgs: "youtube:player_client=tv,tv_embedded,tv_simply" },
    { name: "guest mobile", extractorArgs: "youtube:player_client=android_vr,web_safari,tv_embedded" },
  ];

  const attempts = clients.flatMap((client) => {
    const commonFlags = {
      ...baseFlags,
      cookies: config.youtubeCookiesFile,
      ...(client.extractorArgs ? { extractorArgs: client.extractorArgs } : {}),
    };

    return [
      ...(webmFormat
        ? [
            {
              name: `${client.name} webm`,
              file: webmFile,
              createStream: () => createReadStream(webmFile),
              flags: {
                ...commonFlags,
                format: webmFormat,
                output: webmFile,
              },
            },
          ]
        : []),
      {
        name: `${client.name} fallback`,
        file: fallbackFile,
        createStream: () => createReadStream(fallbackFile),
        flags: {
          ...commonFlags,
          format: fallbackFormat,
          output: fallbackFile,
        },
      },
    ];
  });

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      console.log(`Downloading temp audio for ${track.title} via ${attempt.name}.`);
      await youtubeDl(track.url, attempt.flags);
      console.log(`Downloaded temp audio for ${track.title} via ${attempt.name}: ${attempt.file}`);
      return attempt.createStream();
    } catch (error) {
      const message = errorSummary(error);
      console.error(`yt-dlp download attempt failed for ${track.title} via ${attempt.name}: ${message}`);
      errors.push(`${attempt.name}: ${message}`);
    }
  }

  await cleanupTrackTempFiles(track);

  const message = `yt-dlp could not download a playable temp audio file. ${errors.join(" | ").slice(0, 1_000)}`;
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
    scheduleCleanupTrackTempFiles(track);
    void sendToMusicChannel(queue.metadata as MusicMetadata | null, {
      embeds: [
        buildErrorEmbed(
          `I could not play **${track.title}**.\n\nReason: \`${errorSummary(error).slice(0, 700)}\``,
        ),
      ],
    });
  });

  player.events.on("playerFinish", (_queue, track) => {
    scheduleCleanupTrackTempFiles(track);
  });

  player.events.on("playerSkip", (_queue, track) => {
    scheduleCleanupTrackTempFiles(track);
  });

  player.events.on("queueDelete", () => {
    scheduleCleanupAllTempFiles();
  });

  player.events.on("playerStart", (queue, track) => {
    void sendToMusicChannel(queue.metadata as MusicMetadata | null, {
      embeds: [buildNowPlayingEmbed(queue, track)],
      components: musicControls(),
    });
  });

  return player;
}
