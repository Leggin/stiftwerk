function renderPens() {
  const L = usedLayers(); const box = $('#penList');
  $('#penCount').textContent = L.length ? `${L.length} ${L.length === 1 ? 'Stift' : 'Stifte'}` : '';
  if (!L.length) { box.innerHTML = '<div class="empty">Sobald etwas auf dem Blatt ist, erscheinen hier die Stifte.</div>'; return; }
  const lens = new Map(); if (job) for (const l of job.layers) lens.set(l.key, l.paths.reduce((s, p) => s + SW.polyLen(p.pts), 0));
  let n = 0;
  box.innerHTML = L.map((l, i) => `<div class="pen" data-k="${esc(l.key)}">
    <input type="checkbox" class="en" aria-label="Plotten" ${l.enabled ? 'checked' : ''}>
    <input type="color" class="col" value="${esc(l.color)}" aria-label="Farbe">
    <div style="min-width:0"><input type="text" class="nm" value="${esc(l.name)}" aria-label="Name"><div class="meta" style="padding-left:6px">${l.enabled ? `Stift ${++n}` : 'übersprungen'}${lens.has(l.key) ? ' · ' + fmt(lens.get(l.key) / 1000, 2) + ' m' : ''}</div></div>
    <div class="ord"><button class="up" aria-label="Früher" ${i ? '' : 'disabled'}>▲</button><button class="dn" aria-label="Später" ${i < L.length - 1 ? '' : 'disabled'}>▼</button></div></div>`).join('');
}
$('#penList').addEventListener('change', e => {
  const row = e.target.closest('.pen'); if (!row) return; const m = layerMeta[row.dataset.k];
  if (e.target.classList.contains('en')) m.enabled = e.target.checked;
  if (e.target.classList.contains('col')) m.color = e.target.value;
  if (e.target.classList.contains('nm')) m.name = e.target.value || m.name;
  invalidate(true);
});
$('#penList').addEventListener('input', e => { if (e.target.classList.contains('col')) { const row = e.target.closest('.pen'); layerMeta[row.dataset.k].color = e.target.value; if (job) for (const l of job.layers) if (l.key === row.dataset.k) l.color = e.target.value; render(); } });
$('#penList').addEventListener('click', e => {
  const b = e.target.closest('.up,.dn'); if (!b) return;
  const L = usedLayers(), i = L.findIndex(l => l.key === b.closest('.pen').dataset.k), j = b.classList.contains('up') ? i - 1 : i + 1;
  if (j < 0 || j >= L.length) return;
  const a = layerMeta[L[i].key], c = layerMeta[L[j].key]; [a.order, c.order] = [c.order, a.order];
  invalidate(true);
});
