/* console */
const logBuf = [];
function log(text, cls = '') {
  logBuf.push([cls, text]); if (logBuf.length > 400) logBuf.splice(0, logBuf.length - 400);
  const el = $('#console'); const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  el.innerHTML = logBuf.map(([c, t]) => `<span class="${c}">${c === 'o' ? '› ' : ''}${esc(t)}</span>`).join('\n');
  if (atEnd) el.scrollTop = el.scrollHeight;
}
$('#cmdForm').onsubmit = e => {
  e.preventDefault(); const v = $('#cmdIn').value.trim(); if (!v) return;
  if (!serial.connected) return toast('Nicht verbunden');
  if (v === '!' || v === '~' || v === '?') { serial.rt(v); log(v, 'o'); }
  else serial.send([v]).catch(() => { });
  $('#cmdIn').value = '';
};

