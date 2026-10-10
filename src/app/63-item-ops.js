function removeItem(id) { items = items.filter(i => i.id !== id); if (selId === id) selId = null; invalidate(true); renderObjects(); renderProps(); }
function addItem(it) {
  if (!it.sample && items.some(i => i.sample)) { items = items.filter(i => !i.sample); toast('Beispiele entfernt'); }
  items.push(it); invalidate(true); select(it.id); renderObjects();
}

