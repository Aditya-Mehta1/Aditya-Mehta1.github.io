function linear(channel) {
  const value = channel / 255;
  return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
}

function polar(red, green, blue) {
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const lightness = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const c = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [lightness, Math.hypot(a, c), Math.atan2(c, a)];
}


export { polar };
