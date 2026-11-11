import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';
import { build } from 'esbuild';

const sources = await Promise.all(['fonts.css', 'stylesheet.css']
  .map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
const { code } = transform({
  filename: 'homepage.css',
  code: Buffer.from(sources.join('\n')),
  minify: true,
});
const destination = new URL('../homepage.css', import.meta.url);

if (process.argv.includes('--check')) {
  const existing = await readFile(destination).catch(() => Buffer.alloc(0));
  if (!existing.equals(code)) {
    console.error('homepage.css is out of date. Run npm run build and include it with the source changes.');
    process.exitCode = 1;
  } else {
    console.log('Homepage CSS matches its sources.');
  }
} else {
  await writeFile(destination, code);
  console.log(`Built homepage.css (${code.length.toLocaleString()} bytes).`);
}

const accent = await build({
  entryPoints: [fileURLToPath(new URL('./accent-picker.mjs', import.meta.url))],
  bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
  legalComments: 'none', write: false,
});
const accentFile = new URL('../album-accent.js', import.meta.url);
const accentCode = accent.outputFiles[0].contents;
if (process.argv.includes('--check')) {
  const existing = await readFile(accentFile).catch(() => Buffer.alloc(0));
  if (!existing.equals(Buffer.from(accentCode))) {
    console.error('album-accent.js is out of date. Run npm run build.');
    process.exitCode = 1;
  } else console.log('Album accent picker matches its source.');
} else {
  await writeFile(accentFile, accentCode);
  console.log(`Built album-accent.js (${accentCode.length.toLocaleString()} bytes).`);
}
