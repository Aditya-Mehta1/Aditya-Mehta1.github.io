import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'lightningcss';

const sources = await Promise.all(['fonts.css', 'stylesheet.css', 'notebook.css']
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
