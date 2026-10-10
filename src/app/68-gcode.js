/* ---------------- G-code export ---------------- */
$('#btnCopyG').onclick = async () => {
  const txt = SW.programText(planJob(), S);
  try { await navigator.clipboard.writeText(txt); toast(`G-Code kopiert (${txt.split('\n').length.toLocaleString('de-DE')} Zeilen)`); }
  catch (e) { showDialog(`<h3>G-Code</h3><p class="hint">Kopieren wurde blockiert. Text markieren und kopieren:</p><textarea style="height:240px;font:11px var(--f-mono)" readonly>${esc(txt)}</textarea><div class="row"><button class="btn primary" data-close>Schließen</button></div>`); }
};
const embedded = window.self !== window.top;
let dlApi = null;
if (embedded) { $('#btnSaveG').hidden = true; if (window.host && window.host.use) window.host.use('downloads').then(d => { dlApi = d; $('#btnSaveG').hidden = !d; }).catch(() => { }); }
$('#btnSaveG').onclick = async () => {
  const txt = SW.programText(planJob(), S), base = (items[0] ? items[0].name : 'plot').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'plot';
  if (embedded) {
    if (!dlApi) return;
    try { await dlApi.save({ filename: base + '.gcode.txt', data: txt }); toast('G-Code gespeichert'); }
    catch (e) { if (e && e.code === 'declined') return; toast(e && e.code === 'rate_limited' ? 'Bitte kurz warten und erneut versuchen' : 'Speichern ist hier nicht möglich – „G-Code kopieren“ nutzen'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = base + '.gcode';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
function planJob() { const j = getJob(); return { layers: j.plotLayers, stats: j.stats }; }

