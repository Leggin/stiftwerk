window.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select') || !$('#modal').hidden) { if (e.key === 'Escape' && !$('#modal').hidden) closeDialog(false); return; }
  const it = items.find(i => i.id === selId);
  if (e.key === ' ' && plotting) { e.preventDefault(); togglePause(); return; }
  if (!it) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItem(it.id); }
  const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); it.x += mv[0]; it.y += mv[1]; invalidate(); renderProps(true); }
  if (e.key === 'Escape') select(null);
});

