import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const documentBefore = globalThis.document;
const imageDataBefore = globalThis.ImageData;
globalThis.document = { createElement: () => ({ getContext: () => null }) };
globalThis.ImageData = class {
  constructor(data) { this.data = data; this.width = this.height = 128; }
};
const { selectAccent } = await import('./accent-picker.mjs');
function frame(colorAt) {
  const data = new Uint8ClampedArray(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) data.set([...colorAt(i % 128, Math.floor(i / 128)), 255], i * 4);
  return new ImageData(data);
}

test('flat artwork retains its source color, including black and white', () => {
  for (const rgb of [[0, 0, 0], [128, 128, 128], [255, 255, 255], [180, 86, 46], [25, 75, 160]]) {
    assert.deepEqual(selectAccent(frame(() => rgb)).rgb, rgb);
  }
});

test('a dark sleeve with warm marks and minor navy keeps its warm accent', () => {
  const cover = frame(x => x < 70 ? [10, 8, 5] : x < 110 ? [180, 86, 46] : [21, 46, 76]);
  const first = selectAccent(cover);
  assert.deepEqual(first.rgb, [180, 86, 46]);
  selectAccent(frame(() => [128, 128, 128]));
  assert.deepEqual(selectAccent(cover).rgb, first.rgb);
});

test('near-neutral artwork does not get an invented vivid hue', () => {
  const selected = selectAccent(frame(x => x < 64 ? [24, 24, 24] : [220, 220, 220]));
  assert.ok(selected.c < .015);
  assert.deepEqual(selected.rgb, [24, 24, 24]);
});

const listening = readFileSync(new URL('../listening.js', import.meta.url), 'utf8');
const tintSource = listening.slice(listening.indexOf('  let accentPicker;'), listening.indexOf('  function paint('))
  .replace("import('./album-accent.js')", 'loadPicker()');
function harness(loadPicker) {
  const painted = [];
  const context = vm.createContext({
    loadPicker, paint: colors => painted.push(colors),
    root: { style: { getPropertyValue: () => '' }, classList: { add() {}, remove() {}, toggle() {} } }, setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(`let artwork; let tintTimer; let immersive = false; ${tintSource}
    globalThis.run = key => { artwork = key; return tint({ currentSrc: key }); };
    globalThis.setImmersive = value => { immersive = value; };
    globalThis.cacheSize = () => accentCache.size;`, context);
  return { context, painted };
}

test('recent artwork reuses its palette and cache stays bounded', async () => {
  let calls = 0, imports = 0;
  const { context, painted } = harness(async () => {
    imports++;
    return { pickAccent: image => { calls++; return { accent: image.currentSrc }; } };
  });
  await context.run('cover-a'); await context.run('cover-b'); await context.run('cover-a');
  assert.equal(calls, 2); assert.equal(imports, 1); assert.equal(painted.length, 3);
  for (let i = 0; i < 20; i++) await context.run('cover-' + i);
  assert.equal(context.cacheSize(), 12);
});

test('delayed module loading cannot apply the previous artwork palette', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { context, painted } = harness(() => pending);
  const first = context.run('old'), second = context.run('new');
  resolve({ pickAccent: image => ({ accent: image.currentSrc }) });
  await Promise.all([first, second]);
  assert.deepEqual(painted, [{ accent: 'new' }]);
});

test('a failed picker load leaves the page alone and allows a later retry', async () => {
  let calls = 0;
  const { context, painted } = harness(async () => {
    if (++calls === 1) throw new Error('Unavailable');
    return { pickAccent: () => ({ accent: '#111111' }) };
  });
  await context.run('first'); assert.equal(painted.length, 0);
  await context.run('second'); assert.equal(painted.length, 1);
});

test('delayed accents cannot overwrite a newly selected immersive theme', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { context, painted } = harness(() => pending);
  const first = context.run('cover');
  context.setImmersive(true);
  resolve({ pickAccent: () => ({ accent: '#ff0000' }) });
  await first;
  assert.equal(painted.length, 0);
});

process.on('exit', () => {
  globalThis.document = documentBefore;
  globalThis.ImageData = imageDataBefore;
});
