import { getPaletteSync } from 'colorthief';

const size = 128;
const count = size * size;
const linear = Float64Array.from({ length: 256 }, (_, v) => {
  v /= 255;
  return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
});
const encode = v => 255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055);
const paper = [250, 250, 250];
const pixels = new Float64Array(count * 3);
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

function lab(r, g, b, output, offset = 0) {
  r = linear[r]; g = linear[g]; b = linear[b];
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  output[offset] = .2104542553 * l + .793617785 * m - .0040720468 * s;
  output[offset + 1] = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  output[offset + 2] = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return output;
}

function distance(a, i, b, j) {
  return (a[i] - b[j]) ** 2 + (a[i + 1] - b[j + 1]) ** 2 + (a[i + 2] - b[j + 2]) ** 2;
}

function luminance(rgb) {
  return .2126 * linear[rgb[0]] + .7152 * linear[rgb[1]] + .0722 * linear[rgb[2]];
}

export function selectAccent(frame) {
  const data = frame.data;
  const palette = getPaletteSync(frame, { colorCount: 16, quality: 1, colorSpace: 'oklch', ignoreWhite: false });
  if (!palette?.length) return null;
  const colors = palette.map(c => ({ lab: lab(...c.array(), []), count: 0, edge: 0, salience: 0, snap: Infinity }));
  let chromatic = 0;
  for (let i = 0; i < count; i++) {
    lab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], pixels, i * 3);
    if (pixels[i * 3 + 1] ** 2 + pixels[i * 3 + 2] ** 2 > .04 ** 2) chromatic++;
  }
  for (let i = 0; i < count; i++) {
    const offset = i * 3, x = i % size, y = Math.floor(i / size);
    let nearest = colors[0], min = Infinity;
    for (const color of colors) {
      const d = distance(pixels, offset, color.lab, 0);
      if (d < min) { min = d; nearest = color; }
    }
    nearest.count++;
    if (x < 8 || y < 8 || x >= size - 8 || y >= size - 8) nearest.edge++;
    nearest.salience += (
      Math.sqrt(distance(pixels, offset, pixels, (Math.max(0, y - 4) * size + x) * 3)) +
      Math.sqrt(distance(pixels, offset, pixels, (Math.min(size - 1, y + 4) * size + x) * 3)) +
      Math.sqrt(distance(pixels, offset, pixels, (y * size + Math.max(0, x - 4)) * 3)) +
      Math.sqrt(distance(pixels, offset, pixels, (y * size + Math.min(size - 1, x + 4)) * 3))
    ) / 4;
    if (min < nearest.snap) {
      nearest.snap = min;
      nearest.source = i * 4;
    }
  }
  const populated = colors.filter(c => c.count).sort((a, b) => b.count - a.count);
  for (const c of populated) {
    c.rgb = [data[c.source], data[c.source + 1], data[c.source + 2]];
    lab(...c.rgb, c.lab);
    c.l = c.lab[0];
    c.c = Math.hypot(c.lab[1], c.lab[2]);
    c.h = (Math.atan2(c.lab[2], c.lab[1]) * 180 / Math.PI + 360) % 360;
  }
  const background = populated.reduce((a, b) => b.edge > a.edge ? b : a);
  let first, usable;
  for (const c of populated) {
    if (c.c <= .025 || c.count / count <= .005) continue;
    c.score = Math.sqrt(c.count / count) * c.c * (.5 + Math.sqrt(distance(c.lab, 0, background.lab, 0))) *
      (1 + Math.min(1, c.salience / c.count / .08));
    if (!first || c.score > first.score) first = c;
    if (1.05 / (luminance(c.rgb) + .05) >= 3 && (!usable || c.score > usable.score)) usable = c;
  }
  let hero = first;
  first = usable || first;
  if (!first || (chromatic / count < .06 && first.c < .08)) {
    hero = first = populated.filter(c => c.c < .035).sort((a, b) => a.l - b.l)[0] || populated[0];
  }
  const secondary = first.c < .015 ? populated.filter(c => c.count / count > .03 && c.c > .04 &&
    distance(c.lab, 0, first.lab, 0) > .1 ** 2 && Math.abs(((c.h - first.h + 540) % 360) - 180) > 45)
    .sort((a, b) => b.score - a.score)[0] || first : first;
  return { rgb: first.rgb, l: first.l, c: first.c, h: first.h, background, secondary, hero };
}

const limit = (luminance(paper) + .05) / 4.5 - .05;
const scaled = (rgb, scale) => Array.from(rgb, v => Math.floor(encode(Math.min(1, linear[v] * scale))));
const hex = values => '#' + Array.from(values, v => v.toString(16).padStart(2, '0')).join('');
const paperLab = lab(...paper, []);

function unlab(l, a, b) {
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
  const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
  const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * x - 3.3077115913 * y + .2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - .3413193965 * z,
    -.0041960863 * x - .7034186147 * y + 1.707614701 * z,
  ];
}

const inside = values => values.every(v => v >= -.0005 && v <= 1.0005);
const bytes = values => values.map(v => Math.round(encode(Math.min(1, Math.max(0, v)))));

function reach(l, h) {
  const x = Math.cos(h * Math.PI / 180), y = Math.sin(h * Math.PI / 180);
  let low = 0, high = .4;
  for (let i = 0; i < 14; i++) {
    const c = (low + high) / 2;
    if (inside(unlab(l, c * x, c * y))) low = c;
    else high = c;
  }
  return low;
}

function blend(rgb, amount) {
  const color = lab(...rgb, []);
  return bytes(unlab(...color.map((v, i) => v * amount + paperLab[i] * (1 - amount))));
}

export function washColor(accent) {
  const neutral = accent.c < .015;
  const source = neutral ? accent.secondary : accent.hero?.c > accent.c ? accent.hero : accent;
  if (source.c < .04) return blend(neutral ? source.rgb : accent.rgb, neutral ? .13 : .35);
  const chroma = source.c * (.35 + .4 * Math.min(1, Math.max(0, (source.c - .05) / .1)));
  let l = .86, c = reach(l, source.h);
  while (c < chroma && l > .75) c = reach(l -= .01, source.h);
  c = Math.min(c, chroma);
  return bytes(unlab(l, c * Math.cos(source.h * Math.PI / 180), c * Math.sin(source.h * Math.PI / 180)));
}

export function markColor(accent) {
  const vivid = [accent, accent.secondary].find(color => color.c > .04);
  return vivid ? scaled(vivid.rgb, limit / luminance(vivid.rgb)) : null;
}

export function pickAccent(image) {
  canvas.width = canvas.height = size;
  context.drawImage(image, 0, 0, size, size);
  const accent = selectAccent(context.getImageData(0, 0, size, size));
  if (!accent) return { wash: '#e5e5e5', accent: '#0a0a0a', tone: '#a3a3a3' };
  const brightness = luminance(accent.rgb);
  const mark = markColor(accent);
  return {
    accent: hex(brightness > limit ? scaled(accent.rgb, limit / brightness) : accent.rgb),
    wash: hex(washColor(accent)), tone: hex(blend(accent.rgb, accent.c < .015 ? .62 : .78)), ...mark && { mark: hex(mark) },
  };
}
