import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import ffmpegStatic from 'ffmpeg-static';
import { MediaType } from '@aicos/db';
import {
  FrameSamplerService,
  buildVideoFrameArgs,
  extractVideoFrames,
  isVideo,
  type SourceMedia,
} from './frame-sampler.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

// The real-ffmpeg integration test runs whenever a binary is available
// (ffmpeg-static downloads one on install; CI ubuntu/glibc + local Windows both
// work). It skips gracefully otherwise so the suite never hard-depends on it.
const ffmpegPath = ffmpegStatic ?? null;
const ffmpegReady = ffmpegPath !== null && existsSync(ffmpegPath);
const itFfmpeg = ffmpegReady ? it : it.skip;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

/** Synthesize a tiny 3s clip with the always-available mpeg4 encoder. */
async function makeTestVideo(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'aicos-test-vid-'));
  const out = join(dir, 'test.mp4');
  await run(ffmpegPath as string, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10',
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

  it('buildVideoFrameArgs() samples downscaled JPEGs capped at maxFrames', () => {
    const args = buildVideoFrameArgs('/in.mp4', '/out_%03d.jpg', 6);
    expect(args).toContain('/in.mp4');
    expect(args).toContain('/out_%03d.jpg');
    expect(args[args.indexOf('-frames:v') + 1]).toBe('6');
    expect(args.join(' ')).toContain('fps=1');
    expect(args.join(' ')).toContain('scale=768:-2');
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
    'samples multiple JPEG frames from a generated clip',
    async () => {
      const video = await makeTestVideo();
      const frames = await extractVideoFrames(ffmpegPath as string, video, 6);
      expect(frames.length).toBeGreaterThan(1);
      expect(frames.length).toBeLessThanOrEqual(6);
      // Each output starts with the JPEG SOI marker (0xFFD8).
      for (const f of frames) {
        expect(f[0]).toBe(0xff);
        expect(f[1]).toBe(0xd8);
      }
    },
    30000,
  );
});
