/* ---------------- machine profiles UI: plotter picker, "Dein Plotter" card, header label ----------------
 * Built on the API of 06-machines.js. Top-level names are prefixed mp. Every string goes through t() / tHtml().
 * Load order: this file runs before 10-state, 60-objects, 64-page and 80-plot, so load-time code must not read
 * their bindings (plotting, menuOpen, page, FORMATS …). Plotting is read from body.plotting instead. */

const mpPlotting = () => document.body.classList.contains('plotting');
let mpUi = { mode: null, draft: '' };   // inline state of the card: null | 'rename' | 'del' | 'reset'

/* ---------------- plotter picker ----------------
 * first: fresh start (boot) → the picked model replaces the default profile and sets the sheet size; no "close" except the link.
 * otherwise ("Neu"): the picked model is added and becomes the active profile. */
function showMachinePicker({ first } = {}) {
  const cards = SWMachine.TEMPLATES.map(tp => {
    const [w, h] = SWMachine.workArea(tp);
    return `<button type="button" class="mc-pick-card" data-tpl="${esc(tp.template)}">
      <span class="mc-pick-name">${esc(tplName(tp.template))}</span>
      <span class="mc-pick-desc">${esc(t('machine.tpl.' + tp.template + '.desc'))}</span>
      <span class="mc-pick-meta"><span>${tHtml('machine.card.size', { w: fmtInt(w), h: fmtInt(h) })}</span><span>${tHtml('settings.penType.' + tp.penType)}</span></span>
      ${tp.experimental ? `<span class="mc-badge warn">${tHtml('machine.badge.experimental')}</span>` : ''}
    </button>`;
  }).join('');
  const foot = first
    ? `<div class="row mc-pick-later"><button type="button" class="mc-link" data-close>${tHtml('machine.pick.later')}</button></div>`
    : `<div class="row"><button type="button" class="btn ghost sm" data-close>${tHtml('common.cancel')}</button></div>`;
  const dlg = $('#dialog');
  showDialog(`<h3>${tHtml(first ? 'machine.pick.title' : 'machine.pick.add')}</h3>
    <p class="hint">${tHtml('machine.pick.sub')}</p>
    <div class="mc-pick-grid" role="group" aria-label="${tHtml('machine.pick.group')}">${cards}</div>${foot}`,
    () => dlg.classList.remove('mc-pick-dlg'), { dismissible: !first });
  dlg.classList.add('mc-pick-dlg');
  dlg.querySelectorAll('[data-tpl]').forEach(b => { b.onclick = () => mpPick(b.dataset.tpl, !!first); });
}
function mpPick(id, first) {
  if (first) {
    const old = activeMachine().id;
    addMachineFromTemplate(id);            // the new profile becomes active …
    removeMachine(old);                    // … and the default one goes
    const tp = SWMachine.template(id);
    if (tp && FORMATS[tp.page]) { page.fmt = tp.page; pageChanged(); }
  } else addMachineFromTemplate(id);
  closeDialog(true);
}

/* ---------------- "Dein Plotter" card (top of the Maschine drawer) ---------------- */
const mpSec = $('#mcProfile');
const mpMenu = document.createElement('div');   // body-level, so position:fixed is not captured by the drawer's containment
mpMenu.id = 'mpMenu'; mpMenu.className = 'menu fixed'; mpMenu.setAttribute('role', 'menu'); mpMenu.hidden = true;
document.body.appendChild(mpMenu);

function mpRender() {
  if (!mpSec) return;
  const key = mpSec.contains(document.activeElement) ? document.activeElement.dataset.pfFocus : '';
  const p = activeMachine(), many = machines.list.length > 1, locked = mpPlotting(), dis = locked ? ' disabled' : '';
  const [w, h] = SWMachine.workArea(p);
  const summary = t('machine.card.summary', { size: t('machine.card.size', { w: fmtInt(w), h: fmtInt(h) }), pen: t('settings.penType.' + p.penType) });
  const opts = machines.list.map(x => `<option value="${esc(x.id)}"${x.id === p.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const head = mpUi.mode === 'rename'
    ? `<div class="mc-pf-edit">
         <div class="inp"><input type="text" maxlength="80" value="${esc(mpUi.draft)}" aria-label="${tHtml('machine.card.nameLabel')}" data-pf-focus="name"></div>
         <button type="button" class="btn sm primary" data-pf="save" data-pf-focus="save">${tHtml('machine.act.save')}</button>
         <button type="button" class="btn sm ghost" data-pf="cancel" data-pf-focus="cancel">${tHtml('common.cancel')}</button>
       </div>`
    : `<p class="mc-pf-name"><span class="mc-pf-txt">${esc(p.name)}</span>${p.experimental ? `<span class="mc-badge warn">${tHtml('machine.badge.experimental')}</span>` : ''}</p>
       <p class="mc-pf-sum">${esc(summary)}</p>`;
  const row = `<div class="mc-pf-row">
       ${many ? `<div class="inp"><select aria-label="${tHtml('machine.act.select')}" data-pf-focus="sel"${dis}>${opts}</select></div>` : ''}
       <button type="button" class="btn sm primary" data-pf="new" data-pf-focus="new"${dis}>${swIcon('plus')}<span>${tHtml('machine.act.new')}</span></button>
       <button type="button" class="btn sm ghost icon" data-pf="more" data-pf-focus="more" aria-haspopup="menu" aria-expanded="${mpMenu.hidden ? 'false' : 'true'}" aria-label="${tHtml('machine.act.more')}" title="${tHtml('machine.act.more')}">${swIcon('more')}</button>
     </div>`;
  const confirm = mpUi.mode === 'del' || mpUi.mode === 'reset'
    ? `<div class="mc-pf-confirm">
         <span>${tHtml(mpUi.mode === 'del' ? 'machine.act.deleteSure' : 'machine.act.resetSure', { name: p.name })}</span>
         <button type="button" class="btn sm ${mpUi.mode === 'del' ? 'danger sure' : 'primary'}" data-pf="${mpUi.mode}Ok"${dis}>${tHtml(mpUi.mode === 'del' ? 'machine.act.delete' : 'machine.act.resetOk')}</button>
         <button type="button" class="btn sm ghost" data-pf="cancel" data-pf-focus="cancel">${tHtml('common.cancel')}</button>
       </div>`
    : '';
  const lockHint = locked ? `<p class="hint">${tHtml('machine.card.locked')}</p>` : '';
  mpSec.setAttribute('aria-label', t('machine.card.title'));
  mpSec.innerHTML = `<h3>${tHtml('machine.card.title')}</h3>${head}${row}${confirm}${lockHint}`;
  if (key) { const el = mpSec.querySelector(`[data-pf-focus="${key}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); }
}
const mpFocus = key => { const el = mpSec && mpSec.querySelector(`[data-pf-focus="${key}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); };
function mpSave() {
  const inp = mpSec.querySelector('[data-pf-focus="name"]'), p = activeMachine();
  mpUi = { mode: null, draft: '' };
  renameMachine(p.id, inp ? inp.value : p.name);
  mpRender(); mpFocus('more');
}
function mpCancel() { mpUi = { mode: null, draft: '' }; mpRender(); mpFocus('more'); }

/* the ⋯ menu: actions on the active profile */
function mpMenuBuild() {
  const many = machines.list.length > 1, locked = mpPlotting(), embedded = window.self !== window.top;
  const item = (m, label, icon, dangerous) => {
    const off = locked && (m === 'dup' || m === 'import' || m === 'reset' || m === 'del');
    return `<button type="button" role="menuitem" data-m="${m}"${dangerous ? ' class="danger"' : ''}${off ? ' disabled' : ''}>${icon ? swIcon(icon) : '<i class="mc-pf-noic" aria-hidden="true"></i>'}<span>${tHtml(label)}</span></button>`;
  };
  mpMenu.innerHTML = [
    item('dup', 'machine.act.duplicate', 'copy'),
    item('rename', 'machine.act.rename', 'pen'),
    embedded ? '' : item('export', 'machine.act.export', 'download'),
    item('import', 'machine.act.import', ''),
    '<hr>',
    item('reset', 'machine.act.reset', 'rotate'),
    many ? item('del', 'machine.act.delete', 'trash', true) : ''
  ].join('');
}
function mpAct(m) {
  const p = activeMachine();
  if (m === 'dup') { duplicateMachine(p.id); mpFocus('more'); }
  else if (m === 'rename') {
    mpUi = { mode: 'rename', draft: p.name }; mpRender();
    const inp = mpSec.querySelector('[data-pf-focus="name"]'); if (inp) { inp.focus(); inp.select(); }
  }
  else if (m === 'export') { mpExport(p.id); mpFocus('more'); }
  else if (m === 'import') $('#mcPfFile').click();
  else if (m === 'reset' || m === 'del') { mpUi = { mode: m, draft: '' }; mpRender(); mpFocus('cancel'); }
}
function mpExport(id) {
  const f = exportMachine(id); if (!f) return;
  const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = f.filename; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

mpSec.addEventListener('click', e => {
  const b = e.target.closest('[data-pf]'); if (!b || b.disabled) return;
  const a = b.dataset.pf, p = activeMachine();
  if (a === 'new') showMachinePicker({ first: false });
  else if (a === 'more') { if (!mpMenu.hidden) { closeMenu(true); return; } mpMenuBuild(); openMenuFor(mpMenu, b, true); }
  else if (a === 'save') mpSave();
  else if (a === 'cancel') mpCancel();
  else if (a === 'delOk') { mpUi = { mode: null, draft: '' }; removeMachine(p.id); mpRender(); mpFocus('more'); }
  else if (a === 'resetOk') { mpUi = { mode: null, draft: '' }; resetMachineToTemplate(p.id); mpRender(); mpFocus('more'); }
});
mpSec.addEventListener('change', e => {
  if (e.target.dataset.pfFocus !== 'sel') return;
  switchMachine(e.target.value); mpRender();
});
mpSec.addEventListener('input', e => { if (e.target.dataset.pfFocus === 'name') mpUi.draft = e.target.value; });
mpSec.addEventListener('keydown', e => {
  if (e.target.dataset.pfFocus !== 'name') return;
  if (e.key === 'Enter') { e.preventDefault(); mpSave(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mpCancel(); }
});
mpMenu.addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b || b.disabled) return;
  closeMenu(false); mpAct(b.dataset.m);
});
mpMenu.addEventListener('keydown', e => {
  const bs = [...mpMenu.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); bs[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); bs[bs.length - 1].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu();
});
$('#mcPfFile').addEventListener('change', async e => {
  const input = e.target, file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try { const p = importMachine(await file.text()); toast(t('machine.toast.imported', { name: p.name })); }
  catch (err) { toast(err && err.message ? err.message : String(err)); }
});

/* ---------------- header label: the active profile's name ---------------- */
function mpHeader() {
  const btn = $('#btnMachine'), name = activeMachine().name;
  btn.querySelector('.lbl').textContent = name;
  btn.title = name;
  btn.setAttribute('aria-label', t('machine.button.aria', { name }));
}

SWUI.on('profile', () => { mpRender(); mpHeader(); });
SWUI.on('plot', ph => { if (ph === 'start') closeMenu(); if (ph !== 'tick') mpRender(); });
SWUI.onRender(() => { mpRender(); mpHeader(); });
mpRender(); mpHeader();
