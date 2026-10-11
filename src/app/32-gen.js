/* ---------------- generated patterns (lib/45-gen.js) ----------------
 * item = { type: 'gen', gen: { kind, params, font, color }, src, … } – src is made from gen and re-made whenever the
 * parameters change, so the pattern stays editable. gen is replaced, never mutated (undo shares it). */
const GEN_ICON = { border: 'maximize', grid: 'rows', spiral: 'rotate', rosette: 'sparkle', lissajous: 'infinity', calendar: 'clock', namecard: 'type' };
/* translated names for calendars (comma-separated lists in the dictionary) */
const genCtx = g => ({ font: fontFor(g.font), months: t('gen.months').split(','), days: t('gen.days').split(',') });
function genSource(it) {
  const g = it.gen, key = g.color; ensureLayer(key, g.color);
  const r = SWGen.make(g.kind, g.params, genCtx(g));
  return { paths: r.paths.map(p => ({ layer: key, pts: p })), fills: [], w: Math.max(0.1, r.w), h: Math.max(0.1, r.h) };
}
/* a new pattern item, centred on the sheet (inside the margins when it fits) */
function makeGen(kind, params, opts = {}) {
  const gen = { kind, params: SWGen.clean(kind, params), font: opts.font || 'builtin', color: opts.color || (doc.penMode === SWPens.SINGLE ? doc.single.color : '#1d2433') };
  const it = { id: SW.uid(), type: 'gen', name: t('gen.kind.' + kind), visible: true, scale: 1, rot: 0, x: 0, y: 0, gen, hatch: { on: false, spacing: 1, angle: 45 } };
  it.src = genSource(it);
  it.x = Math.max(0, (page.w - it.src.w) / 2); it.y = Math.max(0, (page.h - it.src.h) / 2);
  return it;
}
/* change parameters (or font / colour): the pattern is re-made around its centre */
function updateGen(it, patch, opts = {}) {
  if (!it || it.type !== 'gen' || plotting) return;
  const [w0, h0] = itemSize(it), cx = it.x + w0 / 2, cy = it.y + h0 / 2;
  const g = Object.assign({}, it.gen, patch.font ? { font: patch.font } : null, patch.color ? { color: patch.color } : null);
  g.params = SWGen.clean(g.kind, Object.assign({}, it.gen.params, patch.params || {}));
  it.gen = g; it.src = genSource(it);
  if (opts.keepCentre !== false) { const [w1, h1] = itemSize(it); it.x = cx - w1 / 2; it.y = cy - h1 / 2; }
  invalidate(); renderObjects();
}
/* the sheet's inner area (inside the margin) as default size of borders and grids */
function genDefaults(kind) {
  const m = page.margin || 0, w = Math.max(10, page.w - 2 * m), h = Math.max(10, page.h - 2 * m), d = Object.assign({}, SWGen.DEFAULTS[kind]);
  if (kind === 'border' || kind === 'grid') { d.w = w; d.h = h; }
  if (kind === 'calendar') { d.w = Math.min(w, 150); d.h = Math.min(h, 110); }
  if (kind === 'namecard') d.cols = Math.max(1, Math.floor((w + d.gap) / (d.cw + d.gap)));
  return d;
}
function addGen(kind, params, opts) { if (plotting) return null; const it = makeGen(kind, Object.assign(genDefaults(kind), params || {}), opts); addItem(it); return it; }
