/* keyboard shortcuts. Not while typing in a field, a dialog is open, or a menu is focused. */
window.addEventListener('keydown', e => {
  if (!$('#modal').hidden) return;                                   // dialogs handle their own keys (85-dialog.js)
  const tg = e.target && e.target.closest ? e.target : document.body;
  if (tg.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (e.key === 'Escape' && SWUI.machine.isOpen) { SWUI.machine.close(); return; }
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
    e.preventDefault(); if (e.key === 'y' || e.shiftKey) redo(); else undo(); return;
  }
  if (e.key === ' ' && plotting && !tg.closest('button,summary,a')) { e.preventDefault(); togglePause(); return; }
  if (tg.closest('[role="menu"]')) return;
  const it = items.find(i => i.id === selId);
  if (!it || plotting) return;
  if (e.key === 'F2' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); startRename(it.id); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (tg.closest('button,summary,a') && e.key === 'Backspace') return; e.preventDefault(); removeItem(it.id); return; }
  if (e.key === 'Escape') { select(null); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrows && !tg.closest('button,summary,a,[role="group"]')) {
    e.preventDefault();
    // selected plotted texts are nudged (0.5 mm, Shift 5 mm) instead of the whole object
    const els = txSel.id === it.id ? txSel.els.filter(el => textStyleOf(it, el).mode === 'plot') : [];
    if (els.length) { const d = e.shiftKey ? 5 : 0.5; moveTexts(it, els, arrows[0] * d, arrows[1] * d); invalidate(); renderProps(); return; }
    const d = e.shiftKey ? 10 : 1; it.x += arrows[0] * d; it.y += arrows[1] * d; invalidate(); renderProps(true);
  }
});
