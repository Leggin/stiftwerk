/* ---------------- canvas interaction ---------------- */
let dragging = null;

/* Hit testing, two passes: 1) the smallest item whose geometry (a stroke, or the inside of a filled area) is near the
 * click – so a small Text sitting inside a big SVG's bounding box stays clickable; 2) the smallest bounding box. */
function itemGeomHit(it, mm, tol) {
  const A = itemAffine(it), det = A[0] * A[3] - A[1] * A[2]; if (!det) return false;
  const dx = mm[0] - A[4], dy = mm[1] - A[5];
  const lx = (A[3] * dx - A[2] * dy) / det, ly = (-A[1] * dx + A[0] * dy) / det, lt = tol / Math.abs(it.scale || 1), lt2 = lt * lt;
  const own = SWJob.itemPolys(it, plottedTextPolys).polys;
  for (const p of own) {
    const pts = p.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = i + 1 < pts.length ? pts[i + 1] : a;
      if ((a[0] < lx - lt && b[0] < lx - lt) || (a[0] > lx + lt && b[0] > lx + lt) || (a[1] < ly - lt && b[1] < ly - lt) || (a[1] > ly + lt && b[1] > ly + lt)) continue;
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      const u = l2 ? Math.max(0, Math.min(1, ((lx - a[0]) * vx + (ly - a[1]) * vy) / l2)) : 0;
      const ex = a[0] + u * vx - lx, ey = a[1] + u * vy - ly;
      if (ex * ex + ey * ey <= lt2) return true;
    }
  }
  for (const f of it.src.fills || []) {
    let inside = false;
    for (const r of f.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > ly) !== (b[1] > ly) && lx < (b[0] - a[0]) * (ly - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
function hitItem(mm) {
  const tol = 6 / view.k; let geo = null, box = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]; if (!it.visible) continue;
    const b = itemBox(it);
    if (mm[0] < b.x - tol || mm[0] > b.x + b.w + tol || mm[1] < b.y - tol || mm[1] > b.y + b.h + tol) continue;
    const area = b.w * b.h;
    if (!box || area < box.area) box = { it, area };
    if ((!geo || area < geo.area) && itemGeomHit(it, mm, tol)) geo = { it, area };
  }
  const r = geo || box; return r ? r.it : null;
}
/* two fingers: pinch to zoom (and pan with the midpoint) */
const ptrs = new Map(); let pinch = null;
const pinchNow = () => { const [a, b] = [...ptrs.values()], r = cv.getBoundingClientRect(); return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, x: (a[0] + b[0]) / 2 - r.left, y: (a[1] + b[1]) / 2 - r.top }; };
cv.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  if (e.pointerType === 'mouse') { ptrs.clear(); pinch = null; }
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { dragging = null; cv.classList.remove('drag'); pinch = pinchNow(); cv.setPointerCapture(e.pointerId); return; }
  if (ptrs.size > 2) return;
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  const sel = plotting ? null : items.find(i => i.id === selId);
  if (sel) {
    const b = itemBox(sel), [hx, hy] = toScr(b.x + b.w, b.y + b.h);
    if (Math.abs(sx - hx) < 11 && Math.abs(sy - hy) < 11) { dragging = { mode: 'scale', it: sel, w0: b.w, s0: sel.scale, size0: sel.text && sel.text.size, x0: b.x }; cv.setPointerCapture(e.pointerId); return; }
  }
  const hit = plotting ? null : hitItem(mm);
  // Shift / Cmd / Ctrl + click: add to or remove from the selection (34-arrange.js)
  if (hit && selId && (e.shiftKey || e.metaKey || e.ctrlKey)) { toggleSelect(hit.id); return; }
  if (hit) {
    if (!isSelected(hit.id)) select(hit.id);
    const group = selectedItems();   // the whole selection moves together, snapping as one box
    dragging = { mode: 'move', it: hit, group, start: mm, x0: group.map(i => [i.x, i.y]), box0: SWLayout.union(group.map(itemBox)) };
  }
  else dragging = { mode: 'pan', sx, sy, ox: view.ox, oy: view.oy, empty: !plotting };
  // a listener may take over the drag (e.g. moving a selected text): claim({ move(mm, startMm), end(moved) })
  let claimed = null;
  SWUI.emit('canvas:down', { mm, it: hit, e, claim: h => { claimed = h; } });
  if (claimed) dragging = { mode: 'custom', h: claimed, start: mm };
  cv.setPointerCapture(e.pointerId); cv.classList.add('drag');
});
cv.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && ptrs.size === 2) {
    const n = pinchNow(), mm = toMm(pinch.x, pinch.y);
    view.k = Math.min(60, Math.max(0.2, view.k * n.d / pinch.d)); view.ox = n.x - mm[0] * view.k; view.oy = n.y - mm[1] * view.k;
    pinch = n; userView = true; render(); return;
  }
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  $('#cursorChip').textContent = (mm[0] >= 0 && mm[1] >= 0 && mm[0] <= page.w && mm[1] <= page.h) ? `x ${fmt(mm[0])} · y ${fmt(mm[1])} mm` : 'x — · y —';
  if (!dragging) { SWUI.emit('canvas:move', { mm, e }); return; }
  const d = dragging;
  if (d.mode === 'pan') {
    if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 3) d.moved = true;
    if (d.moved) { view.ox = d.ox + sx - d.sx; view.oy = d.oy + sy - d.sy; userView = true; render(); }
    return;
  }
  if (d.mode === 'custom') { d.h.move(mm, d.start); d.moved = true; render(); return; }
  if (d.mode === 'move') {
    let dx = Math.round((mm[0] - d.start[0]) * 10) / 10, dy = Math.round((mm[1] - d.start[1]) * 10) / 10;
    const b = d.box0, sn = snapMove({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, d.group, e);   // Alt: no snapping
    dx += sn.dx; dy += sn.dy;
    d.group.forEach((it, i) => { it.x = d.x0[i][0] + dx; it.y = d.x0[i][1] + dy; });
    d.moved = true; render(); renderProps(true); return;
  }
  if (d.mode === 'scale') {
    const f = Math.max(0.02, (mm[0] - d.x0) / d.w0);
    if (d.it.type === 'text') { d.it.text.size = Math.max(0.5, d.size0 * f); d.it.src = textSource(d.it); } else d.it.scale = d.s0 * f;
    d.moved = true; render(); renderProps(true);
  }
});
const endDrag = e => {
  if (e && e.pointerId != null) { ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; cv.classList.remove('drag'); return; } }
  const d = dragging; dragging = null; cv.classList.remove('drag'); snapGuides = [];
  if (d && d.mode === 'pan' && d.empty && !d.moved) select(null);           // a click on the empty sheet deselects
  else if (d && d.mode === 'custom') { if (d.h.end) d.h.end(!!d.moved); }
  else if (d && d.moved && d.mode !== 'pan') invalidate(true);
  render();
};
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', e => { if (dragging && dragging.mode === 'pan') dragging.moved = true; endDrag(e); });
cv.addEventListener('pointerleave', () => { $('#cursorChip').textContent = 'x — · y —'; SWUI.emit('canvas:leave'); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  const f = Math.exp(-e.deltaY * 0.0015); view.k = Math.min(60, Math.max(0.2, view.k * f));
  view.ox = sx - mm[0] * view.k; view.oy = sy - mm[1] * view.k; userView = true; render();
}, { passive: false });
cv.addEventListener('dblclick', () => { fitView(); render(); });
const zoomBy = f => { const r = cv.getBoundingClientRect(), sx = r.width / 2, sy = r.height / 2, mm = toMm(sx, sy); view.k = Math.min(60, Math.max(0.2, view.k * f)); view.ox = sx - mm[0] * view.k; view.oy = sy - mm[1] * view.k; userView = true; render(); };
$('#zIn').onclick = () => zoomBy(1.3); $('#zOut').onclick = () => zoomBy(1 / 1.3); $('#zFit').onclick = () => { fitView(); render(); };
$('#showTravel').checked = S.showTravel; $('#showTravel').onchange = e => { S.showTravel = e.target.checked; saveS(); render(); };
$('#sim').oninput = e => pbScrub(e.target.value / 1000);
SWUI.on('playback', st => { const el = $('#sim'); if (el && document.activeElement !== el) el.value = Math.round(st.frac * 1000); });
new ResizeObserver(resize).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* undo / redo buttons on the canvas */
function renderHistoryBtns() {
  $('#btnUndo').disabled = plotting || !(history.canUndo || (saveTimer && saveUser));
  $('#btnRedo').disabled = plotting || !history.canRedo;
}
$('#btnUndo').onclick = () => { undo(); };
$('#btnRedo').onclick = () => { redo(); };
SWUI.on('history', renderHistoryBtns); SWUI.on('plot', renderHistoryBtns); SWUI.on('job', renderHistoryBtns);
