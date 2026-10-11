/* SVG <text> runs: element grouping, hit boxes (quads) in item-local mm, glyph coverage of a font.
 * A run is { str, x, y, M, fs, ls, anchor, layer, color, family, weight, style, paint, el }; x/y in the run's
 * user units, M maps run units → item-local mm. Cap height = 0.7 × font size; glyph units: cap 10, baseline 10. */
const SWText = ((SW) => {
  const capOf = t => t.fs * 0.7;
  /* width of the run in run units when drawn with a plotter font */
  function runWidth(t, font) { const capH = capOf(t), extra = t.ls / (capH / 10); return SW.textWidth(t.str, capH, extra, font); }
  const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  /* run units → item-local mm, with an optional size/offset adjustment adj = { k, ax, ay, dx, dy } (see SWJob.textPolys) */
  function toItem(t, x, y, adj) {
    if (adj) { x = adj.ax + (x - adj.ax) * adj.k; y = adj.ay + (y - adj.ay) * adj.k; }
    const p = ap(t.M, x, y); if (adj) { p[0] += adj.dx; p[1] += adj.dy; } return p;
  }
  /* item-local mm → run units (inverse of toItem); null if the run transform is degenerate */
  function toRun(t, x, y, adj) {
    const M = t.M, d = M[0] * M[3] - M[1] * M[2]; if (!d) return null;
    if (adj) { x -= adj.dx; y -= adj.dy; }
    let rx = (M[3] * (x - M[4]) - M[2] * (y - M[5])) / d, ry = (-M[1] * (x - M[4]) + M[0] * (y - M[5])) / d;
    if (adj && adj.k) { rx = adj.ax + (rx - adj.ax) / adj.k; ry = adj.ay + (ry - adj.ay) / adj.k; }
    return [rx, ry];
  }
  /* quad (4 points, item-local mm) around a run of width w (run units): cap top to ~descender */
  function runQuad(t, w, adj) {
    const capH = capOf(t), dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0;
    const x0 = t.x + dx, x1 = x0 + w, y0 = t.y - capH * 1.05, y1 = t.y + capH * 0.35;
    return [toItem(t, x0, y0, adj), toItem(t, x1, y0, adj), toItem(t, x1, y1, adj), toItem(t, x0, y1, adj)];
  }
  function pointInQuad(p, q) {
    let pos = false, neg = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (c > 0) pos = true; else if (c < 0) neg = true;
      if (pos && neg) return false;
    }
    return true;
  }
  function quadBox(q) { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  /* runs grouped by <text> element, in document order: [{ el, runs:[index], str }] */
  function elements(texts) {
    const m = new Map();
    (texts || []).forEach((t, i) => { const k = t.el == null ? i : t.el; if (!m.has(k)) m.set(k, { el: k, runs: [], str: '' }); const e = m.get(k); e.runs.push(i); e.str += (e.str ? ' ' : '') + t.str; });
    return [...m.values()];
  }
  /* which characters of str a font cannot draw: substituted = drawn with the built-in font instead, missing = not at all */
  function coverage(str, font) {
    const substituted = new Set(), missing = new Set();
    for (const ch of String(str)) { const s = SW.glyphSource(ch, font); if (s === 'builtin') substituted.add(ch); else if (s == null) missing.add(ch); }
    return { substituted: [...substituted], missing: [...missing] };
  }
  return { capOf, runWidth, runQuad, toItem, toRun, pointInQuad, quadBox, elements, coverage };
})(typeof module !== 'undefined' ? require('../core.js') : SW);
if (typeof module !== 'undefined') module.exports = SWText;
