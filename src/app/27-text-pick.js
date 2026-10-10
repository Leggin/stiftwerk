/* ---------------- picking single <text> elements ----------------
 * txSel (25-text-model.js) is the sub-selection inside the selected SVG item. Texts can be picked on the sheet
 * (click, Shift/Cmd-click to add, Alt-click to cycle through overlapping ones) or in the list (26-text-ui.js). */
/* the selected SVG item with texts, or null; keeps txSel consistent with it */
function txCur() {
  const it = items.find(i => i.id === selId);
  if (!it || it.type !== 'svg' || !it.src.texts || !it.src.texts.length) { if (txSel.id || txSel.els.length) txSel = { id: null, els: [] }; return null; }
  if (txSel.id !== it.id) txSel = { id: it.id, els: [] };
  const ok = new Set(textEls(it).map(e => e.el)), els = txSel.els.filter(e => ok.has(e));
  if (els.length !== txSel.els.length) txSel = { id: it.id, els };
  return it;
}
let txAnchor = null; // last single pick (start of Shift-ranges in the list)
/* replace the sub-selection. opts.reveal: pan the sheet so the texts are visible */
function txSetSel(els, opts = {}) {
  const it = txCur(); if (!it) return;
  const order = textEls(it).map(e => e.el), set = new Set(els);
  const next = order.filter(e => set.has(e));
  const same = next.length === txSel.els.length && next.every((e, i) => e === txSel.els[i]);
  txSel = { id: it.id, els: next }; txPreview = null;
  if (opts.anchor !== false && next.length === 1) txAnchor = next[0];
  if (!same) { txRefresh(); if (opts.reveal) txReveal(it, next); render(); }
}
function txSetHover(h) {
  const same = (!h && !txHover) || (h && txHover && h.id === txHover.id && h.el === txHover.el);
  if (same) return;
  txHover = h; render();
  const row = document.querySelectorAll('#props .tx-row.is-hover'); row.forEach(r => r.classList.remove('is-hover'));
  if (h) { const r = document.querySelector(`#props .tx-row[data-el="${h.el}"]`); if (r) r.classList.add('is-hover'); }
}

/* ---- geometry of a run ---- */
const txRunWidths = new WeakMap();
let txMeasureCtx = null;
/* width (run units) of the run in its original SVG font, measured with the browser */
function txOriginalWidth(t) {
  const c = txRunWidths.get(t); if (c != null) return c;
  if (!txMeasureCtx) txMeasureCtx = document.createElement('canvas').getContext('2d');
  const m = txMeasureCtx; svgRunFont(m, t, t.fs * 100);
  let w;
  if ('letterSpacing' in m) { m.letterSpacing = (t.ls * 100) + 'px'; w = m.measureText(t.str).width / 100; } else w = m.measureText(t.str).width / 100 + t.ls * [...t.str].length;
  txRunWidths.set(t, w); return w;
}
/* width (run units) of the run as it is shown now: plotter font or original */
function txRunWidth(it, t) {
  const s = textStyleOf(it, t.el);
  return s.mode === 'plot' ? SWText.runWidth(t, fontFor(s.font)) : txOriginalWidth(t);
}
/* box of a run in its own units (cap top to descender), grown by pad */
function txRunBox(it, t, pad = 0) {
  const w = txRunWidth(it, t), capH = SWText.capOf(t), dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0;
  return { x0: t.x + dx - pad, x1: t.x + dx + w + pad, y0: t.y - capH * 1.05 - pad, y1: t.y + capH * 0.35 + pad };
}
/* quad of a run in item-local mm (pad in run units) */
function txRunQuad(it, t, pad = 0) {
  if (!pad) return SWText.runQuad(t, txRunWidth(it, t));
  const b = txRunBox(it, t, pad), M = t.M, ap = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  return [ap(b.x0, b.y0), ap(b.x1, b.y0), ap(b.x1, b.y1), ap(b.x0, b.y1)];
}
/* a screen-pixel margin as run units */
const txPadRun = (it, t, px) => px / (view.k * it.scale * (Math.sqrt(Math.abs(t.M[0] * t.M[3] - t.M[1] * t.M[2])) || 1));
const txScr = (it, q) => q.map(p => toScr(...xf(it, p)));
/* elements under a page-mm point, smallest first: [{ el, area }] */
function txHits(it, mm) {
  const A = itemAffine(it), det = A[0] * A[3] - A[1] * A[2]; if (!det) return [];
  const x = (A[3] * (mm[0] - A[4]) - A[2] * (mm[1] - A[5])) / det, y = (-A[1] * (mm[0] - A[4]) + A[0] * (mm[1] - A[5])) / det; // item-local mm
  const best = new Map();
  for (const t of it.src.texts) {
    const M = t.M, d = M[0] * M[3] - M[1] * M[2]; if (!d) continue;
    const rx = (M[3] * (x - M[4]) - M[2] * (y - M[5])) / d, ry = (-M[1] * (x - M[4]) + M[0] * (y - M[5])) / d; // run units
    const b = txRunBox(it, t, txPadRun(it, t, 3));
    if (rx < b.x0 || rx > b.x1 || ry < b.y0 || ry > b.y1) continue;
    const area = (b.x1 - b.x0) * (b.y1 - b.y0) * Math.abs(d);
    if (!best.has(t.el) || area < best.get(t.el)) best.set(t.el, area);
  }
  return [...best].map(([el, area]) => ({ el, area })).sort((p, q) => p.area - q.area);
}

/* ---- the sheet: click, hover ---- */
SWUI.on('select', () => { txCur(); txHover = null; txPreview = null; txAnchor = null; });
SWUI.on('canvas:down', ({ mm, it, e }) => {
  if (plotting) return;
  const sel = txCur();
  const target = it && it.type === 'svg' && it.src.texts && it.src.texts.length ? it : (!it && sel ? sel : null); // texts may stick out of the item's frame
  if (!target || target !== sel) return;
  const hits = txHits(target, mm), add = e && (e.shiftKey || e.metaKey || e.ctrlKey);
  if (!hits.length) { if (!add && txSel.els.length) txSetSel([]); return; }
  let pick = hits[0].el;
  if (e && e.altKey && hits.length > 1) { const i = hits.findIndex(h => txSel.els.length === 1 && h.el === txSel.els[0]); pick = hits[(i + 1) % hits.length].el; }
  if (add) { const s = new Set(txSel.els); if (s.has(pick)) s.delete(pick); else s.add(pick); txSetSel([...s]); }
  else txSetSel([pick]);
  if (txSel.els.length) setTimeout(() => { const r = document.querySelector(`#props .tx-row[data-el="${pick}"]`); if (r) r.scrollIntoView({ block: 'nearest' }); }, 0);
});
SWUI.on('canvas:move', ({ mm }) => {
  const it = txCur(); if (!it || plotting) { txCanvasCursor(false); return txSetHover(null); }
  const hits = txHits(it, mm), h = hits.length ? { id: it.id, el: hits[0].el } : null;
  txCanvasCursor(!!h); txSetHover(h);
});
SWUI.on('canvas:leave', () => { txCanvasCursor(false); txSetHover(null); });
function txCanvasCursor(on) { cv.style.cursor = on ? 'pointer' : ''; }

/* ---- bring texts into view (list selection) ---- */
let txPanRaf = 0;
function txReveal(it, els) {
  const r = cv.getBoundingClientRect(), pts = [];
  for (const t of it.src.texts) if (els.includes(t.el)) pts.push(...txScr(it, txRunQuad(it, t)));
  if (!pts.length || !r.width) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mx = 28, top = 52, bot = 76, W = r.width, H = r.height;
  const fit = (lo, hi, a, b) => (hi - lo > b - a) ? (a + b) / 2 - (lo + hi) / 2 : lo < a ? a - lo : hi > b ? b - hi : 0;
  const dx = fit(x0, x1, mx, W - mx), dy = fit(y0, y1, top, H - bot);
  if (!dx && !dy) return;
  cancelAnimationFrame(txPanRaf);
  const ox = view.ox, oy = view.oy, t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
  const step = now => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
    view.ox = ox + dx * e; view.oy = oy + dy * e; render();
    if (k < 1) txPanRaf = requestAnimationFrame(step);
  };
  txPanRaf = requestAnimationFrame(step);
}
