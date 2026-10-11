/* ---------------- pen library UI (the data lives in 58-penlib.js) ----------------
 * Step ②: the button "Meine Stifte" (#plOpen) with the count, a library chip on every pen (or "Aus Bibliothek"),
 * the picker for one pen, and the manager dialog "Meine Stifte": list, inline edit form, new, delete (second click),
 * export and import. Top-level names are prefixed pl. No serial or plot code here; while plotting every action does nothing.
 * Dialog state: plUi.view = 'picker' | 'manager' | null (the dialog on screen). The manager is repainted in place. */

const plUi = { view: null, pen: null, edit: null, timer: 0 };   // pen = pen id the picker is for, edit = entry id with an open form
let plFile = null;                                              // hidden file input of "Importieren" (made on first use)

const plName = e => e.name || colorWord(e.color);
const plEditSel = id => `[data-pl="edit"][data-id="${CSS.escape(id)}"]`;
/* "0,30 mm · 1.500 mm/min · …": the line width and the values the entry sets (short = picker: width and speed only) */
function plSpecs(e, short) {
  const parts = [t('penlib.spec.width', { v: fmt(e.width, 2) })];
  if (e.drawF != null) parts.push(t('penlib.spec.speed', { v: fmtInt(e.drawF) }));
  if (!short) {
    if (e.penDown != null) parts.push(t('penlib.spec.depth', { v: fmt(e.penDown, 1) }));
    if (e.servoDown != null) parts.push(t('penlib.spec.servo', { v: fmtInt(e.servoDown) }));
    if (e.penDelay != null) parts.push(t('penlib.spec.delay', { v: fmtInt(e.penDelay) }));
  }
  return parts.join(' · ');
}
/* a preset colour that no library pen uses yet */
function plNextColor() {
  const taken = penLib.map(e => e.color);
  return PN_PRESETS.find(h => !taken.some(c => SWColor.similar(c, h))) || PN_PRESETS[0];
}

/* the library control of a pen in step ② (called by 61-pens.js): the chip of the linked library pen, or "Aus Bibliothek" */
function plLibControl(penId) {
  const p = docPen(penId); if (!p) return '';
  const e = p.lib ? libEntry(p.lib) : null, dis = plotting ? ' disabled' : '';
  if (e) {
    const name = plName(e), width = t('penlib.spec.width', { v: fmt(e.width, 2) });
    return `<button type="button" class="pl-chip" data-pl="pick" data-pen="${esc(penId)}" aria-label="${esc(t('penlib.chip.aria', { name, width }))}"${dis}>${swIcon('clip', 'sm')}<span class="pl-chip-name">${esc(name)}</span><span class="pl-chip-w">${esc(width)}</span></button>`;
  }
  return `<button type="button" class="btn sm ghost pl-from" data-pl="pick" data-pen="${esc(penId)}"${dis}>${swIcon('book', 'sm')}<span>${tHtml('penlib.fromLib')}</span></button>`;
}

/* one of our dialogs on the shell's dialog; the class widens it. Repeated calls replace the open dialog. */
function plShow(view, html) {
  const dlg = $('#dialog');
  plUi.view = view;
  showDialog(html, () => { if (plUi.view === view) plUi.view = null; dlg.classList.remove('pl-dlg'); });
  dlg.classList.add('pl-dlg');
}

/* ---- picker: which library pen this pen is ---- */
function plOpenPicker(penId) {
  const p = docPen(penId); if (plotting || !p) return;
  plUi.pen = penId;
  const cur = p.lib && libEntry(p.lib) ? p.lib : '';
  const row = (id, sel, inner) => `<li><button type="button" class="pl-pick${id ? '' : ' none'}" data-pl="link" data-id="${esc(id)}" aria-pressed="${sel}"${sel ? ' autofocus' : ''}>${inner}${sel ? swIcon('check', 'sm') : ''}</button></li>`;
  const none = row('', !cur, `<span class="pl-pick-dot none" aria-hidden="true"></span><span class="pl-pick-main"><span class="pl-pick-name">${tHtml('penlib.pick.none')}</span><span class="meta">${tHtml('penlib.pick.noneHint')}</span></span>`);
  const items = penLib.map(e => row(e.id, e.id === cur, `<span class="pn-dot sm" style="--c:${pnHex(e.color)}" aria-hidden="true"></span><span class="pl-pick-main"><span class="pl-pick-name">${esc(plName(e))}</span><span class="meta">${esc(plSpecs(e, true))}</span></span>`)).join('');
  plShow('picker', `<h3>${tHtml('penlib.pick.title')}</h3>
    <p class="hint">${tHtml('penlib.pick.for', { name: penLabel(p) })}</p>
    <ul class="pl-pick-list" role="group" aria-label="${tHtml('penlib.pick.title')}">${none}${items}</ul>
    ${penLib.length ? '' : `<p class="pl-empty">${tHtml('penlib.pick.empty')}</p>`}
    <div class="pl-actions"><button type="button" class="btn sm" data-pl="save">${tHtml('penlib.pick.save')}</button>
      <button type="button" class="pl-link" data-pl="manage">${tHtml('penlib.pick.manage')}</button></div>
    <div class="row"><span class="fill"></span><button type="button" class="btn ghost sm" data-close>${tHtml('common.cancel')}</button></div>`);
}
function plLink(libId) { if (plotting || !plUi.pen) return; libLink(plUi.pen, libId || null); closeDialog(true); }
function plSaveToLib() {
  if (plotting || !plUi.pen) return;
  const e = libFromPen(plUi.pen); if (!e) return;
  closeDialog(true); toast(t('penlib.toast.saved'));
}

/* ---- manager "Meine Stifte" ---- */
function plOpenManager() {
  if (plotting) return;
  plUi.edit = null;
  plShow('manager', plManagerHtml());
}
function plManagerHtml() {
  const dis = plotting ? ' disabled' : '', list = penLib;
  return `<h3>${tHtml('penlib.title')}</h3>
    <p class="hint">${tHtml('penlib.hint')}</p>
    ${list.length ? `<ul class="pl-list">${list.map(e => plItemHtml(e)).join('')}</ul>` : `<p class="pl-empty">${tHtml('penlib.empty')}</p>`}
    <div class="pl-actions">
      <button type="button" class="btn sm primary" data-pl="new"${dis}>${swIcon('plus', 'sm')}<span>${tHtml('penlib.new')}</span></button>
      <button type="button" class="btn sm" data-pl="import"${dis}>${tHtml('penlib.import')}</button>
      <button type="button" class="btn sm" data-pl="export"${list.length && !plotting ? '' : ' disabled'}>${tHtml('penlib.export')}</button>
    </div>
    <div class="row"><span class="fill"></span><button type="button" class="btn ghost sm" data-close>${tHtml('common.close')}</button></div>`;
}
function plItemHtml(e) {
  const open = plUi.edit === e.id, dis = plotting ? ' disabled' : '';
  return `<li class="pl-item${open ? ' editing' : ''}">
    <div class="pl-item-head">
      <span class="pn-dot" style="--c:${pnHex(e.color)}" aria-hidden="true"></span>
      <div class="pl-item-txt"><span class="pl-item-name">${esc(plName(e))}</span><span class="meta">${esc(plSpecs(e))}</span></div>
      <button type="button" class="btn sm ghost" data-pl="edit" data-id="${esc(e.id)}" aria-expanded="${open}"${dis}>${tHtml('penlib.edit')}</button>
    </div>
    ${open ? plFormHtml(e) : ''}
  </li>`;
}
/* the edit form: Z depth only for Z pens, servo value only for servo pens (the others keep their stored value) */
function plFormHtml(e) {
  const dis = plotting ? ' disabled' : '';
  const f = (cap, inner, wide) => `<label class="pl-f${wide ? ' pl-f-wide' : ''}"><span class="pl-f-cap">${cap}</span>${inner}</label>`;
  const num = (name, v, ph, step, min, max) => `<span class="inp"><input type="number" name="${name}" value="${v == null ? '' : esc(v)}" placeholder="${esc(ph)}" step="${step}" min="${min}" max="${max}"${dis}></span>`;
  return `<form class="pl-form" data-id="${esc(e.id)}" novalidate>
    <p class="hint pl-form-hint">${tHtml('penlib.form.hint')}</p>
    ${f(tHtml('penlib.f.name'), `<span class="inp"><input type="text" name="name" maxlength="60" value="${esc(e.name)}" autocomplete="off"${dis}></span>`, true)}
    ${f(tHtml('penlib.f.color'), `<span class="inp"><input type="color" name="color" value="${pnHex(e.color)}"${dis}></span>`)}
    ${f(tHtml('penlib.f.width'), num('width', e.width, '', '0.05', '0.05', '5'))}
    ${f(tHtml('penlib.f.speed'), num('drawF', e.drawF, t('penlib.ph.plotter', { v: fmtInt(S.drawF) }), '50', '50', '30000'))}
    ${isZPen() ? f(tHtml('penlib.f.depth'), num('penDown', e.penDown, t('penlib.ph.plotter', { v: fmt(S.penDown, 1) }), '0.1', '-100', '100')) : ''}
    ${S.penType === 'servo' ? f(tHtml('penlib.f.servo'), num('servoDown', e.servoDown, t('penlib.ph.plotter', { v: fmtInt(S.servoDown) }), '1', '0', '100000')) : ''}
    ${f(tHtml('penlib.f.delay'), num('penDelay', e.penDelay, t('penlib.ph.plotter', { v: fmtInt(S.penDelay || 0) }), '50', '0', '10000'))}
    ${f(tHtml('penlib.f.note'), `<span class="inp"><input type="text" name="note" maxlength="200" value="${esc(e.note)}" autocomplete="off"${dis}></span>`, true)}
    <div class="pl-form-actions">
      <button type="submit" class="btn sm primary"${dis}>${tHtml('penlib.save')}</button>
      <button type="button" class="btn sm ghost" data-pl="cancel" data-id="${esc(e.id)}">${tHtml('common.cancel')}</button>
      <span class="fill"></span>
      <button type="button" class="btn sm danger" data-pl="delete" data-id="${esc(e.id)}"${dis}>${tHtml('penlib.delete')}</button>
    </div>
  </form>`;
}
/* repaint the open manager in place (the dialog, its title and focus trap stay); focus = selector inside it */
function plPaintManager(focus) {
  if (plUi.view !== 'manager') return;
  const dlg = $('#dialog');
  dlg.innerHTML = plManagerHtml();
  const h = dlg.querySelector('h3'); if (h) h.id = 'dlgTitle';
  const el = (focus && dlg.querySelector(focus)) || dlg.querySelector('.primary') || dlg;
  el.focus();
  if (el.tagName === 'INPUT' && el.type === 'text') el.select();
}
function plToggleEdit(id) {
  plUi.edit = plUi.edit === id ? null : id;
  plPaintManager(plUi.edit ? '.pl-form [name="name"]' : plEditSel(id));
}
/* save the form: empty fields become null (= as the plotter profile), a name falls back to the colour word */
function plSubmit(form) {
  const cur = libEntry(form.dataset.id); if (!cur) return;
  const val = n => { const el = form.elements.namedItem(n); return el ? String(el.value).trim() : ''; };
  const num = s => s === '' || !isFinite(+s) ? null : +s;
  const color = pnHex(val('color'));
  const patch = { name: val('name') || colorWord(color), color, width: num(val('width')) ?? cur.width, drawF: num(val('drawF')), penDelay: num(val('penDelay')), note: val('note') || null };
  if (isZPen()) patch.penDown = num(val('penDown'));
  if (S.penType === 'servo') patch.servoDown = num(val('servoDown'));
  libUpdate(cur.id, patch);
  plUi.edit = null;
  plPaintManager(plEditSel(cur.id));
}
function plNew() {
  const e = libAdd({ name: t('penlib.newName'), color: plNextColor(), width: 0.4 });
  plUi.edit = e.id;
  plPaintManager('.pl-form [name="name"]');
}
/* first click asks, a second click within 3 s deletes. Pens linked to it keep their colour and name. */
function plDelete(b) {
  if (!b.classList.contains('sure')) {
    b.classList.add('sure'); b.textContent = t('penlib.delete.sure');
    clearTimeout(plUi.timer); plUi.timer = setTimeout(plDisarm, 3000);
    return;
  }
  clearTimeout(plUi.timer);
  const e = libEntry(b.dataset.id); if (!e) return;
  const name = plName(e);
  libRemove(e.id); plUi.edit = null;
  toast(t('penlib.toast.deleted', { name }));
  plPaintManager('[data-pl="new"]');
}
function plDisarm() {
  const b = $('#dialog [data-pl="delete"].sure');
  if (b) { b.classList.remove('sure'); b.textContent = t('penlib.delete'); }
}
function plExport() { const x = libExport(); downloadText(x.filename, x.text); }
function plImportPick() {
  if (!plFile) {
    plFile = document.createElement('input');
    plFile.type = 'file'; plFile.accept = '.json,application/json'; plFile.hidden = true;
    plFile.addEventListener('change', plImportChosen);
    document.body.appendChild(plFile);
  }
  plFile.value = ''; plFile.click();
}
async function plImportChosen() {
  const f = plFile.files && plFile.files[0]; if (!f || plotting) return;
  let text;
  try { text = await f.text(); } catch (err) { toast(t('penlib.err.read')); return; }
  let n;
  try { n = libImport(text); } catch (err) { toast(err.message); return; }   // libImport throws a translated message
  toast(tn('penlib.toast.imported', n));
  if (plUi.view === 'manager') plPaintManager('[data-pl="import"]');
}

/* ---- the count on "Meine Stifte" ---- */
function plRenderShelf() {
  const n = penLib.length, c = $('#plCount'), b = $('#plOpen');
  if (c) c.textContent = fmtInt(n);
  if (b) b.setAttribute('title', tn('penlib.count', n));
}

/* ---- wiring ---- */
$('#plOpen').addEventListener('click', plOpenManager);
pnBox.addEventListener('click', e => {   // chip / "Aus Bibliothek" on a pen row (markup: plLibControl)
  const b = e.target.closest('[data-pl="pick"]'); if (!b || !pnBox.contains(b) || plotting) return;
  plOpenPicker(b.dataset.pen);
});
$('#dialog').addEventListener('click', e => {
  const b = e.target.closest('[data-pl]'); if (!b || plotting) return;
  switch (b.dataset.pl) {
    case 'link': return plLink(b.dataset.id);
    case 'save': return plSaveToLib();
    case 'manage': closeDialog(false); return plOpenManager();
    case 'edit': return plToggleEdit(b.dataset.id);
    case 'cancel': plUi.edit = null; return plPaintManager(plEditSel(b.dataset.id));
    case 'delete': return plDelete(b);
    case 'new': return plNew();
    case 'import': return plImportPick();
    case 'export': return plExport();
  }
});
$('#dialog').addEventListener('submit', e => {
  if (!e.target.classList.contains('pl-form')) return;
  e.preventDefault(); if (!plotting) plSubmit(e.target);
});
SWUI.on('penlib', plRenderShelf);
SWUI.onRender(plRenderShelf);
