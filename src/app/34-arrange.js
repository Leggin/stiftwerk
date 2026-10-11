/* ---------------- arranging: multi-selection, align / distribute, order, snapping, copies ----------------
 * selId stays the primary selection (inspector); selMore holds further selected ids (Shift-click on the sheet or in
 * the object list). Everything here works on selectedItems() = primary + extras, in document order. */
const selMore = new Set();
const selectedItems = () => items.filter(i => i.id === selId || selMore.has(i.id));
const isSelected = id => id === selId || selMore.has(id);
/* Shift-click: add to / remove from the selection (the primary moves to another selected item when it is removed) */
function toggleSelect(id) {
  if (!items.some(i => i.id === id)) return;
  if (!selId) { select(id); return; }
  if (id === selId) { const next = [...selMore][0]; if (!next) return; selMore.delete(next); select(next, true); }
  else if (selMore.has(id)) selMore.delete(id);
  else selMore.add(id);
  renderObjects(); render(); SWUI.emit('select', selId);
}
function selectAll() { if (!items.length) return; const vis = items.filter(i => i.visible); if (!vis.length) return; select(vis[0].id); for (const it of vis.slice(1)) selMore.add(it.id); renderObjects(); render(); SWUI.emit('select', selId); }
function removeSelected() {
  const ids = new Set(selectedItems().map(i => i.id)); if (!ids.size || plotting) return;
  items = items.filter(i => !ids.has(i.id)); select(null); invalidate(true); renderProps();
  toast(tn('arrange.toast.removed', ids.size), { action: { label: t('common.undo'), run: undo } });
}
/* move by page mm (several items) */
function moveItems(list, dx, dy) { for (const it of list) { it.x = Math.round((it.x + dx) * 100) / 100; it.y = Math.round((it.y + dy) * 100) / 100; } }
/* the sheet (or the area inside its margin) as a box */
const pageBox = inner => { const m = inner ? page.margin || 0 : 0; return { x: m, y: m, w: page.w - 2 * m, h: page.h - 2 * m }; };
/* mode: left | hcenter | right | top | vcenter | bottom. One object (or toPage): to the sheet's margin box,
 * several: to their common bounds */
function alignSelected(mode, toPage) {
  const list = selectedItems(); if (!list.length || plotting) return;
  const boxes = list.map(itemBox), ref = toPage || list.length === 1 ? pageBox(true) : null;
  SWLayout.align(boxes, mode, ref).forEach((d, i) => moveItems([list[i]], d.dx, d.dy));
  invalidate(); renderProps(true);
}
function distributeSelected(axis) {
  const list = selectedItems(); if (list.length < 3 || plotting) return;
  SWLayout.distribute(list.map(itemBox), axis).forEach((d, i) => moveItems([list[i]], d.dx, d.dy));
  invalidate(); renderProps(true);
}
/* drawing order = order in items (later = on top, plotted later within a pen): front | back | up | down */
function orderSelected(dir) {
  const sel = new Set(selectedItems().map(i => i.id)); if (!sel.size || plotting) return;
  const keep = items.filter(i => !sel.has(i.id)), moving = items.filter(i => sel.has(i.id));
  if (dir === 'front') items = keep.concat(moving);
  else if (dir === 'back') items = moving.concat(keep);
  else {
    const arr = items.slice(), step = dir === 'up' ? 1 : -1;
    const idx = arr.map((it, i) => sel.has(it.id) ? i : -1).filter(i => i >= 0);
    for (const i of step > 0 ? idx.reverse() : idx) { const j = i + step; if (j < 0 || j >= arr.length || sel.has(arr[j].id)) continue; [arr[i], arr[j]] = [arr[j], arr[i]]; }
    items = arr;
  }
  invalidate(); renderObjects();
}
const canOrder = dir => { const sel = new Set(selectedItems().map(i => i.id)); if (!sel.size) return false; const first = items.findIndex(i => sel.has(i.id)), last = items.length - 1 - [...items].reverse().findIndex(i => sel.has(i.id)); return dir === 'front' || dir === 'up' ? last < items.length - 1 || sel.size < items.length - first - (items.length - 1 - last) : first > 0; };

/* ---- snapping while dragging: edges / centres of the sheet, its margins and the other objects ---- */
let snapOn = store.get('snap', true), snapGuides = [];
function setSnap(on) { snapOn = !!on; store.set('snap', snapOn); SWUI.emit('arrange'); }
/* box = the moving selection's bounds after the raw move → { dx, dy } correction (and guides to draw) */
function snapMove(box, moving, e) {
  snapGuides = [];
  if (!snapOn || (e && e.altKey)) return { dx: 0, dy: 0 };
  const ids = new Set(moving.map(i => i.id)), others = items.filter(i => i.visible && !ids.has(i.id)).map(itemBox);
  const { xs, ys } = SWLayout.snapLines(page, others), r = SWLayout.snap(box, xs, ys, 7 / view.k);
  snapGuides = r.guides; return r;
}
SWUI.overlays.register({
  id: 'snap', order: 5, clip: false,
  draw(ctx) {
    if (!snapGuides.length || !dragging) return;
    ctx.save(); ctx.strokeStyle = tok('--accent'); ctx.globalAlpha = .75; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath();
    for (const g of snapGuides) {
      if (g.axis === 'x') { const [a, b0] = toScr(g.at, -5), [, b1] = toScr(g.at, page.h + 5); ctx.moveTo(Math.round(a) + .5, b0); ctx.lineTo(Math.round(a) + .5, b1); }
      else { const [a0, b] = toScr(-5, g.at), [a1] = toScr(page.w + 5, g.at); ctx.moveTo(a0, Math.round(b) + .5); ctx.lineTo(a1, Math.round(b) + .5); }
    }
    ctx.stroke(); ctx.restore();
  }
});
/* extra selected objects: a dashed frame like the primary one (without the scale handle) */
SWUI.overlays.register({
  id: 'multisel', order: 4, clip: false,
  draw(ctx) {
    if (!selMore.size || step !== 'motiv') return;
    ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.25; ctx.strokeStyle = tok('--accent');
    for (const it of items) if (selMore.has(it.id) && it.visible) { const b = itemBox(it), [a, c] = toScr(b.x, b.y); ctx.strokeRect(Math.round(a) + .5, Math.round(c) + .5, b.w * view.k, b.h * view.k); }
    ctx.restore();
  }
});

/* ---- copies on one sheet ----
 * opts = { cols, rows, gap, fill (as many as fit), area: 'margin' | 'page', marks (cut marks) }. The original becomes
 * the first copy; the others are real duplicates (each editable). Returns { made, cols, rows, fits } */
function copiesPlan(it, opts) { const b = itemBox(it), off = [b.x - it.x, b.y - it.y]; return { b, off, g: SWLayout.grid(b.w, b.h, pageBox(opts.area !== 'page'), opts) }; }
function makeCopies(id, opts) {
  const it = items.find(i => i.id === id); if (!it || plotting) return null;
  const { b, off, g } = copiesPlan(it, opts);
  const list = [];
  g.positions.forEach((p, i) => {
    const c = i === 0 ? it : Object.assign(copyItem(it), { id: SW.uid(), name: t('copies.name', { name: itemName(it), n: i + 1 }) });
    if (i > 0) { delete c.nameKey; delete c.sample; delete c.notes; }
    c.x = p.x - off[0]; c.y = p.y - off[1]; list.push(c);
  });
  const at = items.indexOf(it); items.splice(at + 1, 0, ...list.slice(1));
  if (opts.marks) {
    const boxes = g.positions.map(p => ({ x: p.x, y: p.y, w: b.w, h: b.h })), key = '#2e2e2c';
    ensureLayer(key, key);
    const n = normalise(SWLayout.cutMarks(boxes, opts.markLen || 4, opts.markOff || 1.5).map(pts => ({ layer: key, pts })), []);
    items.push({ id: SW.uid(), type: 'svg', name: t('copies.marks'), visible: true, scale: 1, rot: 0, x: n.x, y: n.y, src: n.src, hatch: { on: false, spacing: 1, angle: 45 } });
  }
  select(it.id); for (const c of list.slice(1)) selMore.add(c.id);
  invalidate(true); renderObjects(); render();
  return { made: list.length, cols: g.cols, rows: g.rows, fits: g.fits };
}
