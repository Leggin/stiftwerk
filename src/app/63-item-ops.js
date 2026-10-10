/* add / remove / duplicate objects. Removing is undoable: the toast offers "Rückgängig". */
function removeItem(id, opts) {
  const it = items.find(i => i.id === id); if (!it || plotting) return;
  items = items.filter(i => i.id !== id);
  invalidate(true);
  if (selId === id) select(null); else renderObjects();
  renderProps();
  if (!(opts && opts.silent)) toast(t('objects.toast.removed', { name: itemName(it) }), { action: { label: t('common.undo'), run: undo } });
}
function addItem(it) {
  const hadSamples = !it.sample && items.some(i => i.sample);
  if (hadSamples) items = items.filter(i => !i.sample);
  items.push(it); invalidate(true); select(it.id); renderObjects();
  if (hadSamples) toast(t('objects.toast.samplesRemoved'), { action: { label: t('common.undo'), run: undo } });
}
function duplicateItem(id) {
  const it = items.find(i => i.id === id); if (!it || plotting) return;
  const c = copyItem(it); c.id = SW.uid(); c.name = t('inspector.copyName', { name: itemName(it) });
  delete c.nameKey; delete c.sample; delete c.notes; c.x += 5; c.y += 5;
  items.push(c); invalidate(); select(c.id);
}
