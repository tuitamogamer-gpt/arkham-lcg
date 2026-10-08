import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Preserve the real rendered alpha fade when baking black for screen blending.
// Explicit libvpx decoding is required: FFmpeg's default VP9 decoder omits alpha.
const input = fileURLToPath(new URL('../../public/motion/act-reveal.webm', import.meta.url));
const output = fileURLToPath(new URL('../../public/motion/act-reveal.mp4', import.meta.url));
const filter = 'color=c=black:s=480x240:r=30:d=1.7[background];[background][0:v]overlay=shortest=1:format=auto,format=yuv420p';
const result = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-c:v', 'libvpx-vp9', '-i', input,
  '-filter_complex', filter,
  '-an', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '22',
  '-r', '30', '-frames:v', '51', '-t', '1.7', '-movflags', '+faststart',
  '-map_metadata', '-1', output,
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
