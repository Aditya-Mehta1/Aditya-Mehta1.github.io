# Artwork-derived page theme

`createTheme(decodedImageOrCanvas)` turns a cover into a full page palette. `applyTheme(theme, element)` writes it as CSS variables in one pass. The website loads the bundle lazily when the album-theme toggle is enabled and caches twelve recent results.

## What it returns

| Property | CSS variable | Use |
| --- | --- | --- |
| `paper` | `--paper` | Page background: the cover's largest real color |
| `ink`, `ink2`, `ink3` | `--ink`, `--ink-2`, `--ink-3` | Headings, body text, secondary text |
| `chips` | `--chip-0…2`, `--chip-ink-0…2` | One to three highlight fills taken from the cover's other colors, each with its own black or white text color. `applyTheme` repeats them to fill three slots |
| `accent` | `--accent`, `--mark` | Links and small details: a cover color moved in lightness until it reads on the page, or `ink` when none qualifies |
| `underline` | — | `true` when the link color is too close to body text, so links need an underline |
| `wash` | `--wash` | Soft fill that stays readable under `ink` (hover states, selection) |
| `tone` | `--tone` | Decoration only |
| `scheme` | `color-scheme` | `light` or `dark` |

`minContrast` and `accentContrast` report the lowest text contrast and the link contrast against the page.

## How it works

The image is drawn at 128px on white and split into sixteen Oklab clusters. The page color is the densest group of similar clusters, counting area and the outer 8px border equally, so the cover's ground wins over its subject and an average of unrelated colors is never used. Mid-brightness results are moved to the nearer of two lightness levels, keeping hue and as much chroma as sRGB allows, so `ink` reaches at least 6:1.

Highlights are the most prominent clusters that differ from the page and from each other, ranked by area, chroma and local contrast. Colorless covers fall back to `wash`. Body and secondary text are `ink` mixed toward the page and never drop below 4.5:1; highlight text is also at least 4.5:1 on its fill.

It never reads album names, IDs or manually supplied palettes.

## Checks

Build with `npm run build`. Run `npm run check` and `node scripts/listening-refresh.test.cjs`. Serve the repository locally and open `/scripts/immersive/check.html` for browser checks of contrast, highlights, gray input, transparent compositing, scoped application and repeatability.

The approach was reviewed on 115 real Last.fm covers at the 500px size the site loads.

## Known limits

- Across flat grays the page brightness switches once, where the text flips between black and white. Artwork near that boundary can land on either side.
- A thin neutral frame can become the page color; the framed image then appears in the highlights instead.
- Photographic covers with no clear ground are a judgement call and can come out darker than they feel.
- Black-and-white covers get solid black or white highlights.
- Browser checks cover desktop Chrome and a narrow viewport; Safari, Firefox and physical mobile performance remain unverified.
- Images need a decoded, canvas-readable source and remote CORS permission. If generation fails, the widget falls back to its accent-only tint.

Color space: https://www.w3.org/TR/css-color-4/#ok-lab . Contrast: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html .
