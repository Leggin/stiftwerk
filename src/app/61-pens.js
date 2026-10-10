/* pens panel (interim – replaced by the Stifte step later) */
function renderPens() {
  const box = $('#penList'), used = job ? job.usedKeys : [], single = doc.penMode === SWPens.SINGLE;
  const lens = job ? job.colorLengths : new Map();
  const pens = single ? [] : SWPens.visiblePens(doc, layerMeta, used);
  $('#penCount').textContent = single ? '' : pens.length ? tn('pens.count', pens.length) : '';
  const mode = `<div class="seg" id="penMode"><button data-v="single" aria-pressed="${single}">${tHtml('pens.mode.single')}</button><button data-v="multi" aria-pressed="${!single}">${tHtml('pens.mode.multi')}</button></div>`;
  if (!used.length) { box.innerHTML = mode + `<div class="empty">${tHtml('pens.empty')}</div>`; return; }
  const keys = used.slice().sort((a, b) => (layerMeta[a].order || 0) - (layerMeta[b].order || 0));
  const colorRow = k => `<label class="check" data-k="${esc(k)}"><input type="checkbox" class="en" ${layerOn(k) ? 'checked' : ''}><span class="swatch" style="width:14px;height:14px;border-width:1px;background:${esc(layerMeta[k].color)}"></span><span class="fill">${esc(colorLabel(k))}</span><span class="meta">${fmt((lens.get(k) || 0) / 1000, 2)} m</span></label>`;
  const penRow = (p, i, n) => `<div class="pen" data-p="${esc(p.id)}">
    <span class="num">${single ? '' : i + 1}</span>
    <input type="color" class="col" value="${esc(p.color)}" aria-label="${tHtml('pens.color')}">
    <input type="text" class="nm" value="${esc(penLabel(p))}" aria-label="${tHtml('pens.name')}">
    <div class="ord">${single ? '' : `<button class="up" aria-label="${tHtml('pens.earlier')}" ${i ? '' : 'disabled'}>▲</button><button class="dn" aria-label="${tHtml('pens.later')}" ${i < n - 1 ? '' : 'disabled'}>▼</button>`}</div></div>`;
  box.innerHTML = mode + (single
    ? penRow(Object.assign({ id: SWPens.SINGLE }, doc.single), 0, 1) + `<div class="hint">${tHtml('pens.single.hint')}</div>` + keys.map(colorRow).join('')
    : pens.map((p, i) => penRow(p, i, pens.length) + keys.filter(k => layerMeta[k].pen === p.id).map(colorRow).join('')).join(''));
}
const penOf = row => { const id = row.dataset.p; return id === SWPens.SINGLE ? doc.single : SWPens.penById(doc, id); };
$('#penList').addEventListener('click', e => {
  const m = e.target.closest('#penMode button'); if (m) { SWPens.setMode(doc, m.dataset.v); invalidate(true); return; }
  const b = e.target.closest('.up,.dn'); if (!b) return;
  if (SWPens.movePen(doc, b.closest('.pen').dataset.p, b.classList.contains('up') ? -1 : 1)) invalidate(true);
});
$('#penList').addEventListener('change', e => {
  const c = e.target.closest('[data-k]'); if (c && e.target.classList.contains('en')) { layerMeta[c.dataset.k].enabled = e.target.checked; invalidate(true); return; }
  const row = e.target.closest('.pen'); if (!row) return; const p = penOf(row); if (!p) return;
  if (e.target.classList.contains('col')) p.color = e.target.value;
  if (e.target.classList.contains('nm')) p.name = e.target.value.trim() || null;
  invalidate(true);
});
$('#penList').addEventListener('input', e => { if (!e.target.classList.contains('col')) return; const p = penOf(e.target.closest('.pen')); if (p) { p.color = e.target.value; jobDirty = true; rebuild(); } });
SWUI.on('job', renderPens);
