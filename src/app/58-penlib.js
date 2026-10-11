/* ---------------- pen library (lib/55-penlib.js) ----------------
 * The user's real pens, kept across documents (localStorage stiftwerk:penlib, not part of undo). A document pen
 * (doc.pens[i] or doc.single) links to one with .lib = entry id: it takes the entry's colour and name, and plotting
 * that pen uses the entry's speed, pen-down depth (Z) / servo value and delay. Event 'penlib' after every change. */
let penLib = SWPenLib.load(store.get('penlib', []));
function savePenLib() { store.set('penlib', penLib); SWUI.emit('penlib', penLib); }
const libEntry = id => SWPenLib.byId(penLib, id);
/* the document pen of a plot group / pen list row: 'single' or a pen id */
const docPen = id => id === SWPens.SINGLE ? doc.single : SWPens.penById(doc, id);
const docPensLinkedTo = id => [doc.single, ...doc.pens].filter(p => p && p.lib === id);
function libAdd(entry) { const e = SWPenLib.validate(Object.assign({}, entry, { id: null })); penLib.push(e); savePenLib(); return e; }
/* change an entry: linked pens follow its colour and name; the job is rebuilt (speeds, widths) */
function libUpdate(id, patch) {
  const i = penLib.findIndex(e => e.id === id); if (i < 0) return null;
  const e = penLib[i] = SWPenLib.validate(Object.assign({}, penLib[i], patch, { id }));
  savePenLib();
  const linked = docPensLinkedTo(id);
  for (const p of linked) { p.color = e.color; if (e.name) p.name = e.name; }
  if (linked.length) invalidate(true); else { jobDirty = true; rebuild(); }
  return e;
}
function libRemove(id) {
  penLib = penLib.filter(e => e.id !== id); savePenLib();
  const linked = docPensLinkedTo(id); for (const p of linked) delete p.lib;
  if (linked.length) invalidate(true);
}
/* link a document pen to a library pen (libId null = unlink; colour and name stay) */
function libLink(penId, libId) {
  const p = docPen(penId); if (!p || plotting) return;
  const e = libEntry(libId);
  if (e) { p.lib = e.id; p.color = e.color; if (e.name) p.name = e.name; } else delete p.lib;
  invalidate(true);
}
/* save a document pen into the library and link it */
function libFromPen(penId) {
  const p = docPen(penId); if (!p) return null;
  const e = libAdd(SWPenLib.fromPen(p, p.name || penLabel(p)));
  p.lib = e.id; invalidate(true); return e;
}
/* plan groups (SWPens.plan) get the settings and line width of their library pen – called by rebuild() */
function libApply(plan) {
  for (const g of plan.groups) {
    const p = docPen(g.id), e = p && libEntry(p.lib); if (!e) continue;
    const SL = SWPenLib.withPen(S, e); if (SL !== S) g.S = SL;
    g.width = e.width;
  }
  return plan;
}
/* the library as a file, and back */
function libExport() { return { filename: 'stiftwerk-stifte.json', text: JSON.stringify({ stiftwerkPens: 1, pens: penLib }, null, 2) }; }
function libImport(text) {
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error(t('penlib.err.notJson')); }
  const arr = Array.isArray(o) ? o : o && Array.isArray(o.pens) ? o.pens : null;
  if (!arr) throw new Error(t('penlib.err.notPens'));
  const add = SWPenLib.load(arr).map(e => Object.assign(e, { id: SWPenLib.uid() }));
  penLib = penLib.concat(add); savePenLib(); return add.length;
}
