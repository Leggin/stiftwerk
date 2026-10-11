/* ---------------- G-code export ---------------- */
/* inside a frame (embedded) downloads are usually blocked: copy to the clipboard instead */
const embedded = window.self !== window.top;
const canSaveGcode = () => !embedded;
function planJob() { const j = getJob(); return { layers: j.plotLayers, stats: j.stats }; }
async function copyGcode() {
  const txt = SW.programText(planJob(), S);
  try { await navigator.clipboard.writeText(txt); toast(tn('gcode.toast.copied', txt.split('\n').length)); }
  catch (e) { showDialog(`<h3>${tHtml('gcode.title')}</h3><p class="hint">${tHtml('gcode.copy.blockedHint')}</p><textarea style="height:240px;font:11px var(--f-mono)" readonly aria-label="${tHtml('gcode.title')}">${esc(txt)}</textarea><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`); }
}
async function saveGcode() {
  const txt = SW.programText(planJob(), S), base = (items[0] ? items[0].name : 'plot').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'plot';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = base + '.gcode';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(t('gcode.toast.saved'));
}
/* the primary button of step ③ without Web Serial: save the file (or copy it where saving is not possible) */
const gcodeExport = () => canSaveGcode() ? saveGcode() : copyGcode();
$('#btnCopyG').onclick = copyGcode;
$('#btnSaveG').onclick = saveGcode;
if (embedded) $('#btnSaveG').hidden = true;
