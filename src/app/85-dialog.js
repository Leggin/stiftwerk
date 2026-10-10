/* ---------------- dialog & toast ---------------- */
let dialogRes = null;
function showDialog(html, res) { $('#dialog').innerHTML = html; $('#modal').hidden = false; dialogRes = res || null; const f = $('#dialog').querySelector('.primary,button'); if (f) f.focus(); }
function closeDialog(v) { $('#modal').hidden = true; const r = dialogRes; dialogRes = null; if (r) r(v); }
$('#modal').addEventListener('click', e => { if (e.target.matches('[data-close]')) closeDialog(false); });
let toastT = 0; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }

