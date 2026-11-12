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
const { selectAccent, markColor, washColor } = await import('./accent-picker.mjs');
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

test('keyword color is vivid, readable on paper, and absent for colorless artwork', () => {
  const luminance = rgb => rgb.reduce((sum, v, i) => {
    v /= 255;
    return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const onPaper = rgb => (luminance([250, 250, 250]) + .05) / (luminance(rgb) + .05);
  for (const rgb of [[180, 86, 46], [25, 75, 160], [60, 12, 20], [242, 194, 48], [0, 0, 255]]) {
    const mark = markColor(selectAccent(frame(() => rgb)));
    assert.ok(onPaper(mark) >= 4.5, `${rgb} is unreadable as ${mark}`);
    assert.ok(Math.max(...mark) - Math.min(...mark) > 40, `${rgb} lost its color as ${mark}`);
  }
  assert.ok(onPaper(markColor(selectAccent(frame(() => [60, 12, 20])))) < 6, 'Dark artwork should be lifted, not left near black');
  for (const rgb of [[0, 0, 0], [128, 128, 128], [255, 255, 255]]) assert.equal(markColor(selectAccent(frame(() => rgb))), null);
});

test('highlight color is vivid for vivid artwork, quiet for muted artwork, and readable under ink', () => {
  const luminance = rgb => rgb.reduce((sum, v, i) => {
    v /= 255;
    return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const underInk = rgb => (luminance(rgb) + .05) / (luminance([10, 10, 10]) + .05);
  const spread = rgb => Math.max(...rgb) - Math.min(...rgb);
  const wash = colorAt => washColor(selectAccent(frame(colorAt)));
  for (const rgb of [[138, 206, 0], [255, 122, 0], [206, 32, 48], [30, 121, 177], [242, 194, 48]]) {
    const color = wash(() => rgb);
    assert.ok(underInk(color) >= 4.5, `${rgb} is unreadable as ${color}`);
    assert.ok(spread(color) > 70, `${rgb} washed out as ${color}`);
  }
  const lime = wash((x, y) => x > 40 && x < 64 && y > 56 && y < 72 ? [56, 65, 1] : [138, 206, 0]);
  assert.ok(lime[1] - lime[2] > 80 && lime[1] > lime[0], `Light vivid artwork lost its color as ${lime}`);
  assert.ok(spread(wash(() => [150, 140, 128])) < 40, 'Muted artwork should stay quiet');
  for (const rgb of [[0, 0, 0], [128, 128, 128], [255, 255, 255]]) assert.ok(spread(wash(() => rgb)) < 3);
});

const listening = readFileSync(new URL('../listening.js', import.meta.url), 'utf8');
const tintSource = listening.slice(listening.indexOf('  let accentPicker;'), listening.indexOf('  function paint('))
  .replace("import('./album-accent.js')", 'loadPicker()');
function harness(loadPicker) {
  const painted = [];
  const context = vm.createContext({
    loadPicker, paint: colors => painted.push(colors), swap: apply => apply(),
    root: { style: { getPropertyValue: () => '' }, classList: { add() {}, remove() {}, toggle() {} } }, setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(`let lit; let glance = null; let tintTimer; let immersive = false; ${tintSource}
    globalThis.run = key => { lit = { currentSrc: key }; return tint(lit); };
    globalThis.hover = key => { glance = key ? { currentSrc: key } : null; return glance ? tint(glance) : undefined; };
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

test('a hovered album takes over from the cover until it is released', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { context, painted } = harness(() => pending);
  const cover = context.run('cover'), hovered = context.hover('hovered');
  resolve({ pickAccent: image => ({ accent: image.currentSrc }) });
  await Promise.all([cover, hovered]);
  assert.deepEqual(painted, [{ accent: 'hovered' }]);
  context.hover(null);
  await context.run('cover');
  assert.deepEqual(painted, [{ accent: 'hovered' }, { accent: 'cover' }]);
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
