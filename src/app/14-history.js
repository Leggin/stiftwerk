/* ---------------- undo / redo ----------------
 * Snapshots of { items, layerMeta, doc, page }. Item src objects are shared (never mutated), so a snapshot is cheap.
 * A step is recorded when the debounced save runs (persist → flushPersist), i.e. ~400 ms after the last edit. */
const history = SWUndo.create({ limit: 100, coalesceMs: 0 });
const srcIds = new WeakMap(); let srcSeq = 0;
const srcId = o => { if (!srcIds.has(o)) srcIds.set(o, ++srcSeq); return srcIds.get(o); };
const copyItem = it => Object.assign({}, it, it.hatch ? { hatch: Object.assign({}, it.hatch) } : null, it.text ? { text: Object.assign({}, it.text) } : null, it.gen ? { gen: Object.assign({}, it.gen, { params: Object.assign({}, it.gen.params) }) } : null);
function snapshot() { return { items: items.map(copyItem), layerMeta: JSON.parse(JSON.stringify(layerMeta)), doc: JSON.parse(JSON.stringify(doc)), page: Object.assign({}, page) }; }
const signature = s => JSON.stringify(s, (k, v) => k === 'src' && v && typeof v === 'object' ? '#' + srcId(v) : v);
function historyCommit(user) {
  const s = snapshot(), sig = signature(s);
  if (user) history.commit(s, sig); else history.amend(s, sig);
  SWUI.emit('history');
}
function historyReset() { const s = snapshot(); history.reset(s, signature(s)); SWUI.emit('history'); }
function restore(s) {
  items = s.items.map(copyItem); layerMeta = JSON.parse(JSON.stringify(s.layerMeta)); doc = JSON.parse(JSON.stringify(s.doc)); page = Object.assign({}, s.page);
  if (!items.some(i => i.id === selId)) selId = null;
  jobDirty = true; rebuild();
  clearTimeout(saveTimer); store.set('page', page); store.set('layers', layerMeta); store.set('doc', doc);
  try { localStorage.setItem('stiftwerk:items', JSON.stringify(items)); } catch (e) { }
  renderAll(); SWUI.emit('history');
}
function undo() { if (plotting) return false; if (saveTimer) flushPersist(); const s = history.undo(); if (!s) return false; restore(s); return true; }
function redo() { if (plotting) return false; if (saveTimer) flushPersist(); const s = history.redo(); if (!s) return false; restore(s); return true; }
