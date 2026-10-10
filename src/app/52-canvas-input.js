/* canvas interaction */
let dragging = null;
function hitItem(mm) {
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (!it.visible) continue; const [w, h] = itemSize(it); const t = 3 / view.k; if (mm[0] >= it.x - t && mm[0] <= it.x + w + t && mm[1] >= it.y - t && mm[1] <= it.y + h + t) return it; }
  return null;
}
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  const sel = items.find(i => i.id === selId);
  if (sel) { const [w, h] = itemSize(sel); const [hx, hy] = toScr(sel.x + w, sel.y + h); if (Math.abs(sx - hx) < 9 && Math.abs(sy - hy) < 9) { dragging = { mode: 'scale', it: sel, w0: w, s0: sel.scale, size0: sel.text && sel.text.size, x0: sel.x }; cv.setPointerCapture(e.pointerId); return; } }
  const hit = plotting ? null : hitItem(mm);
  if (hit) { select(hit.id); dragging = { mode: 'move', it: hit, dx: mm[0] - hit.x, dy: mm[1] - hit.y }; }
  else dragging = { mode: 'pan', sx, sy, ox: view.ox, oy: view.oy };
  SWUI.emit('canvas:down', { mm, it: hit, e });
  cv.setPointerCapture(e.pointerId); cv.classList.add('drag');
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  $('#cursorChip').textContent = (mm[0] >= 0 && mm[1] >= 0 && mm[0] <= page.w && mm[1] <= page.h) ? `x ${fmt(mm[0])} · y ${fmt(mm[1])} mm` : 'x — · y —';
  if (!dragging) { SWUI.emit('canvas:move', { mm, e }); return; }
  const d = dragging;
  if (d.mode === 'pan') { view.ox = d.ox + sx - d.sx; view.oy = d.oy + sy - d.sy; render(); return; }
  if (d.mode === 'move') { d.it.x = Math.round((mm[0] - d.dx) * 10) / 10; d.it.y = Math.round((mm[1] - d.dy) * 10) / 10; d.moved = true; render(); renderProps(true); return; }
  if (d.mode === 'scale') {
    const f = Math.max(0.02, (mm[0] - d.x0) / d.w0);
    if (d.it.type === 'text') { d.it.text.size = Math.max(0.5, d.size0 * f); d.it.src = textSource(d.it); } else d.it.scale = d.s0 * f;
    d.moved = true; render(); renderProps(true);
  }
});
const endDrag = () => { if (dragging && dragging.moved) invalidate(true); dragging = null; cv.classList.remove('drag'); render(); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { $('#cursorChip').textContent = 'x — · y —'; SWUI.emit('canvas:leave'); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, mm = toMm(sx, sy);
  const f = Math.exp(-e.deltaY * 0.0015); view.k = Math.min(60, Math.max(0.2, view.k * f));
  view.ox = sx - mm[0] * view.k; view.oy = sy - mm[1] * view.k; render();
}, { passive: false });
cv.addEventListener('dblclick', () => { fitView(); render(); });
const zoomBy = f => { const r = cv.getBoundingClientRect(), sx = r.width / 2, sy = r.height / 2, mm = toMm(sx, sy); view.k = Math.min(60, Math.max(0.2, view.k * f)); view.ox = sx - mm[0] * view.k; view.oy = sy - mm[1] * view.k; render(); };
$('#zIn').onclick = () => zoomBy(1.3); $('#zOut').onclick = () => zoomBy(1 / 1.3); $('#zFit').onclick = () => { fitView(); render(); };
$('#showTravel').checked = S.showTravel; $('#showTravel').onchange = e => { S.showTravel = e.target.checked; saveS(); render(); };
$('#sim').oninput = e => { simFrac = e.target.value / 1000; getJob(); render(); };
new ResizeObserver(resize).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

