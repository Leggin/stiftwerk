/* ---------------- console ---------------- */
/* log every streamed line during a plot (normally only errors) */
const logAll = () => { const c = $('#logAll'); return !!(c && c.checked); };
/* lines are appended (never re-rendered) so the live region only announces new lines; flushed in batches */
let mcLogQ = [], mcLogT = 0;
function log(text, cls = '') {
  mcLogQ.push([cls, text]); if (mcLogQ.length > 400) mcLogQ.splice(0, mcLogQ.length - 400);
  if (!mcLogT) mcLogT = setTimeout(mcLogFlush, 30);
}
function mcLogFlush() {
  mcLogT = 0; const el = $('#console'); if (!el || !mcLogQ.length) return;
  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 24 || !el.clientHeight;
  const frag = document.createDocumentFragment(); let err = false;
  for (const [c, tx] of mcLogQ.splice(0)) { const s = document.createElement('span'); s.className = 'l ' + c; s.textContent = (c === 'o' ? '› ' : '') + tx; frag.appendChild(s); if (c === 'e') err = true; }
  el.appendChild(frag);
  while (el.childElementCount > 400) el.firstElementChild.remove();
  if (atEnd) el.scrollTop = el.scrollHeight;
  const card = $('#mcCardLog'); if (err && card && !card.open) $('#mcLogBadge').hidden = false;
}
function mcLogToEnd() { const el = $('#console'); if (el) el.scrollTop = el.scrollHeight; }
$('#logClear').onclick = () => { mcLogQ = []; $('#console').textContent = ''; $('#mcLogBadge').hidden = true; };
/* command line with history (↑ ↓) */
const mcHist = []; let mcHistI = 0;
$('#cmdIn').addEventListener('keydown', e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!mcHist.length) return;
  e.preventDefault(); mcHistI = Math.max(0, Math.min(mcHist.length, mcHistI + (e.key === 'ArrowUp' ? -1 : 1)));
  e.target.value = mcHist[mcHistI] || '';
});
$('#cmdForm').onsubmit = e => {
  e.preventDefault(); const v = $('#cmdIn').value.trim(); if (!v) return;
  if (!serial.connected) return toast(t('console.toast.notConnected'));
  if (mcHist[mcHist.length - 1] !== v) mcHist.push(v);
  mcHistI = mcHist.length;
  if (v === '!' || v === '~' || v === '?') { serial.rt(v); log(v, 'o'); }
  else serial.send([v]).catch(() => { });
  $('#cmdIn').value = '';
};
