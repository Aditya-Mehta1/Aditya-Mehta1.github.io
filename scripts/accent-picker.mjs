import { getPaletteSync } from 'colorthief';

const size = 128;
const count = size * size;
const linear = Float64Array.from({ length: 256 }, (_, v) => {
  v /= 255;
  return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
});
const pixels = new Float64Array(count * 3);
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const probe = document.createElement('canvas');
probe.width = 3;
probe.height = 1;
const paint = probe.getContext('2d', { willReadFrequently: true });

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
  first = usable || first;
  if (!first || (chromatic / count < .06 && first.c < .08)) {
    first = populated.filter(c => c.c < .035).sort((a, b) => a.l - b.l)[0] || populated[0];
  }
  const secondary = first.c < .015 ? populated.filter(c => c.count / count > .03 && c.c > .04 &&
    distance(c.lab, 0, first.lab, 0) > .1 ** 2 && Math.abs(((c.h - first.h + 540) % 360) - 180) > 45)
    .sort((a, b) => b.score - a.score)[0] || first : first;
  return { rgb: first.rgb, l: first.l, c: first.c, h: first.h, background, secondary };
}

export function pickAccent(image) {
  canvas.width = canvas.height = size;
  context.drawImage(image, 0, 0, size, size);
  const accent = selectAccent(context.getImageData(0, 0, size, size));
  if (!accent) return { wash: '#e9e9e9', accent: '#111111', tone: '#9a9a9a' };
  const neutral = accent.c < .015;
  const color = `rgb(${accent.rgb.join(' ')})`;
  const wash = neutral
    ? `color-mix(in oklab, #fff ${accent.secondary.c > .04 ? 70 : 87}%, rgb(${accent.secondary.rgb.join(' ')}))`
    : `color-mix(in oklab, #fff 65%, ${color})`;
  for (const [i, value] of [color, wash, `color-mix(in oklab, #fff ${neutral ? 38 : 22}%, ${color})`].entries()) {
    paint.fillStyle = value;
    paint.fillRect(i, 0, 1, 1);
  }
  const data = paint.getImageData(0, 0, 3, 1).data;
  const rgb = [...data.slice(0, 3)];
  const brightness = luminance(rgb);
  if (1.05 / (brightness + .05) < 4.5) {
    const scale = (1.05 / 4.5 - .05) / brightness;
    for (let i = 0; i < 3; i++) {
      const v = linear[rgb[i]] * scale;
      rgb[i] = Math.floor(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055));
    }
  }
  const hex = values => '#' + Array.from(values, v => v.toString(16).padStart(2, '0')).join('');
  return { accent: hex(rgb), wash: hex(data.slice(4, 7)), tone: hex(data.slice(8, 11)) };
}
