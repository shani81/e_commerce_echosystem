import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaType } from '@aicos/db';
import ffmpegStatic from 'ffmpeg-static';
import type { AiImage } from '@aicos/ai-core';

/** The bits of a MediaAsset the sampler needs to fetch + classify the source. */
export interface SourceMedia {
  id: string;
  bucket: string;
  objectKey: string;
  mimeType: string | null;
  type: MediaType;
}

/** One sampled frame: a vision-ready image plus where in the source it came from. */
export interface SampledFrame {
  frameIndex: number;
  timestampMs: number | null;
  image: AiImage;
}

const DEFAULT_FPS = 1; // sample one frame per second of footage
const SCALE_WIDTH = 768; // downscale frames to keep vision payloads small

/**
 * Samples vision-ready frames from an uploaded shelf video (or photo) — JOB 1 of
 * the extraction flagship. Downloads the source from S3/MinIO, then:
 *  - video → ffmpeg samples up to `maxFrames` downscaled JPEGs (1 fps),
 *  - image → the bytes pass through as a single frame.
 *
 * Every failure path (no object store configured, missing object, ffmpeg error)
 * returns an empty array so the processor can fall back to its deterministic
 * mock — the pipeline and human-review gate stay exercisable with or without
 * real media or AI keys.
 */
@Injectable()
export class FrameSamplerService {
  private readonly logger = new Logger(FrameSamplerService.name);
  private readonly s3: S3Client | null;
  private readonly ffmpegPath: string | null;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    if (endpoint && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        endpoint,
        region: config.get<string>('S3_REGION') ?? 'us-east-1',
        credentials: { accessKeyId, secretAccessKey },
        // MinIO + most self-hosted stores need path-style addressing.
        forcePathStyle: (config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') !== 'false',
      });
    } else {
      this.s3 = null;
    }
    // Alpine can't run the glibc ffmpeg-static binary, so the worker image installs
    // ffmpeg via apk and points FFMPEG_PATH at it; locally we use ffmpeg-static.
    this.ffmpegPath = config.get<string>('FFMPEG_PATH') || ffmpegStatic || null;
  }

  /** True when both an object store and an ffmpeg binary are available. */
  get ready(): boolean {
    return this.s3 !== null && this.ffmpegPath !== null;
  }

  /**
   * Fetch `media` and return up to `maxFrames` vision-ready frames. Returns `[]`
   * (never throws) when sampling can't run, so callers degrade to the mock.
   */
  async sample(media: SourceMedia, maxFrames: number): Promise<SampledFrame[]> {
    if (!this.s3) {
      this.logger.warn('frame sampling skipped — object store not configured');
      return [];
    }
    try {
      const bytes = await this.download(media.bucket, media.objectKey);
      if (!isVideo(media)) {
        return [
          {
            frameIndex: 0,
            timestampMs: 0,
            image: { base64: bytes.toString('base64'), mimeType: media.mimeType ?? 'image/jpeg' },
          },
        ];
      }
      if (!this.ffmpegPath) {
        this.logger.warn('frame sampling skipped — no ffmpeg binary (set FFMPEG_PATH)');
        return [];
      }
      const frames = await extractVideoFrames(this.ffmpegPath, bytes, maxFrames);
      return frames.map((buf, i) => ({
        frameIndex: i,
        timestampMs: Math.round((i * 1000) / DEFAULT_FPS),
        image: { base64: buf.toString('base64'), mimeType: 'image/jpeg' },
      }));
    } catch (err) {
      this.logger.warn(
        `frame sampling failed — falling back to mock: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return [];
    }
  }

  private async download(bucket: string, key: string): Promise<Buffer> {
    const out = await this.s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = out.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body) throw new Error(`empty body for s3://${bucket}/${key}`);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
}

/** Whether the source should be decoded as video (vs. used as a single image). */
export function isVideo(media: Pick<SourceMedia, 'type' | 'mimeType'>): boolean {
  return media.type === MediaType.VIDEO || (media.mimeType?.startsWith('video/') ?? false);
}

/** ffmpeg args to sample up to `maxFrames` downscaled JPEGs at {@link DEFAULT_FPS}. */
export function buildVideoFrameArgs(inputPath: string, outPattern: string, maxFrames: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vf',
    `fps=${DEFAULT_FPS},scale=${SCALE_WIDTH}:-2`,
    '-frames:v',
    String(Math.max(1, maxFrames)),
    '-q:v',
    '4',
    '-f',
    'image2',
    outPattern,
  ];
}

/**
 * Run ffmpeg over an in-memory video and return the sampled JPEG frames.
 * Standalone (takes the binary path, no DI) so it's unit- and script-verifiable.
 */
export async function extractVideoFrames(
  ffmpegPath: string,
  input: Buffer,
  maxFrames: number,
): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aicos-extract-'));
  const inputPath = join(dir, 'input');
  const outPattern = join(dir, 'frame_%03d.jpg');
  try {
    await writeFile(inputPath, input);
    await runFfmpeg(ffmpegPath, buildVideoFrameArgs(inputPath, outPattern, maxFrames));
    const files = (await readdir(dir))
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();
    return Promise.all(files.map((f) => readFile(join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`)),
    );
  });
}
