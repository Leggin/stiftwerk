/* ---------------- SVG text model ----------------
 * Each <text> element of an SVG item has a style: it.textStyle[el] = { mode: 'svg' | 'plot', font }.
 *  'svg'  – shown in its original SVG font, not plotted;  'plot' – drawn with a plotter font.
 * Runs (it.src.texts[i]) carry their element index t.el. textStyle is replaced, never mutated (undo shares it). */
/* UI state of the "Texte & Schriften" feature (not persisted):
 *  txSel – sub-selection { id (item), els:[<text> element indices] };  txHover – element under the pointer { id, el } (canvas or list);
 *  txPreview – ghost preview { font } of the hovered font option on the selected texts;  txCompare – overlay of the original rendering */
let txSel = { id: null, els: [] }, txHover = null, txPreview = null, txCompare = false;
const textStyleOf = (it, el) => (it.textStyle && it.textStyle[el]) || { mode: 'svg', font: 'builtin' };
const textEls = it => SWText.elements(it.src.texts || []);
function setTextStyle(it, els, patch) {
  const ts = Object.assign({}, it.textStyle);
  for (const el of els) ts[el] = Object.assign({}, textStyleOf(it, el), patch);
  it.textStyle = ts;
}
function textCounts(it) {
  const els = textEls(it); let plotted = 0;
  for (const e of els) if (textStyleOf(it, e.el).mode === 'plot') plotted++;
  return { total: els.length, plotted, unconverted: els.length - plotted };
}
/* fonts referenced by an item (for preloading and refresh after a font has loaded) */
function itemFontIds(it) {
  if (it.type === 'text') return [it.font || 'builtin'];
  if (it.type === 'gen') return [it.gen.font || 'builtin'];
  const s = new Set(); for (const k in it.textStyle || {}) s.add(it.textStyle[k].font || 'builtin'); return [...s];
}
/* plotted text geometry of an SVG item: { polys:[{layer, pts, z?}], unconverted: n elements } – cached per src + fonts */
const ttCache = new WeakMap();
function plottedTextPolys(it) {
  const texts = it.src.texts || [];
  const key = texts.map(r => { const s = textStyleOf(it, r.el); return s.mode === 'plot' ? (fontFor(s.font).id || 'builtin') + '@' + (s.k || 1) + ',' + (s.dx || 0) + ',' + (s.dy || 0) + (s.bold ? 'b' : '') + (s.italic ? 'i' : '') : '-'; }).join('|');
  const c = ttCache.get(it);
  if (c && c.src === it.src && c.key === key) return c.res;
  const polys = [], un = new Set();
  for (const r of texts) {
    const s = textStyleOf(it, r.el);
    if (s.mode === 'plot') { const f = fontFor(s.font), adj = textAdj(it, r.el); for (const p of textPolys(r, f, adj, textLook(s))) polys.push(r.z != null ? { layer: r.layer, pts: p, z: r.z } : { layer: r.layer, pts: p }); }
    else un.add(r.el);
  }
  const res = { polys, unconverted: un.size };
  ttCache.set(it, { src: it.src, key, res }); return res;
}
/* bold / italic of a <text> element: taken from the SVG on import (font-weight ≥ 600, font-style italic), switchable */
const textLook = s => s.bold || s.italic ? { bold: !!s.bold, italic: !!s.italic } : null;
/* page-mm bounding box of an item including plotted text (a wider plotter font can exceed src.w/h) */
const boxCache = new WeakMap();
function itemBox(it) {
  const [w, h] = itemSize(it);
  if (!it.src.texts || !it.src.texts.length) return { x: it.x, y: it.y, w, h };
  const tx = plottedTextPolys(it), key = [tx, it.x, it.y, it.scale, it.rot].map(v => typeof v === 'object' ? '' : v).join('|');
  const c = boxCache.get(it);
  if (c && c.tx === tx && c.key === key) return c.box;
  let x0 = it.x, y0 = it.y, x1 = it.x + w, y1 = it.y + h;
  for (const p of tx.polys) for (const q of p.pts) { const [a, b] = xf(it, q); if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  boxCache.set(it, { tx, key, box }); return box;
}

/* one entry per <text> element: { el, str, runs, mode, font } – for lists and checks */
function textInfo(it) {
  return textEls(it).map(e => { const s = textStyleOf(it, e.el); return { el: e.el, str: e.str, runs: e.runs, mode: s.mode === 'plot' ? 'plot' : 'svg', font: s.font || 'builtin' }; });
}
/* characters a loaded font cannot draw: { substituted, missing } or null while the font is still loading */
function textCoverage(str, fontId) {
  const f = !fontId || fontId === 'builtin' ? SW.BUILTIN : fontCache.get(fontId);
  return f ? SWText.coverage(str, f) : null;
}

/* ---- size & position of plotted texts ----
 * textStyle[el].k = size factor (1 = as computed from the SVG font size), dx/dy = offset in item-local mm.
 * The text is scaled around its anchor (the first run's x/y: start, middle or end of the baseline). */
function textAdj(it, el) {
  const s = textStyleOf(it, el);
  if (s.mode !== 'plot' || ((s.k || 1) === 1 && !s.dx && !s.dy)) return null;
  const r = (it.src.texts || []).find(t => t.el === el); if (!r) return null;
  return { k: s.k || 1, ax: r.x, ay: r.y, dx: s.dx || 0, dy: s.dy || 0 };
}
/* page-mm delta ↔ item-local delta (item scale and 90° rotations) */
function pageToItemDelta(it, dx, dy) { const A = itemAffine(it), d = A[0] * A[3] - A[1] * A[2]; return d ? [(A[3] * dx - A[2] * dy) / d, (-A[1] * dx + A[0] * dy) / d] : [0, 0]; }
function itemToPageDelta(it, dx, dy) { const A = itemAffine(it); return [A[0] * dx + A[2] * dy, A[1] * dx + A[3] * dy]; }
/* adjust several elements at once (one undo step): fn(style) → patch */
function adjustTexts(it, els, fn) {
  const ts = Object.assign({}, it.textStyle);
  for (const el of els) { const s = textStyleOf(it, el); ts[el] = Object.assign({}, s, fn(s)); }
  it.textStyle = ts;
}
/* move by a page-mm delta */
function moveTexts(it, els, dxPage, dyPage) { const [dx, dy] = pageToItemDelta(it, dxPage, dyPage); adjustTexts(it, els, s => ({ dx: (s.dx || 0) + dx, dy: (s.dy || 0) + dy })); }
/* size: absolute factor (k) or relative (mul) */
function sizeTexts(it, els, { k, mul }) { adjustTexts(it, els, s => ({ k: Math.min(10, Math.max(0.05, k != null ? k : (s.k || 1) * mul)) })); }
function resetTextAdj(it, els) { adjustTexts(it, els, () => ({ k: 1, dx: 0, dy: 0 })); }
/* current values for the UI: size factor and page-mm offset of the first element, plus whether the selection differs */
function textAdjInfo(it, els) {
  const ss = els.map(el => textStyleOf(it, el)), s = ss[0] || {};
  const [px, py] = itemToPageDelta(it, s.dx || 0, s.dy || 0);
  const sig = x => [(x.k || 1).toFixed(4), (x.dx || 0).toFixed(3), (x.dy || 0).toFixed(3)].join();
  return { k: s.k || 1, x: px, y: py, mixed: ss.some(x => sig(x) !== sig(s)), changed: ss.some(x => (x.k || 1) !== 1 || x.dx || x.dy) };
}
