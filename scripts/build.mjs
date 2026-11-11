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

for (const [source, output, label] of [
  ['./accent-picker.mjs', 'album-accent.js', 'Album accent picker'],
  ['./immersive/immersive.mjs', 'album-theme.js', 'Album theme'],
]) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(source, import.meta.url))],
    bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022',
    legalComments: 'none', write: false,
  });
  const file = new URL(`../${output}`, import.meta.url);
  const contents = bundle.outputFiles[0].contents;
  if (process.argv.includes('--check')) {
    const existing = await readFile(file).catch(() => Buffer.alloc(0));
    if (!existing.equals(Buffer.from(contents))) {
      console.error(`${output} is out of date. Run npm run build.`);
      process.exitCode = 1;
    } else console.log(`${label} matches its source.`);
  } else {
    await writeFile(file, contents);
    console.log(`Built ${output} (${contents.length.toLocaleString()} bytes).`);
  }
}
