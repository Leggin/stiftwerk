/* settings pane */
function renderSettings() {
  $('#settingsBox').innerHTML = SETTINGS.map(([g, list]) => `<section class="sec"><h2>${g}</h2>${list.map(([k, l, type, unit, hint, extra]) => {
    const h = hint ? `<small>${hint}</small>` : '';
    if (type === 'bool') return `<label class="check"><input type="checkbox" data-s="${k}" ${S[k] ? 'checked' : ''}> <span>${l}${h}</span></label>`;
    if (type === 'sel') return `<div class="field"><span>${l}${h}</span><div class="inp"><select data-s="${k}">${extra.map(([v, t]) => `<option value="${v}" ${String(S[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>`;
    return `<div class="field"><span>${l}${h}</span><label class="inp"><input type="number" data-s="${k}" step="${extra || 1}" value="${S[k]}"><em>${unit}</em></label></div>`;
  }).join('')}</section>`).join('');
}
$('#settingsBox').addEventListener('change', e => {
  const k = e.target.dataset.s; if (!k) return;
  const d = DEFAULTS[k];
  S[k] = typeof d === 'boolean' ? e.target.checked : typeof d === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value;
  saveS(); renderPage(); invalidate(true);
});
$('#btnResetSet').onclick = () => { S = Object.assign({}, DEFAULTS); saveS(); renderSettings(); bindPlotInputs(); invalidate(true); toast('Einstellungen zurückgesetzt'); };
function bindPlotInputs() {
  for (const k of ['drawF', 'travelF', 'penDelay', 'joinTol', 'simplify']) { const el = $('#s_' + k); el.value = S[k]; el.onchange = () => { S[k] = Math.max(0, parseFloat(el.value) || DEFAULTS[k]); saveS(); invalidate(true); }; }
  for (const k of ['optimize', 'reverse']) { const el = $('#s_' + k); el.checked = S[k]; el.onchange = () => { S[k] = el.checked; saveS(); invalidate(true); }; }
}

