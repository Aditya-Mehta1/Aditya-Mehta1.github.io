import { getPaletteSync } from 'colorthief';

const size = 128;
const count = size * size;
const band = 8;
const bandCount = count - (size - band * 2) ** 2;
const linear = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const encode = v => Math.round(255 * Math.min(1, Math.max(0, v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)));

function toLab(r, g, b) {
  r = linear(r); g = linear(g); b = linear(b);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [
    .2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s,
  ];
}

function toLinear(l, a, b) {
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
  const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
  const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * x - 3.3077115913 * y + .2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - .3413193965 * z,
    -.0041960863 * x - .7034186147 * y + 1.707614701 * z,
  ];
}

const polar = lab => ({ l: lab[0], c: Math.hypot(lab[1], lab[2]), h: Math.atan2(lab[2], lab[1]) });
const flat = color => [color.l, color.c * Math.cos(color.h), color.c * Math.sin(color.h)];
const inside = values => values.every(v => v >= -.0005 && v <= 1.0005);

function reach(l, h) {
  let low = 0, high = .4;
  for (let i = 0; i < 14; i++) {
    const c = (low + high) / 2;
    if (inside(toLinear(l, c * Math.cos(h), c * Math.sin(h)))) low = c;
    else high = c;
  }
  return low;
}

const clip = color => ({ ...color, c: Math.min(color.c, reach(color.l, color.h)) });
const bytes = color => toLinear(...flat(clip(color))).map(encode);
const hex = color => '#' + bytes(color).map(v => v.toString(16).padStart(2, '0')).join('');
const luminance = color => bytes(color).reduce((sum, v, i) => sum + linear(v) * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a, b, amount) => polar(flat(a).map((v, i) => v * (1 - amount) + flat(b)[i] * amount));

function atLuminance(color, target) {
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const l = (low + high) / 2;
    if (luminance({ ...color, l }) < target) low = l;
    else high = l;
  }
  return clip({ ...color, l: (low + high) / 2 });
}

function legible(color, floor) {
  const dark = 1.05 / floor - .05, light = .05 * floor - .05, y = luminance(color);
  if (y <= dark || y >= light) return clip(color);
  const down = atLuminance(color, dark), up = atLuminance(color, light);
  return color.l - down.l <= up.l - color.l ? down : up;
}

function clusters(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const cells = getPaletteSync(canvas, { colorCount: 16, quality: 1, colorSpace: 'oklch', ignoreWhite: false })
    .map(color => ({ centre: toLab(...color.array()), sum: [0, 0, 0], n: 0, edge: 0, salience: 0 }));
  const pixels = [];
  for (let i = 0; i < count; i++) pixels.push(toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  for (let i = 0; i < count; i++) {
    const pixel = pixels[i], x = i % size, y = Math.floor(i / size);
    let nearest = cells[0], min = Infinity;
    for (const cell of cells) {
      const d = distance(pixel, cell.centre);
      if (d < min) { min = d; nearest = cell; }
    }
    nearest.n++;
    for (let k = 0; k < 3; k++) nearest.sum[k] += pixel[k];
    if (x < band || y < band || x >= size - band || y >= size - band) nearest.edge++;
    const neighbours = [
      Math.max(0, y - 4) * size + x, Math.min(size - 1, y + 4) * size + x,
      y * size + Math.max(0, x - 4), y * size + Math.min(size - 1, x + 4),
    ];
    nearest.salience += neighbours.reduce((sum, n) => sum + distance(pixel, pixels[n]), 0) / 4;
  }
  return cells.filter(cell => cell.n).map(cell => {
    const lab = cell.sum.map(v => v / cell.n);
    return { lab, ...polar(lab), share: cell.n / count, edge: cell.edge / bandCount, salience: cell.salience / cell.n };
  });
}

function surface(all) {
  const near = (a, b) => Math.exp(-(distance(a.lab, b.lab) ** 2) / (2 * .07 ** 2));
  let ground, best = -1;
  for (const candidate of all) {
    let score = 0;
    for (const other of all) score += (other.share + other.edge) * near(candidate, other);
    if (score > best) { best = score; ground = candidate; }
  }
  const sum = [0, 0, 0];
  let weight = 0;
  for (const other of all) {
    const w = other.share * near(ground, other);
    weight += w;
    for (let i = 0; i < 3; i++) sum[i] += other.lab[i] * w;
  }
  return legible(polar(sum.map(v => v / weight)), 6.5);
}

export function createTheme(image) {
  const all = clusters(image);
  const paper = surface(all);
  const paperLab = flat(paper);
  const light = luminance(paper) > .18;
  let ink = clip({ l: light ? .16 : .97, c: Math.min(.025, paper.c * .3), h: paper.h });
  if (contrast(ink, paper) < 6) ink = { l: light ? 0 : 1, c: 0, h: 0 };
  const soften = (amount, floor) => {
    let color = mix(ink, paper, amount);
    while (contrast(color, paper) < floor && amount > 0) color = mix(ink, paper, amount = Math.max(0, amount - .02));
    return color;
  };
  const ink2 = soften(.2, 5.2), ink3 = soften(.42, 4.5);

  const ranked = all
    .filter(color => color.share >= .008 && distance(color.lab, paperLab) >= .12)
    .map(color => ({ ...color, score: Math.sqrt(color.share) * (color.c + .03) * (1 + Math.min(1, color.salience / .08)) }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const color of ranked) {
    if (picked.length === 3 || color.score < ranked[0].score * .3) break;
    if (picked.every(other => distance(other.lab, color.lab) >= .14)) picked.push(color);
  }
  const poles = [{ l: .16, c: 0, h: 0 }, { l: .98, c: 0, h: 0 }];
  const chips = picked.map(color => {
    const fill = legible(color, 5.5);
    return { fill: hex(fill), ink: hex(poles.reduce((a, b) => contrast(b, fill) > contrast(a, fill) ? b : a)) };
  });

  let accent;
  for (const color of ranked) {
    if (color.c < .06) continue;
    let fitted = clip(color);
    for (let i = 0; contrast(fitted, paper) < 4.5 && i < 90; i++) fitted = clip({ ...color, l: fitted.l + (light ? -.01 : .01) });
    if (contrast(fitted, paper) >= 4.5 && fitted.c >= .06) { accent = fitted; break; }
  }
  const underline = !accent || distance(flat(accent), flat(ink2)) < .12;
  accent ||= ink;
  let wash = mix(paper, picked[0] || ink, picked[0] ? .32 : .14);
  for (let i = 0; contrast(ink, wash) < 4.5 && i < 12; i++) wash = mix(wash, paper, .25);
  if (contrast(ink, wash) < 4.5) wash = paper;
  if (!chips.length) chips.push({ fill: hex(wash), ink: hex(ink) });
  return {
    paper: hex(paper), ink: hex(ink), ink2: hex(ink2), ink3: hex(ink3),
    wash: hex(wash), accent: hex(accent), tone: hex(picked[1] || picked[0] || mix(paper, ink, .5)),
    underline, chips, scheme: light ? 'light' : 'dark',
    minContrast: Math.min(contrast(ink, paper), contrast(ink2, paper), contrast(ink3, paper), contrast(ink, wash)),
    accentContrast: contrast(accent, paper),
  };
}

export function applyTheme(theme, target = document.documentElement) {
  const values = {
    paper: theme.paper, ink: theme.ink, 'ink-2': theme.ink2, 'ink-3': theme.ink3,
    wash: theme.wash, accent: theme.accent, tone: theme.tone, mark: theme.accent,
  };
  for (let i = 0; i < 3; i++) {
    const chip = theme.chips[i % theme.chips.length];
    values['chip-' + i] = chip.fill;
    values['chip-ink-' + i] = chip.ink;
  }
  for (const [name, value] of Object.entries(values)) target.style.setProperty('--' + name, value);
  target.style.colorScheme = theme.scheme;
}
