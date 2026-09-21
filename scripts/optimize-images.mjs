import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const images = [
  { name: 'twin', original: 'twin.png', widths: [400, 680, 1020, 1360], options: ['-lossless'] },
  { name: 'me', original: 'me.jpg', widths: [160, 320, 520, 780, 1040], options: ['-q', '92', '-sharp_yuv'] },
];

for (const { name, original, widths, options } of images) {
  for (const width of widths) {
    const destination = `images/${name}-${width}.webp`;
    const result = spawnSync('cwebp', [
      '-quiet', ...options, '-m', '6', '-resize', String(width), '0',
      `images/${original}`, '-o', destination,
    ], { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error(result.error?.message ?? `cwebp failed for ${destination}`);
      process.exit(result.status || 1);
    }
    console.log(destination);
  }
}
