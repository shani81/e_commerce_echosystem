import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaType } from '@aicos/db';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
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

const DEFAULT_FPS = 1; // fallback when duration is unknown
const MIN_FPS = 0.05; // never slower than ~1 frame / 20s
const MAX_FPS = 30; // never faster than the source
const SCALE_WIDTH = 768; // downscale frames to keep vision payloads small
const HASH_W = 9; // dHash source width (9 cols → 8 horizontal comparisons)
const HASH_H = 8; // dHash source height (8 rows → 64-bit hash)
const DEDUP_HAMMING = 6; // frames within this Hamming distance are near-duplicates

/**
 * Samples vision-ready frames from an uploaded shelf video (or photo) — JOB 1 of
 * the extraction flagship, with the P-refinements:
 *  - **even-spaced** sampling: ffprobe reads the duration and frames are spread
 *    across the whole clip (fps = maxFrames / duration), not just the first
 *    seconds;
 *  - **perceptual dedup**: a 9×8 grayscale dHash per frame drops near-identical
 *    frames (camera lingering) so the vision model sees a diverse set.
 * Images pass through unchanged. Every failure path (no object store, missing
 * object, ffmpeg/ffprobe error) returns an empty array so the processor falls
 * back to its deterministic mock — the pipeline stays exercisable everywhere.
 */
@Injectable()
export class FrameSamplerService {
  private readonly logger = new Logger(FrameSamplerService.name);
  private readonly s3: S3Client | null;
  private readonly ffmpegPath: string | null;
  private readonly ffprobePath: string | null;

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
    // Alpine can't run the glibc ffmpeg-static/ffprobe-static binaries, so the
    // worker image installs ffmpeg (which bundles ffprobe) via apk and sets
    // FFMPEG_PATH/FFPROBE_PATH; locally we use the static binaries.
    this.ffmpegPath = config.get<string>('FFMPEG_PATH') || ffmpegStatic || null;
    this.ffprobePath = config.get<string>('FFPROBE_PATH') || ffprobeStatic?.path || null;
  }

  /** True when both an object store and an ffmpeg binary are available. */
  get ready(): boolean {
    return this.s3 !== null && this.ffmpegPath !== null;
  }

  /**
   * Fetch `media` and return up to `maxFrames` deduplicated, vision-ready frames.
   * Returns `[]` (never throws) when sampling can't run, so callers degrade.
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
      const frames = await extractVideoFrames(this.ffmpegPath, this.ffprobePath, bytes, maxFrames);
      return frames.map((f, i) => ({
        frameIndex: i,
        timestampMs: f.timestampMs,
        image: { base64: f.jpeg.toString('base64'), mimeType: 'image/jpeg' },
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

/** Frames/second to spread `maxFrames` evenly across a `durationSec` clip. */
export function computeFps(durationSec: number | null, maxFrames: number): number {
  if (!durationSec || durationSec <= 0 || maxFrames <= 0) return DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, maxFrames / durationSec));
}

/** 64-bit difference hash from a {@link HASH_W}×{@link HASH_H} grayscale chunk. */
export function dHash(gray: Buffer): bigint {
  let bits = 0n;
  let pos = 0n;
  for (let row = 0; row < HASH_H; row++) {
    for (let col = 0; col < HASH_H; col++) {
      const left = gray[row * HASH_W + col] ?? 0;
      const right = gray[row * HASH_W + col + 1] ?? 0;
      if (left > right) bits |= 1n << pos;
      pos++;
    }
  }
  return bits;
}

/** Hamming distance between two 64-bit hashes. */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** Greedily keep frames that differ from every kept frame by ≥ `threshold` bits. */
export function dedupeByHash<T extends { hash: bigint }>(frames: T[], threshold = DEDUP_HAMMING): T[] {
  const kept: T[] = [];
  for (const f of frames) {
    if (kept.every((k) => hamming(k.hash, f.hash) >= threshold)) kept.push(f);
  }
  return kept;
}

/** ffmpeg args for two aligned outputs: downscaled JPEGs + a 9×8 gray hash strip. */
export function buildVideoFrameArgs(
  inputPath: string,
  jpegPattern: string,
  hashPath: string,
  fps: number,
  maxFrames: number,
): string[] {
  const n = String(Math.max(1, maxFrames));
  const vf = `fps=${fps}`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    // Output 1 — vision frames.
    '-vf',
    `${vf},scale=${SCALE_WIDTH}:-2`,
    '-frames:v',
    n,
    '-q:v',
    '4',
    '-f',
    'image2',
    jpegPattern,
    // Output 2 — tiny grayscale strip for perceptual hashing (same fps → aligned).
    '-vf',
    `${vf},scale=${HASH_W}:${HASH_H},format=gray`,
    '-frames:v',
    n,
    '-f',
    'rawvideo',
    hashPath,
  ];
}

/**
 * Run ffmpeg over an in-memory video and return deduplicated JPEG frames spread
 * evenly across the clip. Standalone (takes binary paths, no DI) so it's unit-
 * and script-verifiable. `ffprobePath` may be null → falls back to {@link DEFAULT_FPS}.
 */
export async function extractVideoFrames(
  ffmpegPath: string,
  ffprobePath: string | null,
  input: Buffer,
  maxFrames: number,
): Promise<{ timestampMs: number; jpeg: Buffer }[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aicos-extract-'));
  const inputPath = join(dir, 'input');
  const jpegPattern = join(dir, 'frame_%03d.jpg');
  const hashPath = join(dir, 'hashes.gray');
  try {
    await writeFile(inputPath, input);
    const duration = ffprobePath ? await probeDuration(ffprobePath, inputPath) : null;
    const fps = computeFps(duration, maxFrames);

    await runFfmpeg(ffmpegPath, buildVideoFrameArgs(inputPath, jpegPattern, hashPath, fps, maxFrames));

    const files = (await readdir(dir))
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();
    const jpegs = await Promise.all(files.map((f) => readFile(join(dir, f))));

    // Read the aligned 9×8 gray strip (one HASH_W*HASH_H chunk per frame).
    let hashes: bigint[] = [];
    try {
      const raw = await readFile(hashPath);
      const per = HASH_W * HASH_H;
      for (let i = 0; i + per <= raw.length; i += per) hashes.push(dHash(raw.subarray(i, i + per)));
    } catch {
      hashes = [];
    }

    const frames = jpegs.map((jpeg, i) => ({
      timestampMs: Math.round((i * 1000) / fps),
      jpeg,
      hash: hashes[i] ?? null,
    }));

    // Dedupe only when every frame got an aligned hash; otherwise keep all (safe).
    const allHashed = frames.length > 0 && frames.every((f) => f.hash !== null);
    const kept = allHashed
      ? dedupeByHash(
          frames.map((f) => ({ timestampMs: f.timestampMs, jpeg: f.jpeg, hash: f.hash as bigint })),
        )
      : frames;

    return kept.map((f) => ({ timestampMs: f.timestampMs, jpeg: f.jpeg }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** ffprobe the container/format duration in seconds (null on any failure). */
async function probeDuration(ffprobePath: string, inputPath: string): Promise<number | null> {
  try {
    const out = await runCapture(ffprobePath, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      inputPath,
    ]);
    const parsed = JSON.parse(out) as { format?: { duration?: string } };
    const d = Number(parsed.format?.duration);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
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

function runCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    proc.stdout.on('data', (d) => {
      stdout += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited ${code}`))));
  });
}
