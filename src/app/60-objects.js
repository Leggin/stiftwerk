/* ---------------- side panels ---------------- */
function select(id) { selId = id; renderObjects(); SWUI.emit('select', id); render(); }
function renderObjects() {
  const ul = $('#objList');
  if (!items.length) { ul.innerHTML = `<li class="empty">${tHtml('objects.empty')}</li>`; return; }
  ul.innerHTML = items.map(it => {
    const [w, h] = itemSize(it);
    return `<li data-id="${it.id}" class="${it.id === selId ? 'sel' : ''}"><input type="checkbox" class="vis" aria-label="${tHtml('objects.visible')}" ${it.visible ? 'checked' : ''}><span class="nm">${esc(itemName(it))}</span><span class="meta">${fmt(w, 0)}×${fmt(h, 0)}</span></li>`;
  }).join('');
}
$('#objList').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return; const it = items.find(i => i.id === li.dataset.id);
  if (e.target.classList.contains('vis')) { it.visible = e.target.checked; invalidate(); renderObjects(); return; }
  select(it.id);
});
