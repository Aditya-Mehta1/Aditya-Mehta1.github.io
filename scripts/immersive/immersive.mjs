import { extractRoles } from './extract.mjs';

const probe = document.createElement('canvas');
probe.width = probe.height = 1;
const ctx = probe.getContext('2d', { willReadFrequently: true });
function rgb(color) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
}
const hex = color => '#' + rgb(color).map(v => v.toString(16).padStart(2, '0')).join('');
const source = color => `rgb(${color.rgb.join(' ')})`;
const oklch = (l, c, h) => `oklch(${(l * 100).toFixed(2)}% ${c.toFixed(4)} ${h.toFixed(2)})`;
const mix = (a, b, amount) => hex(`color-mix(in oklab, ${a} ${(100 * (1 - amount)).toFixed(2)}%, ${b})`);
const luminance = color => rgb(color).reduce((s, c, i) => {
  c /= 255;
  return s + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
}, 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
function textVariant(ink, paper, amount) {
  let color = mix(ink, paper, amount);
  while (contrast(color, paper) < 4.5 && amount > 0) {
    amount = Math.max(0, amount - .02);
    color = mix(ink, paper, amount);
  }
  return color;
}
function fitAccent(color, paper, ink) {
  const original = hex(color);
  if (contrast(original, paper) >= 4.5) return original;
  const end = ink;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const amount = (low + high) / 2;
    if (contrast(mix(original, end, amount), paper) >= 4.5) high = amount;
    else low = amount;
  }
  return mix(original, end, high);
}
function finish(colors) {
  const paper = hex(colors.paper);
  let ink = hex(colors.ink);
  if (contrast(ink, paper) < 4.5) ink = contrast('#000000', paper) > contrast('#ffffff', paper) ? '#000000' : '#ffffff';
  let wash = hex(colors.wash);
  for (let i = 0; contrast(ink, wash) < 4.5 && i < 12; i++) wash = mix(wash, paper, .25);
  if (contrast(ink, wash) < 4.5) wash = paper;
  const result = {
    paper, ink, ink2: textVariant(ink, paper, .16), ink3: textVariant(ink, paper, .35),
    wash, accent: fitAccent(colors.accent, paper, ink), tone: hex(colors.tone),
  };
  result.minContrast = Math.min(contrast(ink, paper), contrast(result.ink2, paper), contrast(result.ink3, paper), contrast(ink, wash));
  result.accentContrast = contrast(result.accent, paper);
  result.accentAdjusted = result.accent !== hex(colors.accent);
  return result;
}
export function createTheme(image) {
  const { ambient: bg, accent, secondary } = extractRoles(image);
  const paper = oklch(bg.l, bg.c * bg.c / (bg.c + 0.01), bg.h);
  const ink = contrast('#000000', paper) > contrast('#ffffff', paper) ? '#000000' : '#ffffff';
  const accentColor = source(accent);
  const wash = mix(paper, source(secondary), .22);
  const tone = mix(paper, accentColor, .5);
  return finish({ paper, ink, accent: accentColor, wash, tone });
}

export function applyTheme(theme, target = document.documentElement) {
  for (const key of ['paper', 'ink', 'ink2', 'ink3', 'wash', 'accent', 'tone']) {
    target.style.setProperty('--' + ({ ink2: 'ink-2', ink3: 'ink-3' }[key] || key), theme[key]);
  }
  target.style.colorScheme = contrast('#111111', theme.paper) > contrast('#fafafa', theme.paper) ? 'light' : 'dark';
}
