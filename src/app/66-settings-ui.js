/* ---------------- settings UI (Maschine drawer): friendly groups, bound labels, sync with the setup wizard ---------------- */
function mcFieldHtml(f) {
  const id = 'mcs_' + f.k, hid = id + '_h', desc = f.hint ? ` aria-describedby="${hid}"` : '';
  const head = `<div class="mc-ft"><label for="${id}">${tHtml(f.label)}</label>${f.hint ? `<small id="${hid}">${tHtml(f.hint)}</small>` : ''}</div>`;
  if (f.type === 'bool') return `<div class="mc-field mc-bool">${head}<input class="mc-switch" type="checkbox" role="switch" id="${id}" data-s="${f.k}" data-mc-lock="plot"${desc}></div>`;
  if (f.type === 'sel') {
    const opts = f.opts.map(([v, o]) => `<option value="${esc(v)}">${I18N.has(o) ? tHtml(o) : esc(o)}</option>`).join('');
    const why = f.k === 'startMode' ? `<p class="hint mc-explain" id="mcModeExplain"></p>` : '';
    return `<div class="mc-field mc-sel">${head}<span class="mc-inp"><select id="${id}" data-s="${f.k}" data-mc-lock="plot"${desc}>${opts}</select></span>${why}</div>`;
  }
  /* G-code text: the value is filled in by mcSyncInputs */
  if (f.type === 'code') return `<div class="mc-field mc-code">${head}<textarea class="mc-ta" id="${id}" data-s="${f.k}" data-mc-lock="plot" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off"${desc}></textarea></div>`;
  const lim = (f.min != null ? ` min="${f.min}"` : '') + (f.max != null ? ` max="${f.max}"` : '');
  return `<div class="mc-field mc-num">${head}<span class="mc-inp"><input type="number" inputmode="decimal" id="${id}" data-s="${f.k}" data-mc-lock="plot" step="${f.step || 1}"${lim}${desc}>${f.unit ? `<em>${tHtml(f.unit)}</em>` : ''}</span></div>`;
}
/* controls that are not settings, placed next to the fields they belong to. Their lock comes from mcApplyLocks,
 * their tooltip (why they are off) from mcSetWhy. */
function mcReadHtml() {
  return `<div class="mc-field mc-action"><div class="mc-btns"><button type="button" class="btn mc-btn" data-mc-set="read" data-mc-lock="conn" data-mc-why aria-describedby="mcx_read_h">${tHtml('settings.read.button')}</button></div><div class="mc-ft"><small id="mcx_read_h">${tHtml('settings.read.hint')}</small></div></div>`;
}
function mcPenTestHtml() {
  return `<div class="mc-field mc-action" role="group" aria-labelledby="mcx_pentest_l" aria-describedby="mcx_pentest_h"><div class="mc-ft"><span class="mc-ftl" id="mcx_pentest_l">${tHtml('settings.penTest.label')}</span><small id="mcx_pentest_h">${tHtml('settings.penTest.hint')}</small></div><div class="mc-btns"><button type="button" class="btn mc-btn" data-mc-set="penDown" data-mc-lock="conn" data-mc-why>${tHtml('settings.penTest.down')}</button><button type="button" class="btn mc-btn" data-mc-set="penUp" data-mc-lock="conn" data-mc-why>${tHtml('settings.penTest.up')}</button></div></div>`;
}
const MC_AFTER = { machH: mcReadHtml };   // extra controls after a field (work area → read from plotter)
function mcFieldsHtml(g) {
  return g.fields.filter(f => !f.when || f.when(S)).map(f => mcFieldHtml(f) + (MC_AFTER[f.k] ? MC_AFTER[f.k]() : '')).join('');
}
function mcGroupHtml(g) {
  const pen = g.id === 'pen';
  const warn = pen ? `<p class="mc-note warn mc-penwarn" role="status" hidden>${tHtml('mc.set.penOrder')}</p>${mcPenTestHtml()}` : '';
  return `<section class="mc-group" aria-labelledby="mcg_${g.id}"><h4 id="mcg_${g.id}">${tHtml(g.title)}</h4>${mcFieldsHtml(g)}${warn}</section>`;
}
function renderSettings() {
  $('#settingsBox').innerHTML = SETTINGS.filter(g => g.where !== 'conn').map(mcGroupHtml).join('');
  $('#mcConnAdv').innerHTML = SETTINGS.filter(g => g.where === 'conn').map(mcFieldsHtml).join('');
  mcSyncInputs(); mcApplyLocks(); mcSetWhy();
  mcWizRender();
}
/* the machine buttons in the settings card say why they are off: no connection, or a plot is running */
function mcSetWhy() {
  const why = plotting ? t('settings.lock.plot') : !serial.connected ? t('settings.lock.conn') : '';
  for (const b of $$('#settingsBox [data-mc-why]')) if (b.title !== why) b.title = why;
}
SWUI.on('conn', mcSetWhy);
SWUI.on('plot', ph => { if (ph !== 'tick') mcSetWhy(); });
/* write S into every bound input (settings card, advanced connection fields, wizard) */
function mcSyncInputs() {
  for (const el of $$('#machine [data-s]')) { const v = S[el.dataset.s]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
  const ex = $('#mcModeExplain'); if (ex) ex.textContent = t('settings.startMode.explain.' + S.startMode);
  /* two Z heights that are the same: the pen would not move (only for Z pens; servo and G-code pens have no Z) */
  for (const w of $$('#machine .mc-penwarn')) w.hidden = !(isZPen() && S.penUp === S.penDown);
  const zu = $('#mcZUp'), zd = $('#mcZDown'); if (zu) zu.textContent = 'Z ' + fmt(S.penUp, 1); if (zd) zd.textContent = 'Z ' + fmt(S.penDown, 1);
}
/* re-render but keep keyboard focus on the same control */
function mcKeepFocus(fn) {
  const id = document.activeElement && document.activeElement.id; fn();
  if (id) { const el = document.getElementById(id); if (el && el.focus) el.focus({ preventScroll: true }); }
}
/* a machine setting changed: the sheet outline (work area) and the job estimate may change */
function mcAfterSettings() { if (typeof renderPage === 'function') renderPage(); invalidate(true); }
function mcSetSetting(k, v) {
  S[k] = v; saveS(); mcSyncInputs();
  const f = settingsFields().find(x => x.k === k);
  /* a choice or a switch can show or hide other fields (their "when"): re-render and keep the focus where it was */
  if (f && (f.type === 'sel' || f.type === 'bool')) mcKeepFocus(renderSettings);
  if (k === 'startMode' || k === 'homeOffX' || k === 'homeOffY') SWUI.emit('origin');
  mcAfterSettings();
}
/* G-code text: no carriage returns (pasted text), same length limit as the profile */
const mcCodeText = el => String(el.value).replace(/\r/g, '').slice(0, 2000);
$('#machine').addEventListener('change', e => {
  const el = e.target.closest ? e.target.closest('[data-s]') : null; if (!el) return;
  const k = el.dataset.s, f = settingsFields().find(x => x.k === k); if (!f) return;
  let v;
  if (f.type === 'bool') v = el.checked;
  else if (f.type === 'num') {
    v = parseFloat(el.value); if (!isFinite(v)) { mcSyncInputs(); return; }
    if (f.min != null) v = Math.max(f.min, v);
    if (f.max != null) v = Math.min(f.max, v);
    v = Math.round(v * 1000) / 1000;
  } else if (f.type === 'code') v = mcCodeText(el);
  else v = typeof DEFAULTS[k] === 'number' ? +el.value : el.value;
  mcSetSetting(k, v);
});
/* code fields also save when they lose focus (a change event only fires for an edited value; this is the same path) */
$('#machine').addEventListener('focusout', e => {
  const el = e.target; if (!el || el.tagName !== 'TEXTAREA' || !el.dataset.s) return;
  const f = settingsFields().find(x => x.k === el.dataset.s); if (!f || f.type !== 'code') return;
  const v = mcCodeText(el); if (v !== S[f.k]) mcSetSetting(f.k, v);
});
/* "Vom Plotter lesen": $$ → work area (and what the plotter warns about). The values go through the normal setter. */
let mcReadBusy = false;
const mcNum = v => fmt(v, Number.isInteger(v) ? 0 : 1);
const mcLimit = (k, v) => { const f = settingsFields().find(x => x.k === k); return Math.min(f.max, Math.max(f.min, v)); };
async function mcReadPlotter(btn) {
  if (mcReadBusy) return;
  mcReadBusy = true; btn.classList.add('mc-busy');
  try {
    let r;
    try { r = SWMachine.parseSettings(await serial.query('$$')); }
    catch (e) { toast(t('settings.read.error')); return; }
    const hasArea = r.machW != null || r.machH != null;
    if (!hasArea && r.zMax == null && r.laser == null) { toast(t('settings.read.none')); return; }
    if (r.machW != null) mcSetSetting('machW', mcLimit('machW', r.machW));
    if (r.machH != null) mcSetSetting('machH', mcLimit('machH', r.machH));
    if (hasArea) toast(t('settings.read.area', { w: mcNum(S.machW), h: mcNum(S.machH) }));
    if (r.zMax != null && isZPen() && S.penDown > r.zMax) toast(t('settings.read.zWarn', { down: mcNum(S.penDown), zmax: mcNum(r.zMax) }), { duration: 9000 });
    if (r.laser && S.penType === 'servo') toast(t('settings.read.laserWarn'), { duration: 9000 });
  } finally { mcReadBusy = false; btn.classList.remove('mc-busy'); }
}
/* the buttons of the settings card: read from plotter, pen test (their locks come from mcApplyLocks) */
$('#settingsBox').addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('[data-mc-set]') : null; if (!b || b.disabled) return;
  const a = b.dataset.mcSet;
  if (a === 'read') mcReadPlotter(b);
  else if (a === 'penDown') mcPenDown();
  else if (a === 'penUp') mcPenUp();
});
/* "Werte der Vorlage" (the template values of the active profile): inline confirm, then an undo toast */
function mcResetAsk(on) {
  $('#mcResetAsk').hidden = !on; $('#btnResetSet').hidden = on;
  (on ? $('#btnResetNo') : $('#btnResetSet')).focus();
}
$('#btnResetSet').onclick = () => mcResetAsk(true);
$('#btnResetNo').onclick = () => mcResetAsk(false);
$('#mcResetAsk').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); mcResetAsk(false); } });
$('#btnResetYes').onclick = () => {
  const before = {}; for (const f of settingsFields()) { before[f.k] = S[f.k]; S[f.k] = DEFAULTS[f.k]; }
  saveS(); mcResetAsk(false); renderSettings(); mcAfterSettings();
  toast(t('settings.toast.reset'), { action: { label: t('common.undo'), run: () => { Object.assign(S, before); saveS(); renderSettings(); mcAfterSettings(); } } });
};
function bindPlotInputs() {
  for (const k of ['drawF', 'travelF', 'penDelay', 'joinTol', 'simplify']) { const el = $('#s_' + k); el.value = S[k]; el.onchange = () => { S[k] = Math.max(0, parseFloat(el.value) || DEFAULTS[k]); saveS(); invalidate(true); }; }
  for (const k of ['optimize', 'reverse']) { const el = $('#s_' + k); el.checked = S[k]; el.onchange = () => { S[k] = el.checked; saveS(); invalidate(true); }; }
}
