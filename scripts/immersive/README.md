# Artwork-derived page theme

`createTheme(decodedImageOrCanvas)` returns paper, ink, ink2, ink3, accent, wash and tone plus contrast metadata. `applyTheme(theme, element)` applies their CSS variables together. The website loads the bundle lazily when the album-theme toggle is enabled and caches twelve recent results.

Transparent input is composited on white. A central Oklab geometric median provides robust surface lightness; a nearby source palette color provides the initial hue. Accent selection is independent and is corrected against the final surface.

For warm central subjects, cool context supported on both image sides can influence surface hue. Smooth color-density matching and continuous weights avoid selecting a single border pixel or abruptly switching background brightness. This is a directional heuristic for warm subjects against cool scenery, not semantic segmentation or a universal background detector. It never reads album names, IDs or manually supplied palettes. Near-neutral context is suppressed; text and background are applied atomically.

Build with `npm run build`. Run `npm run check` and `node scripts/listening-refresh.test.cjs`. Serve the repository locally and open `/scripts/immersive/check.html` for browser checks of final contrast, grayscale continuity, transparent compositing, source-role examples, scoped application and repeatability. Returned foreground roles meet 4.5:1 against paper; ink also meets 4.5:1 on wash. Tone is decoration, not a text color.

The comparison used 115 distinct album covers with six resize, JPEG and crop variants, plus six cached live artworks. Full-page reviews favored the cool charcoal treatment of Pink Moon and the muted violet treatment of Live Through This over their previous brown/tan surfaces. The latter remains lighter than its cover. This update reused the previous held-out set as regression data; it is not fresh independent validation.

Known limits: a small crop of In Rainbows can cross the contrast boundary and switch foreground polarity; some vivid surfaces are intense and some midtones feel flat. Foreground/background interpretation remains imperfect. Browser checks cover desktop Chrome and a narrow viewport; Safari, Firefox and physical mobile performance remain unverified. Images require a decoded canvas-readable source and remote image CORS permission. If immersive generation fails, the widget attempts its accent-only fallback.

Background-role research: https://vis.stanford.edu/files/2013-ColorThemes-CHI.pdf . Color space: https://www.w3.org/TR/css-color-4/#ok-lab . Contrast: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html . These inform the design; the implementation is a custom deterministic heuristic.
