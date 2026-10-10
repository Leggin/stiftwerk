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
  const lim = (f.min != null ? ` min="${f.min}"` : '') + (f.max != null ? ` max="${f.max}"` : '');
  return `<div class="mc-field mc-num">${head}<span class="mc-inp"><input type="number" inputmode="decimal" id="${id}" data-s="${f.k}" data-mc-lock="plot" step="${f.step || 1}"${lim}${desc}>${f.unit ? `<em>${tHtml(f.unit)}</em>` : ''}</span></div>`;
}
function mcGroupHtml(g) {
  const fields = g.fields.filter(f => !f.when || f.when(S)).map(mcFieldHtml).join('');
  const warn = g.id === 'pen' ? `<p class="mc-note warn mc-penwarn" role="status" hidden>${tHtml('mc.set.penOrder')}</p>` : '';
  return `<section class="mc-group" aria-labelledby="mcg_${g.id}"><h4 id="mcg_${g.id}">${tHtml(g.title)}</h4>${fields}${warn}</section>`;
}
function renderSettings() {
  $('#settingsBox').innerHTML = SETTINGS.filter(g => g.where !== 'conn').map(mcGroupHtml).join('');
  $('#mcConnAdv').innerHTML = SETTINGS.filter(g => g.where === 'conn').map(g => g.fields.map(mcFieldHtml).join('')).join('');
  mcSyncInputs(); mcApplyLocks();
  mcWizRender();
}
/* write S into every bound input (settings card, advanced connection fields, wizard) */
function mcSyncInputs() {
  for (const el of $$('#machine [data-s]')) { const v = S[el.dataset.s]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
  const ex = $('#mcModeExplain'); if (ex) ex.textContent = t('settings.startMode.explain.' + S.startMode);
  for (const w of $$('#machine .mc-penwarn')) w.hidden = !(S.penUp >= S.penDown);
  const zu = $('#mcZUp'), zd = $('#mcZDown'); if (zu) zu.textContent = 'Z ' + fmt(S.penUp, 1); if (zd) zd.textContent = 'Z ' + fmt(S.penDown, 1);
}
/* re-render but keep keyboard focus on the same control */
function mcKeepFocus(fn) {
  const id = document.activeElement && document.activeElement.id; fn();
  if (id) { const el = document.getElementById(id); if (el && el.focus) el.focus({ preventScroll: true }); }
}
function mcSetSetting(k, v) {
  S[k] = v; saveS(); mcSyncInputs();
  if (k === 'startMode') mcKeepFocus(renderSettings);
  if (k === 'startMode' || k === 'homeOffX' || k === 'homeOffY') SWUI.emit('origin');
  renderPage(); invalidate(true);
}
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
  } else v = typeof DEFAULTS[k] === 'number' ? +el.value : el.value;
  mcSetSetting(k, v);
});
/* "Standardwerte": inline confirm, then an undo toast */
function mcResetAsk(on) {
  $('#mcResetAsk').hidden = !on; $('#btnResetSet').hidden = on;
  (on ? $('#btnResetNo') : $('#btnResetSet')).focus();
}
$('#btnResetSet').onclick = () => mcResetAsk(true);
$('#btnResetNo').onclick = () => mcResetAsk(false);
$('#mcResetAsk').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); mcResetAsk(false); } });
$('#btnResetYes').onclick = () => {
  const before = {}; for (const f of settingsFields()) { before[f.k] = S[f.k]; S[f.k] = DEFAULTS[f.k]; }
  saveS(); mcResetAsk(false); renderSettings(); renderPage(); invalidate(true);
  toast(t('settings.toast.reset'), { action: { label: t('common.undo'), run: () => { Object.assign(S, before); saveS(); renderSettings(); renderPage(); invalidate(true); } } });
};
function bindPlotInputs() {
  for (const k of ['drawF', 'travelF', 'penDelay', 'joinTol', 'simplify']) { const el = $('#s_' + k); el.value = S[k]; el.onchange = () => { S[k] = Math.max(0, parseFloat(el.value) || DEFAULTS[k]); saveS(); invalidate(true); }; }
  for (const k of ['optimize', 'reverse']) { const el = $('#s_' + k); el.checked = S[k]; el.onchange = () => { S[k] = el.checked; saveS(); invalidate(true); }; }
}
