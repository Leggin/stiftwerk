/* ---------------- objects (left column) ---------------- */
function select(id) {
  selId = id; document.body.classList.toggle('has-sel', !!id);
  renderObjects(); SWUI.emit('select', id); render();
}

/* popover menus: "+ Hinzufügen" and the ⋯ of an object row */
let menuOpen = null; // { menu, btn }
function closeMenu(focusBack) {
  if (!menuOpen) return; const { menu, btn } = menuOpen; menuOpen = null;
  menu.hidden = true; if (btn) { btn.setAttribute('aria-expanded', 'false'); if (focusBack && document.contains(btn)) btn.focus(); }
}
function openMenuFor(menu, btn, fixed) {
  closeMenu(); menu.hidden = false; menuOpen = { menu, btn }; btn.setAttribute('aria-expanded', 'true');
  if (fixed) {
    const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    menu.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  }
  const first = menu.querySelector('button'); if (first) first.focus();
}
document.addEventListener('pointerdown', e => { if (menuOpen && !menuOpen.menu.contains(e.target) && !(menuOpen.btn && menuOpen.btn.contains(e.target))) closeMenu(); }, true);
for (const m of [$('#addMenu'), $('#rowMenu')]) m.addEventListener('keydown', e => {
  const bs = [...m.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); bs[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); bs[bs.length - 1].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu();
});
$('#btnAdd').addEventListener('click', () => { if (menuOpen && menuOpen.menu === $('#addMenu')) closeMenu(); else openMenuFor($('#addMenu'), $('#btnAdd')); });
$('#addMenu').addEventListener('click', e => { if (e.target.closest('button')) closeMenu(); });

/* rows */
let objRenaming = null; // id of the row whose name is being edited
const objTypeIcon = it => it.type === 'text' ? 'type' : it.type === 'test' ? 'ruler' : 'shapes';
function renderObjects() {
  const ul = $('#objList'), none = !items.length;
  $('#objEmpty').hidden = !none; ul.hidden = none; $('#objHint').hidden = none;
  if (none) { ul.innerHTML = ''; renderStageHint(); return; }
  ul.innerHTML = items.map(it => {
    const [w, h] = itemSize(it), sel = it.id === selId, name = itemName(it);
    const head = objRenaming === it.id
      ? `<div class="main">${swIcon(objTypeIcon(it))}<input class="rename" value="${esc(name)}" maxlength="60" aria-label="${tHtml('objects.rename')}"></div>`
      : `<button class="main" data-act="select" aria-current="${sel}" title="${esc(name)}">${swIcon(objTypeIcon(it))}<span class="txt"><span class="nm">${esc(name)}</span><span class="meta">${fmt(w, 0)} × ${fmt(h, 0)}</span></span></button>`;
    return `<li class="obj${sel ? ' sel' : ''}${it.visible ? '' : ' off'}" data-id="${it.id}">
      <button class="ibtn" data-act="vis" aria-pressed="${it.visible}" aria-label="${tHtml('objects.visible')}" title="${tHtml('objects.visible')}">${swIcon(it.visible ? 'eye' : 'eyeOff')}</button>
      ${head}
      <button class="ibtn more" data-act="more" aria-haspopup="menu" aria-expanded="false" aria-label="${tHtml('objects.more')}" title="${tHtml('objects.more')}">${swIcon('more')}</button></li>`;
  }).join('');
  renderStageHint();
}
function startRename(id) {
  if (plotting) return;
  objRenaming = id; renderObjects();
  const inp = $('#objList .rename'); if (inp) { inp.focus(); inp.select(); }
}
function endRename(commit) {
  if (!objRenaming) return;
  const it = items.find(i => i.id === objRenaming), inp = $('#objList .rename'); objRenaming = null;
  if (commit && it && inp) {
    const v = inp.value.trim();
    if (v && v !== itemName(it)) { it.name = v; delete it.nameKey; persist(); const el = $('#pName'); if (el) el.value = v; }
  }
  renderObjects();
}
$('#objList').addEventListener('keydown', e => {
  if (!e.target.classList.contains('rename')) return;
  if (e.key === 'Enter') { e.preventDefault(); endRename(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endRename(false); }
});
$('#objList').addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('rename')) endRename(true); });
$('#objList').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return; const it = items.find(i => i.id === li.dataset.id); if (!it) return;
  const act = e.target.closest('[data-act]'), a = act && act.dataset.act;
  if (a === 'vis') { it.visible = !it.visible; invalidate(); renderObjects(); return; }
  if (a === 'more') { openRowMenu(it, act); return; }
  if (a === 'select' && selId !== it.id) select(it.id);
});
$('#objList').addEventListener('dblclick', e => {
  const li = e.target.closest('li[data-id]'); if (li && e.target.closest('.main')) startRename(li.dataset.id);
});
function openRowMenu(it, btn) {
  const m = $('#rowMenu');
  m.dataset.id = it.id;
  m.innerHTML = `<button role="menuitem" data-m="rename">${swIcon('pen')}<span>${tHtml('objects.rename')}</span></button>
    <button role="menuitem" data-m="dup">${swIcon('copy')}<span>${tHtml('inspector.duplicate')}</span></button>
    <hr><button role="menuitem" data-m="del" class="danger">${swIcon('trash')}<span>${tHtml('inspector.remove')}</span></button>`;
  openMenuFor(m, btn, true);
}
$('#rowMenu').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  const id = $('#rowMenu').dataset.id; closeMenu();
  if (b.dataset.m === 'rename') startRename(id); else if (b.dataset.m === 'dup') duplicateItem(id); else if (b.dataset.m === 'del') removeItem(id);
});

/* empty state */
function loadSamples() {
  const list = makeSamples(); if (!list.length) return;
  for (const it of list) items.push(it);
  invalidate(true); select(list[0].id); renderObjects();
}
$('#btnEmptyOpen').onclick = () => $('#fileIn').click();
$('#btnEmptySamples').onclick = loadSamples;
function renderStageHint() { const h = $('#stageHint'); if (h) h.hidden = items.length > 0 || step !== 'motiv'; }
SWUI.on('step', renderStageHint);
