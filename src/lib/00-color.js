/* Colours: OKLab distance, "same pen?" rule, anchor-based grouping, nearest named colour.
 * Pure – used by the app (src/app) and by Node tests. */
const SWColor = (() => {
  const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const cache = new Map();
  /* sRGB hex → OKLab [L, a, b] */
  function oklab(hex) {
    const k = String(hex).toLowerCase(); if (cache.has(k)) return cache.get(k);
    const [r, g, b] = hexRgb(k).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const v = [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    cache.set(k, v); return v;
  }
  const dist = (h1, h2) => { const a = oklab(h1), b = oklab(h2); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const chroma = h => { const [, a, b] = oklab(h); return Math.hypot(a, b); };
  /* near-black inks (#000, #1d2433, #2e2e2c, #333 …) are one pen in practice */
  const isInkBlack = h => oklab(h)[0] <= 0.34 && chroma(h) <= 0.04;
  /* white / paper-like: a shape filled with it only covers what lies beneath (it is never drawn) */
  const isPaper = h => oklab(h)[0] >= 0.97 && chroma(h) <= 0.03;
  const SAME = 0.05;
  const similar = (h1, h2) => dist(h1, h2) <= SAME || (isInkBlack(h1) && isInkBlack(h2));

  /* anchor-based grouping: heaviest colour first, every colour joins the first anchor it is similar to
   * (no chaining through gradients). input [{key, color, weight}] → { of: Map(key → anchorKey), anchors: [entries] } */
  function group(entries) {
    const sorted = entries.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const anchors = [], of = new Map();
    for (const e of sorted) {
      const a = anchors.find(x => similar(x.color, e.color));
      if (a) of.set(e.key, a.key); else { anchors.push(e); of.set(e.key, e.key); }
    }
    return { of, anchors };
  }

  /* nearest named colour (weighted RGB, as before); ids are translated by the app via t('color.<id>') */
  const NAMED = [['black', [25, 25, 30]], ['grey', [128, 128, 128]], ['red', [215, 45, 40]], ['orange', [240, 130, 30]], ['yellow', [235, 205, 40]], ['green', [40, 150, 70]],
    ['teal', [30, 165, 170]], ['blue', [40, 70, 210]], ['violet', [130, 60, 190]], ['pink', [230, 80, 160]], ['brown', [125, 80, 45]], ['white', [245, 245, 245]]];
  function nameId(hex) {
    const c = hexRgb(hex); let best = NAMED[0][0], bd = Infinity;
    for (const [n, r] of NAMED) { const d = (c[0] - r[0]) ** 2 * 2 + (c[1] - r[1]) ** 2 * 4 + (c[2] - r[2]) ** 2 * 3; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  /* the German names the old app stored in localStorage (for migration) */
  const LEGACY_DE = { Schwarz: 'black', Grau: 'grey', Rot: 'red', Orange: 'orange', Gelb: 'yellow', 'Grün': 'green', 'Türkis': 'teal', Blau: 'blue', Violett: 'violet', Pink: 'pink', Braun: 'brown', 'Weiß': 'white' };

  return { hexRgb, oklab, dist, chroma, isInkBlack, isPaper, similar, group, nameId, NAMED_IDS: NAMED.map(n => n[0]), LEGACY_DE, SAME };
})();
if (typeof module !== 'undefined') module.exports = SWColor;
