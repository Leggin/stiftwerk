/* ---------------- canvas overlays for the text tools ----------------
 *  compare  – the original rendering in dusty rose, multiplied onto the sheet (behind the plotter strokes, visually)
 *  ghost    – the hovered font drawn on the selected texts (nothing is committed), the current rendering is veiled
 *  marks    – outlines of the selected texts, the hovered text, and the "Vorschau: …" chip */
const txGhostCache = { src: null, key: '', polys: [] };
/* polylines (item-local mm) of the selected elements drawn with the font under preview; null = still loading */
function txGhostPolys(it, els, fontId) {
  const f = fontId === 'builtin' ? SW.BUILTIN : fontCache.get(fontId);
  if (!f) { loadFont(fontId).then(() => render(), () => { }); return null; }
  const key = els.join(',') + '|' + fontId;
  if (txGhostCache.src !== it.src || txGhostCache.key !== key) {
    const polys = []; for (const t of it.src.texts) if (els.includes(t.el)) for (const p of textPolys(t, f)) polys.push(p);
    txGhostCache.src = it.src; txGhostCache.key = key; txGhostCache.polys = polys;
  }
  return txGhostCache.polys;
}
/* the accent as seen on the (always light) sheet: in the dark theme the accent token is light, so it is darkened */
function txOnSheet(col) {
  const m = /^#([0-9a-f]{6})$/i.exec(tok('--bg')); const dark = m ? (parseInt(m[1].slice(0, 2), 16) * 0.3 + parseInt(m[1].slice(2, 4), 16) * 0.6 + parseInt(m[1].slice(4), 16) * 0.1) < 110 : false;
  return dark ? `color-mix(in srgb, ${col} 42%, #000)` : col;
}
function txPath(c, pts) { pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
/* selected texts that are affected by the current preview (a preview of the font a text already has shows nothing) */
function txPreviewTargets(it) {
  if (!txPreview || !txSel.els.length) return [];
  return txSel.els.filter(el => { const s = textStyleOf(it, el); return !(s.mode === 'plot' && s.font === txPreview.font); });
}
SWUI.overlays.register({
  id: 'txCompare', order: 12, draw(c) {
    if (!txCompare || !txSel.els.length) return;
    const it = txCur(); if (!it) return;
    const A = mul([view.k, 0, 0, view.k, view.ox, view.oy], itemAffine(it)), rose = tok('--rose');
    for (const t of it.src.texts) if (txSel.els.includes(t.el) && textStyleOf(it, t.el).mode === 'plot')
      txPaintRun(c, t, mul(A, t.M), { color: rose, alpha: 0.85, fill: true, composite: 'multiply' });
  }
});
SWUI.overlays.register({
  id: 'txGhost', order: 13, draw(c) {
    if (!txPreview) return;
    const it = txCur(); if (!it) return;
    const els = txPreviewTargets(it); if (!els.length) return;
    // veil over what is there now, then the preview
    c.save(); c.fillStyle = tok('--sheet'); c.globalAlpha = 0.82; c.beginPath();
    for (const t of it.src.texts) if (els.includes(t.el)) txPath(c, txScr(it, txRunQuad(it, t, txPadRun(it, t, 3))));
    c.fill(); c.restore();
    const polys = txGhostPolys(it, els, txPreview.font); if (!polys) return;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = txOnSheet(tok('--accent')); c.globalAlpha = 0.92; c.lineWidth = Math.max(1.4, S.penWidth * view.k * 1.1); c.beginPath();
    for (const p of polys) p.forEach((q, i) => { const [a, b] = toScr(...xf(it, q)); i ? c.lineTo(a, b) : c.moveTo(a, b); });
    c.stroke(); c.restore();
  }
});
SWUI.overlays.register({
  id: 'txMarks', order: 14, clip: false, draw(c) {
    if (plotting || (!txSel.els.length && !txHover)) return;
    const it = txCur(); if (!it) return;
    const runs = el => it.src.texts.filter(t => t.el === el);
    const accent = txOnSheet(tok('--accent')), rose = tok('--rose');
    c.save(); c.lineJoin = 'round';
    // hovered text (subtle)
    if (txHover && txHover.id === it.id && !txSel.els.includes(txHover.el)) {
      c.beginPath(); for (const t of runs(txHover.el)) txPath(c, txScr(it, txRunQuad(it, t, txPadRun(it, t, 2.5))));
      c.globalAlpha = 0.2; c.fillStyle = rose; c.fill(); c.globalAlpha = 1; c.strokeStyle = rose; c.lineWidth = 1.5; c.stroke();
    }
    // selected texts
    const boxes = [];
    if (txSel.els.length) {
      c.beginPath();
      for (const el of txSel.els) for (const t of runs(el)) { const q = txScr(it, txRunQuad(it, t, txPadRun(it, t, 3))); txPath(c, q); boxes.push(...q); }
      c.globalAlpha = 0.09; c.fillStyle = accent; c.fill(); c.globalAlpha = 1; c.strokeStyle = accent; c.lineWidth = 2; c.stroke();
    }
    c.restore();
    // chip: "Vorschau: Hershey Script"
    const targets = txPreviewTargets(it);
    if (targets.length) {
      const pts = []; for (const t of it.src.texts) if (targets.includes(t.el)) pts.push(...txScr(it, txRunQuad(it, t, txPadRun(it, t, 3))));
      const loading = txPreview.font !== 'builtin' && !fontCache.has(txPreview.font), failed = loading && txFail.has(txPreview.font);
      txChip(c, pts, t(failed ? 'texts.preview.failed' : loading ? 'texts.preview.loading' : 'texts.preview.chip', { font: fontName(txPreview.font) }));
    }
  }
});
/* small pill above (or below) a set of screen points */
function txChip(c, pts, text) {
  if (!pts.length) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, top = Math.min(...ys), bottom = Math.max(...ys);
  const W = cv.getBoundingClientRect().width;
  c.save(); c.font = '600 11.5px "DM Sans", system-ui, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  const w = Math.ceil(c.measureText(text).width) + 20, h = 24;
  const x = Math.max(8, Math.min(W - w - 8, cx - w / 2)), y = top - h - 8 >= 8 ? top - h - 8 : bottom + 8;
  c.shadowColor = 'rgba(40, 30, 20, .22)'; c.shadowBlur = 8; c.shadowOffsetY = 2;
  c.fillStyle = tok('--accent'); c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, h / 2) : c.rect(x, y, w, h); c.fill();
  c.shadowColor = 'transparent'; c.fillStyle = tok('--on-accent'); c.fillText(text, x + 10, y + h / 2 + 0.5);
  c.restore();
}
