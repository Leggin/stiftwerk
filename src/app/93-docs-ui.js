/* ---------------- document menu (header), "Meine Dokumente" (shelf dialog) and renaming ----------------
 * The header button shows the open document's name and opens a menu. The shelf lists every saved document (thumbnail,
 * name, date, objects) and acts on them through the API of 92-docs.js. Everything is disabled while plotting.
 * Dialog state: dcShelfOpen (the shelf is the open dialog), dcRenId (row being renamed), dcDel (delete armed for 3 s),
 * dcBusy (an open / duplicate / delete is running), dcFocus (where the keyboard focus goes after a re-draw). */
let dcShelfOpen = false, dcRenId = null, dcBusy = false, dcDel = null, dcFocus = null;

/* the header button: the open document's name, or "Unsaved document" */
function dcLabel() {
  const el = $('#docName'); if (!el) return;
  const name = docName();
  el.textContent = name || t('docs.menu.unsaved');
  $('#btnDoc').classList.toggle('is-unsaved', !name);
}
/* plotting disables the header button and its menu (the shelf refuses actions, see dcShelfAct) */
function dcSync() {
  $('#btnDoc').disabled = plotting;
  for (const b of $$('#docMenu button')) b.disabled = plotting;
}

/* header menu */
$('#btnDoc').addEventListener('click', () => {
  if (plotting) return;
  const m = $('#docMenu');
  if (menuOpen && menuOpen.menu === m) closeMenu(true); else openMenuFor(m, $('#btnDoc'), true);
});
$('#docMenu').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b || b.disabled || plotting) return;
  closeMenu(true);   // focus goes back to the button first, so a dialog returns focus there
  const a = b.dataset.m;
  if (a === 'new') docNew();
  else if (a === 'shelf') dcShelf();
  else if (a === 'open') $('#projIn').click();
  else if (a === 'save') projectSave();
  else if (a === 'rename') dcRename();
});
$('#docMenu').addEventListener('keydown', e => {
  const m = $('#docMenu'), bs = [...m.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
  if (!bs.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); bs[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); bs[bs.length - 1].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu();
});
/* project file picked (also from the shelf): the file input is reset so the same file can be picked again */
$('#projIn').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f || plotting) return;
  try { await projectOpen(await f.text(), f.name); } catch (err) { toast(t('docs.err.title')); }
});

/* rename the open document (it gets its slot first when it has none yet) */
async function dcRename() {
  if (plotting) return;
  if (!curDocId) {
    if (!docHasContent()) { toast(t('docs.rename.nothing')); return; }
    await docSaveNow();
  }
  const id = curDocId, m = docMeta(id); if (!m) return;
  const name = await dcAskName(t('docs.rename.title'), m.name, t('docs.rename.ok'));
  if (name) docRename(id, name);
}
/* a dialog with one text field → the trimmed text, or false (cancelled or left empty) */
function dcAskName(title, value, okLabel) {
  return new Promise(resolve => {
    showDialog(`<h3>${esc(title)}</h3>
      <label class="dc-stack"><span class="cap">${tHtml('docs.rename.label')}</span><span class="inp"><input type="text" maxlength="80" autocomplete="off" value="${esc(value)}" autofocus data-f="name"></span></label>
      <div class="row"><button class="btn" data-close>${tHtml('common.cancel')}</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`, resolve);
    const root = $('#dialog'), inp = root.querySelector('[data-f="name"]');
    const ok = () => closeDialog(inp.value.trim() || false);
    root.querySelector('[data-ok]').addEventListener('click', ok);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    inp.select();
  });
}

/* ---- "Meine Dokumente" ---- */
function dcShelf() {
  if (plotting) return;
  const dlg = $('#dialog');
  dcShelfOpen = true; dcRenId = null; dcFocus = null;
  dlg.classList.add('dc-wide');
  showDialog(dcShelfHtml(), () => {
    dcShelfOpen = false; dcRenId = null; dlg.classList.remove('dc-wide');
    if (dcDel) { clearTimeout(dcDel.timer); dcDel = null; }
  });
}
function dcShelfHtml() {
  const off = plotting ? ' disabled' : '';
  return `<h3>${esc(t('docs.shelf.title'))}</h3>
    <p class="hint">${tHtml('docs.shelf.hint')}</p>
    <div class="dc-shelf-top">
      <button class="btn sm" data-dc-act="new"${off}>${swIcon('plus', 'sm')}<span>${tHtml('docs.shelf.new')}</span></button>
      <button class="btn sm" data-dc-act="file"${off}>${swIcon('upload', 'sm')}<span>${tHtml('docs.shelf.openFile')}</span></button>
    </div>
    <div data-dc-list>${dcRowsHtml()}</div>
    <div class="row"><button class="btn" data-close>${tHtml('common.close')}</button></div>`;
}
function dcRowsHtml() {
  if (!docIndex.length) return `<p class="empty">${tHtml('docs.shelf.empty')}</p>`;
  const list = [...docIndex].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return `<ul class="dc-shelf-list">${list.map(dcRowHtml).join('')}</ul>`;
}
function dcRowHtml(m) {
  const id = esc(m.id), open = m.id === curDocId, ren = dcRenId === m.id, armed = !!dcDel && dcDel.id === m.id;
  const off = plotting ? ' disabled' : '';
  const name = ren
    ? `<span class="inp"><input type="text" maxlength="80" value="${esc(m.name)}" data-dc-ren="${id}" aria-label="${tHtml('docs.shelf.renameLabel')}"${off}></span>`
    : `<div class="dc-doc-name" title="${esc(m.name)}">${esc(m.name)}</div>`;
  const del = armed
    ? `<button class="btn sm danger sure" data-dc-act="del"${off}>${tHtml('docs.shelf.sure')}</button>`
    : `<button class="ibtn sm" data-dc-act="del" aria-label="${tHtml('docs.shelf.delete')}" title="${tHtml('docs.shelf.delete')}"${off}>${swIcon('trash', 'sm')}</button>`;
  return `<li class="dc-doc${open ? ' is-open' : ''}" data-id="${id}">
    <div class="dc-thumb">${dcThumbSvg(m.thumb)}</div>
    <div class="dc-doc-main">${name}
      <div class="dc-doc-meta"><span>${esc(dcWhen(m.savedAt))}</span><span>${esc(tn('docs.objects', m.n || 0))}</span>${open ? `<span class="dc-badge">${tHtml('docs.shelf.now')}</span>` : ''}</div>
    </div>
    <div class="dc-doc-acts">
      <button class="btn sm" data-dc-act="open"${open || plotting ? ' disabled' : ''}>${tHtml('docs.shelf.open')}</button>
      <button class="ibtn sm" data-dc-act="rename" aria-label="${tHtml('docs.shelf.rename')}" title="${tHtml('docs.shelf.rename')}"${off}>${swIcon('pen', 'sm')}</button>
      <button class="ibtn sm" data-dc-act="dup" aria-label="${tHtml('docs.shelf.dup')}" title="${tHtml('docs.shelf.dup')}"${off}>${swIcon('copy', 'sm')}</button>
      ${del}
    </div>
  </li>`;
}
/* the preview: every pen's lines (92-docs.js). Without one, a plain sheet. Colours and numbers are escaped. */
function dcThumbSvg(th) {
  if (!th || !(th.w > 0) || !(th.h > 0)) return '<svg viewBox="0 0 100 70" aria-hidden="true" focusable="false"><rect class="dc-paper" x="1" y="1" width="98" height="68"/></svg>';
  const w = Number(th.w), h = Number(th.h), sw = (Math.max(w, h) / 150).toFixed(3);
  const paths = (th.p || []).map(p => `<path d="${esc(p.d)}" stroke="${esc(p.c)}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><rect class="dc-paper" x="0" y="0" width="${w}" height="${h}"/>${paths}</svg>`;
}
/* date and time in the interface language */
function dcWhen(ms) {
  if (!ms) return t('docs.shelf.noDate');
  const lang = (I18N.lang || document.documentElement.lang || 'de');
  return new Date(ms).toLocaleString(lang.startsWith('en') ? 'en-US' : 'de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
/* re-draw the list and keep the keyboard focus on the same row action */
function dcShelfRender() {
  const list = $('#dialog [data-dc-list]'); if (!dcShelfOpen || !list) return;
  const fa = document.activeElement;
  let keep = dcFocus;
  if (!keep && fa && list.contains(fa) && fa.dataset.dcAct) { const li = fa.closest('li[data-id]'); if (li) keep = { id: li.dataset.id, act: fa.dataset.dcAct }; }
  dcFocus = null;
  list.innerHTML = dcRowsHtml();
  if (keep) {
    const li = [...list.querySelectorAll('li[data-id]')].find(x => x.dataset.id === keep.id);
    const el = li && li.querySelector(`[data-dc-act="${keep.act}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  const inp = list.querySelector('[data-dc-ren]');
  if (inp) {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dcEndRename(inp.dataset.dcRen, inp.value, true); } });
    inp.addEventListener('blur', () => dcEndRename(inp.dataset.dcRen, inp.value, false));
    inp.focus(); inp.select();
  }
}
/* leaving the rename field: a changed name is saved (Enter or leaving the field); an empty one changes nothing */
function dcEndRename(id, value, refocus) {
  if (dcRenId !== id) return;
  dcRenId = null; dcFocus = refocus ? { id, act: 'rename' } : null;
  const m = docMeta(id), v = String(value || '').trim();
  if (m && v && v !== m.name) docRename(id, v); else dcShelfRender();
}
/* Esc in the rename field cancels the rename only. This capture listener on window runs before the dialog's own
 * Esc handler (85-dialog.js), which would otherwise close the whole shelf. */
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !dcRenId || !dcShelfOpen) return;
  if (!(e.target && e.target.matches && e.target.matches('[data-dc-ren]'))) return;
  e.preventDefault(); e.stopPropagation();
  const id = dcRenId; dcRenId = null; dcFocus = { id, act: 'rename' };
  dcShelfRender();
}, true);
/* row actions and the two header buttons of the shelf (delegated: the dialog's content is replaced on every open) */
$('#dialog').addEventListener('click', e => {
  if (!dcShelfOpen) return;
  const b = e.target.closest('[data-dc-act]'); if (!b || b.disabled) return;
  const li = b.closest('li[data-id]');
  dcShelfAct(b.dataset.dcAct, li ? li.dataset.id : null);
});
async function dcShelfAct(act, id) {
  if (plotting || dcBusy) return;
  if (act === 'new') { closeDialog(); docNew(); return; }
  if (act === 'file') { closeDialog(); $('#projIn').click(); return; }
  const m = docMeta(id); if (!m) return;
  if (act === 'rename') { if (dcDel) { clearTimeout(dcDel.timer); dcDel = null; } dcRenId = id; dcShelfRender(); return; }
  if (act === 'dup') { dcBusy = true; try { await docDuplicate(id); } finally { dcBusy = false; } return; }
  if (act === 'open') {
    dcBusy = true; try { await docOpen(id); } finally { dcBusy = false; }
    if (!dcShelfOpen) return;
    if (curDocId === id) closeDialog(); else dcShelfRender();   // a failed open (toast) keeps the shelf open
    return;
  }
  if (act === 'del') {
    if (dcDel && dcDel.id === id) {   // second click within 3 s: really delete
      clearTimeout(dcDel.timer); dcDel = null;
      const name = m.name; dcBusy = true;
      try { await docDelete(id); } finally { dcBusy = false; }
      toast(t('docs.shelf.deleted', { name }));
      return;
    }
    if (dcDel) clearTimeout(dcDel.timer);
    dcDel = { id, timer: setTimeout(() => { dcDel = null; if (!dcRenId) dcShelfRender(); }, 3000) };
    dcShelfRender();
  }
}

/* the shelf follows every change of the document list (saves, duplicates, renames, deletes) */
SWUI.on('docs', () => { dcLabel(); if (dcShelfOpen && !dcRenId) dcShelfRender(); });
SWUI.on('plot', ph => { if (ph === 'start') closeMenu(); if (ph !== 'tick') dcSync(); });
SWUI.onRender(() => { dcLabel(); dcSync(); });
dcLabel(); dcSync();
