import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { MediaType } from '@aicos/db';
import {
  FrameSamplerService,
  buildVideoFrameArgs,
  computeFps,
  dHash,
  dedupeByHash,
  extractVideoFrames,
  hamming,
  isVideo,
  type SourceMedia,
} from './frame-sampler.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

// The real-ffmpeg integration test runs whenever a binary is available
// (the static packages download one on install; CI ubuntu/glibc + local Windows
// both work). It skips gracefully otherwise so the suite never hard-depends on it.
const ffmpegPath = ffmpegStatic ?? null;
const ffprobePath = ffprobeStatic?.path ?? null;
const ffmpegReady = ffmpegPath !== null && existsSync(ffmpegPath);
const itFfmpeg = ffmpegReady ? it : it.skip;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

/** Synthesize a 4s clip from a lavfi source with the always-available mpeg4 encoder. */
async function makeVideo(source: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'aicos-test-vid-'));
  const out = join(dir, 'test.mp4');
  await run(ffmpegPath as string, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', source, '-t', '4',
    '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', out,
  ]);
  const buf = await readFile(out);
  await rm(dir, { recursive: true, force: true });
  return buf;
}

describe('frame-sampler helpers', () => {
  it('isVideo() classifies by MediaType and mime type', () => {
    expect(isVideo({ type: MediaType.VIDEO, mimeType: null })).toBe(true);
    expect(isVideo({ type: MediaType.IMAGE, mimeType: 'video/mp4' })).toBe(true);
    expect(isVideo({ type: MediaType.IMAGE, mimeType: 'image/jpeg' })).toBe(false);
    expect(isVideo({ type: MediaType.IMAGE, mimeType: null })).toBe(false);
  });

  it('computeFps() spreads maxFrames evenly across the duration (clamped)', () => {
    expect(computeFps(null, 6)).toBe(1); // unknown → default
    expect(computeFps(0, 6)).toBe(1);
    expect(computeFps(6, 6)).toBe(1); // 6 frames / 6s
    expect(computeFps(60, 6)).toBeCloseTo(0.1); // spread across a long clip
    expect(computeFps(0.1, 6)).toBe(30); // clamped to MAX_FPS
    expect(computeFps(10000, 6)).toBe(0.05); // clamped to MIN_FPS
  });

  it('buildVideoFrameArgs() emits two aligned outputs (jpeg + gray hash strip)', () => {
    const args = buildVideoFrameArgs('/in.mp4', '/f_%03d.jpg', '/h.gray', 1.5, 6);
    expect(args).toContain('/in.mp4');
    expect(args).toContain('/f_%03d.jpg');
    expect(args).toContain('/h.gray');
    expect(args.filter((a) => a === '-vf')).toHaveLength(2);
    expect(args.filter((a) => a === '-frames:v')).toHaveLength(2);
    const joined = args.join(' ');
    expect(joined).toContain('fps=1.5,scale=768:-2');
    expect(joined).toContain('fps=1.5,scale=9:8,format=gray');
  });

  it('dHash()/hamming() compute a 64-bit difference hash', () => {
    expect(dHash(Buffer.alloc(72, 5))).toBe(0n); // flat → no left>right bits
    // Each 9-wide row strictly decreasing → every left>right → all 64 bits set.
    const desc = Buffer.from(Array.from({ length: 72 }, (_, i) => 9 - (i % 9)));
    expect(dHash(desc)).toBe((1n << 64n) - 1n);
    expect(hamming(0n, 0n)).toBe(0);
    expect(hamming(0b1011n, 0b0001n)).toBe(2);
  });

  it('dedupeByHash() drops near-identical frames, keeps distinct ones', () => {
    const frames = [{ hash: 0n }, { hash: 0b11n }, { hash: 0xffffn }]; // dist 0,2,16 vs first
    const kept = dedupeByHash(frames, 6);
    expect(kept.map((f) => f.hash)).toEqual([0n, 0xffffn]); // 0b11 (dist 2) dropped
  });
});

describe('FrameSamplerService', () => {
  it('is not ready and samples [] when the object store is not configured', async () => {
    const svc = new FrameSamplerService(cfg({}));
    expect(svc.ready).toBe(false);
    const media: SourceMedia = {
      id: 'm1',
      bucket: 'b',
      objectKey: 'k',
      mimeType: 'video/mp4',
      type: MediaType.VIDEO,
    };
    expect(await svc.sample(media, 6)).toEqual([]);
  });
});

describe('extractVideoFrames (real ffmpeg)', () => {
  itFfmpeg(
    'samples evenly-spaced, distinct JPEG frames with increasing timestamps',
    async () => {
      // A zooming fractal → every sampled frame is clearly different → survives dedup.
      const video = await makeVideo('mandelbrot=size=320x240:rate=10');
      const frames = await extractVideoFrames(ffmpegPath as string, ffprobePath, video, 6);
      expect(frames.length).toBeGreaterThan(1);
      expect(frames.length).toBeLessThanOrEqual(6);
      let prev = -1;
      for (const f of frames) {
        expect(f.jpeg[0]).toBe(0xff); // JPEG SOI
        expect(f.jpeg[1]).toBe(0xd8);
        expect(typeof f.timestampMs).toBe('number');
        expect(f.timestampMs).toBeGreaterThan(prev); // monotonic, evenly spaced
        prev = f.timestampMs;
      }
    },
    30000,
  );

  itFfmpeg(
    'dedupes a static clip down to a single frame',
    async () => {
      // Every frame identical → all hashes equal → dedup collapses to one.
      const video = await makeVideo('color=c=blue:size=320x240:rate=10');
      const frames = await extractVideoFrames(ffmpegPath as string, ffprobePath, video, 6);
      expect(frames).toHaveLength(1);
    },
    30000,
  );
});
