/* ---------------- dialog & toast ----------------
 * showDialog(html, resolve, { dismissible: false }) – role="dialog", aria-modal, labelled by its first <h3>, focus trap, focus return.
 *   Esc / backdrop close it (resolve(false)) unless dismissible === false; [data-close] buttons always close.
 * closeDialog(v) resolves with v.
 * toast(text, { action: { label, run }, duration }) – stacks bottom-left, polite live region. */
let dialogRes = null, dialogOpts = {}, dialogFrom = null, backdropDown = false;
const DLG_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function showDialog(html, res, opts) {
  const dlg = $('#dialog'), modal = $('#modal');
  if (dialogRes) { const prev = dialogRes; dialogRes = null; prev(false); }
  if (modal.hidden) dialogFrom = document.activeElement;
  dialogOpts = opts || {};
  dlg.innerHTML = html;
  const h = dlg.querySelector('h3');
  if (h) { h.id = 'dlgTitle'; dlg.setAttribute('aria-labelledby', 'dlgTitle'); } else dlg.removeAttribute('aria-labelledby');
  modal.hidden = false; dialogRes = res || null;
  $('#app').inert = true; $('#machine').inert = true;
  const f = dlg.querySelector('[autofocus]') || dlg.querySelector('.primary') || dlg.querySelector(DLG_FOCUSABLE);
  (f || dlg).focus();
}
function closeDialog(v) {
  $('#modal').hidden = true; $('#app').inert = false; $('#machine').inert = false;
  const r = dialogRes; dialogRes = null;
  const back = dialogFrom; dialogFrom = null;
  if (back && back.focus && document.contains(back) && !back.disabled) back.focus();
  if (r) r(v);
}
$('#modal').addEventListener('pointerdown', e => { backdropDown = e.target === $('#modal'); });
$('#modal').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { closeDialog(false); return; }
  if (e.target === $('#modal') && backdropDown && dialogOpts.dismissible !== false) closeDialog(false);
  backdropDown = false;
});
document.addEventListener('keydown', e => {
  if ($('#modal').hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (dialogOpts.dismissible !== false) closeDialog(false); return; }
  if (e.key !== 'Tab') return;
  const dlg = $('#dialog'), fs = [...dlg.querySelectorAll(DLG_FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!fs.length) { e.preventDefault(); dlg.focus(); return; }
  const first = fs[0], last = fs[fs.length - 1], a = document.activeElement;
  if (!dlg.contains(a)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && (a === first || a === dlg)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}, true);

function toast(text, opts) {
  opts = opts || {};
  const host = $('#toast'); if (!host) return null;
  for (const old of [...host.children]) if (old.firstChild && old.firstChild.textContent === String(text)) old.remove();
  const el = document.createElement('div'); el.className = 'toast';
  const tt = document.createElement('span'); tt.className = 'tt'; tt.textContent = String(text); el.appendChild(tt);
  let timer = 0, gone = false;
  const remove = () => { if (gone) return; gone = true; clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  const arm = ms => { clearTimeout(timer); timer = setTimeout(remove, ms); };
  if (opts.action) {
    const b = document.createElement('button'); b.className = 'act'; b.textContent = opts.action.label;
    b.onclick = () => { remove(); try { opts.action.run(); } catch (err) { console.error(err); } };
    el.appendChild(b);
  }
  el.addEventListener('mouseenter', () => clearTimeout(timer)); el.addEventListener('mouseleave', () => arm(2200));
  el.addEventListener('focusin', () => clearTimeout(timer)); el.addEventListener('focusout', () => arm(2200));
  host.prepend(el);
  while (host.children.length > 3) host.lastElementChild.remove();
  arm(opts.duration || (opts.action ? 7500 : 3800));
  return { dismiss: remove };
}
