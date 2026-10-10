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
  const s = new Set(); for (const k in it.textStyle || {}) s.add(it.textStyle[k].font || 'builtin'); return [...s];
}
/* plotted text geometry of an SVG item: { polys:[{layer, pts}], unconverted: n elements } – cached per src + fonts */
const ttCache = new WeakMap();
function plottedTextPolys(it) {
  const texts = it.src.texts || [];
  const key = texts.map(r => { const s = textStyleOf(it, r.el); return s.mode === 'plot' ? (fontFor(s.font).id || 'builtin') : '-'; }).join('|');
  const c = ttCache.get(it);
  if (c && c.src === it.src && c.key === key) return c.res;
  const polys = [], un = new Set();
  for (const r of texts) {
    const s = textStyleOf(it, r.el);
    if (s.mode === 'plot') { const f = fontFor(s.font); for (const p of textPolys(r, f)) polys.push({ layer: r.layer, pts: p }); }
    else un.add(r.el);
  }
  const res = { polys, unconverted: un.size };
  ttCache.set(it, { src: it.src, key, res }); return res;
}
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
