import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  /** Laplacian-variance sharpness (higher = sharper); null if not computed. */
  blurScore: number | null;
  image: AiImage;
}

const DEFAULT_FPS = 1; // fallback when duration is unknown
const MIN_FPS = 0.05; // never slower than ~1 frame / 20s
const MAX_FPS = 30; // never faster than the source
const SCALE_WIDTH = 768; // downscale frames to keep vision payloads small
const HASH_W = 9; // dHash source width (9 cols → 8 horizontal comparisons)
const HASH_H = 8; // dHash source height (8 rows → 64-bit hash)
const DEDUP_HAMMING = 6; // frames within this Hamming distance are near-duplicates
const BLUR_W = 64; // sharpness-measure render size (square; aspect irrelevant for variance)
const BLUR_H = 64;
const BLUR_REL = 0.5; // drop frames sharper-than this fraction of the median, keep ≥ MIN_KEEP
const MIN_KEEP = 2; // never blur-prune below this many frames

/**
 * Samples vision-ready frames from an uploaded shelf video (or photo) — JOB 1 of
 * the extraction flagship, with the P-refinements:
 *  - **even-spaced** sampling: ffprobe reads the duration and frames are spread
 *    across the whole clip (fps = maxFrames / duration), not just the first
 *    seconds;
 *  - **perceptual dedup**: a 9×8 grayscale dHash per frame drops near-identical
 *    frames (camera lingering) so the vision model sees a diverse set;
 *  - **blur scoring**: a 64×64 grayscale Laplacian-variance per frame drops
 *    motion-blurred frames (and is persisted on each ExtractionFrame).
 * Images pass through unchanged. Every failure path (no object store, missing
 * object, ffmpeg/ffprobe error) returns an empty array so the processor falls
 * back to its deterministic mock — the pipeline stays exercisable everywhere.
 */
@Injectable()
export class FrameSamplerService {
  private readonly logger = new Logger(FrameSamplerService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;
  private readonly ffmpegPath: string | null;
  private readonly ffprobePath: string | null;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    this.bucket = config.get<string>('S3_BUCKET') ?? null;
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

  /** The bucket frame thumbnails are uploaded to (null when not configured). */
  get uploadBucket(): string | null {
    return this.s3 !== null ? this.bucket : null;
  }

  /** Upload a frame JPEG to object storage (best-effort). Returns success. */
  async uploadFrame(key: string, jpeg: Buffer): Promise<boolean> {
    if (!this.s3 || !this.bucket) return false;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: jpeg,
          ContentType: 'image/jpeg',
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`frame upload failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return false;
    }
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
            blurScore: null,
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
        blurScore: f.blurScore,
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

/**
 * Variance of the Laplacian over a `w`×`h` grayscale buffer — the classic focus
 * measure. Higher = sharper; motion-blur / out-of-focus frames score low.
 */
export function laplacianVariance(gray: Buffer, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * (gray[i] ?? 0) -
        (gray[i - 1] ?? 0) -
        (gray[i + 1] ?? 0) -
        (gray[i - w] ?? 0) -
        (gray[i + w] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Indices (ascending) of frames to keep after blur-pruning: drop frames far
 * below the median sharpness, but never below `minKeep` (then keep the sharpest).
 */
export function sharpFrameIndices(blurScores: number[], relThreshold = BLUR_REL, minKeep = MIN_KEEP): number[] {
  const all = blurScores.map((_, i) => i);
  if (blurScores.length <= minKeep) return all;
  const sorted = [...blurScores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const floor = median * relThreshold;
  const sharp = all.filter((i) => (blurScores[i] ?? 0) >= floor);
  if (sharp.length >= minKeep) return sharp;
  // Everything is ~blurry → keep the sharpest `minKeep`, in temporal order.
  return [...all]
    .sort((a, b) => (blurScores[b] ?? 0) - (blurScores[a] ?? 0))
    .slice(0, minKeep)
    .sort((a, b) => a - b);
}

/** ffmpeg args for three aligned outputs: JPEGs + a 9×8 hash strip + a 64×64 blur strip. */
export function buildVideoFrameArgs(
  inputPath: string,
  jpegPattern: string,
  hashPath: string,
  blurPath: string,
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
    // Output 3 — 64×64 grayscale strip for the Laplacian-variance blur score.
    '-vf',
    `${vf},scale=${BLUR_W}:${BLUR_H},format=gray`,
    '-frames:v',
    n,
    '-f',
    'rawvideo',
    blurPath,
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
): Promise<{ timestampMs: number; jpeg: Buffer; blurScore: number | null }[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aicos-extract-'));
  const inputPath = join(dir, 'input');
  const jpegPattern = join(dir, 'frame_%03d.jpg');
  const hashPath = join(dir, 'hashes.gray');
  const blurPath = join(dir, 'blur.gray');
  try {
    await writeFile(inputPath, input);
    const duration = ffprobePath ? await probeDuration(ffprobePath, inputPath) : null;
    const fps = computeFps(duration, maxFrames);

    await runFfmpeg(
      ffmpegPath,
      buildVideoFrameArgs(inputPath, jpegPattern, hashPath, blurPath, fps, maxFrames),
    );

    const files = (await readdir(dir))
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();
    const jpegs = await Promise.all(files.map((f) => readFile(join(dir, f))));

    // Aligned 9×8 gray strip → dHash per frame.
    const hashes = await readChunks(hashPath, HASH_W * HASH_H, (c) => dHash(c));
    // Aligned 64×64 gray strip → Laplacian-variance blur score per frame.
    const blurs = await readChunks(blurPath, BLUR_W * BLUR_H, (c) => laplacianVariance(c, BLUR_W, BLUR_H));

    interface WorkFrame {
      timestampMs: number;
      jpeg: Buffer;
      hash: bigint | null;
      blurScore: number | null;
    }
    let kept: WorkFrame[] = jpegs.map((jpeg, i) => ({
      timestampMs: Math.round((i * 1000) / fps),
      jpeg,
      hash: hashes[i] ?? null,
      blurScore: blurs[i] ?? null,
    }));

    // 1) Blur-prune motion-blurred frames (only when every frame has a score).
    if (kept.length > 0 && kept.every((f) => f.blurScore !== null)) {
      const keep = new Set(sharpFrameIndices(kept.map((f) => f.blurScore as number)));
      kept = kept.filter((_, i) => keep.has(i));
    }

    // 2) Dedup near-identical survivors (only when every survivor has a hash).
    if (kept.length > 0 && kept.every((f) => f.hash !== null)) {
      kept = dedupeByHash(kept as (WorkFrame & { hash: bigint })[]);
    }

    return kept.map((f) => ({ timestampMs: f.timestampMs, jpeg: f.jpeg, blurScore: f.blurScore }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Read a concatenated raw file as fixed-size chunks, mapping each chunk. */
async function readChunks<T>(path: string, chunkBytes: number, map: (chunk: Buffer) => T): Promise<T[]> {
  try {
    const raw = await readFile(path);
    const out: T[] = [];
    for (let i = 0; i + chunkBytes <= raw.length; i += chunkBytes) {
      out.push(map(raw.subarray(i, i + chunkBytes)));
    }
    return out;
  } catch {
    return [];
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
