/* ---------------- documents: the shelf ("Meine Dokumente") and project files ----------------
 * The open document is saved automatically into its slot (IndexedDB store 'docs', SWProject JSON without font sources –
 * those live in the font store). docIndex (localStorage stiftwerk:docs) lists the slots: { id, name, savedAt, n, thumb }.
 * curDocId = the slot of the open document (null = not saved yet: it gets a slot with its first real edit).
 * A project file (.stiftwerk.json) carries the font sources too, so it opens on another computer.
 * Switching documents resets undo (the previous document is saved). Event 'docs' after every change of the shelf. */
const docStore = swDB('docs');
let docIndex = store.get('docs', []), curDocId = store.get('curDoc', null);
if (!Array.isArray(docIndex)) docIndex = [];
if (curDocId && !docIndex.some(d => d.id === curDocId)) curDocId = null;
const docMeta = id => docIndex.find(d => d.id === id) || null;
const docName = () => { const m = docMeta(curDocId); return m ? m.name : ''; };
function docIndexSave() { store.set('docs', docIndex); store.set('curDoc', curDocId); SWUI.emit('docs'); }
const docHasContent = () => items.some(i => !i.sample);
/* a small preview: every pen's lines as one SVG path (simplified, capped) */
function docThumb() {
  const j = job; if (!j) return null;
  const tol = Math.max(page.w, page.h) / 120, out = []; let budget = 3000;
  for (const L of j.plotLayers) {
    let d = '';
    for (const p of L.paths) { if (budget <= 0) break; const q = SW.rdp(p.pts, tol); budget -= q.length; d += 'M' + q.map(v => v[0].toFixed(1) + ' ' + v[1].toFixed(1)).join('L'); }
    if (d) out.push({ c: L.color, d });
  }
  return { w: page.w, h: page.h, p: out };
}
/* generated patterns are stored without their lines (re-made on opening, see docApply) */
const slimItem = it => it.type === 'gen' ? Object.assign({}, it, { src: { paths: [], fills: [], w: it.src.w, h: it.src.h } }) : it;
const docState = () => ({ name: docName(), page, items: items.map(slimItem), layerMeta, doc });
/* "Karte" → "Karte (2)" when the shelf already has one */
function docUniqueName(name) { const names = new Set(docIndex.map(d => d.name)); if (!names.has(name)) return name; let n = 2; while (names.has(`${name} (${n})`)) n++; return `${name} (${n})`; }
/* save the open document into its slot (creates the slot on the first real edit) */
let docSaveTimer = 0, docSaving = Promise.resolve();
function docAutosave() { clearTimeout(docSaveTimer); docSaveTimer = setTimeout(docSaveNow, 1200); }
function docSaveNow() {
  clearTimeout(docSaveTimer); docSaveTimer = 0;
  if (!curDocId) {
    if (!docHasContent()) return docSaving;
    curDocId = 'd' + SW.uid();
    docIndex.unshift({ id: curDocId, name: docUntitledName(), savedAt: 0, n: 0 });
  }
  const id = curDocId, txt = SWProject.serialize(docState());
  const m = docMeta(id); if (m) { m.savedAt = Date.now(); m.n = items.length; m.thumb = docThumb(); }
  docIndex.sort((a, b) => b.savedAt - a.savedAt); docIndexSave();
  docSaving = docStore.put(id, txt).catch(() => { if (!docWarned) { docWarned = true; toast(t('docs.toast.saveFailed')); } });
  return docSaving;
}
let docWarned = false;
function docUntitledName() { let n = 1; const names = new Set(docIndex.map(d => d.name)); while (names.has(t('docs.untitled', { n }))) n++; return t('docs.untitled', { n }); }
SWUI.on('history', () => { if (!plotting) docAutosave(); });
window.addEventListener('pagehide', () => { if (docSaveTimer) docSaveNow(); });

/* replace the open document (fonts from a project file are registered first) */
function docApply(p) {
  for (const [id, f] of Object.entries(p.fonts || {})) {
    if (customFonts[id]) continue;
    try { const font = SW.parseSvgFont(f.svg, f.name); font.id = id; fontCache.set(id, font); customFonts[id] = f.name; fontSrcPut(id, f.svg).catch(() => { }); } catch (e) { }
  }
  store.set('customFonts', customFonts);
  const st = SWMigrate.migrate({ items: p.items, layerMeta: p.layerMeta, doc: p.doc });
  items = st.items; layerMeta = st.layerMeta; doc = st.doc;
  if (p.page) { page = Object.assign({}, page, p.page); pageDims(); }
  selId = null; selMore.clear(); setResume(null); txSel = { id: null, els: [] };
  for (const it of items) if (it.type === 'gen') { try { it.src = genSource(it); } catch (e) { } }
  jobDirty = true; flushPersist(); historyReset(); renderAll(); fitView(); render();
  SWUI.emit('select', null);
}
async function docOpen(id) {
  if (plotting || id === curDocId) return false;
  await docSaveNow();
  let txt = null; try { txt = await docStore.get(id); } catch (e) { }
  if (!txt) { toast(t('docs.toast.missing')); return false; }
  let p; try { p = SWProject.parse(txt); } catch (e) { toast(t('docs.toast.broken')); return false; }
  curDocId = id; docIndexSave(); docApply(p);
  toast(t('docs.toast.opened', { name: docName() }));
  return true;
}
/* a new, empty document (the open one stays on the shelf) */
async function docNew() {
  if (plotting) return;
  await docSaveNow();
  curDocId = null; docIndexSave();
  docApply({ items: [], layerMeta: {}, doc: SWPens.defaultDoc(), page: null });
  toast(t('docs.toast.new'));
}
function docRename(id, name) {
  const m = docMeta(id); name = String(name || '').trim().slice(0, 80); if (!m || !name) return;
  m.name = name; docIndexSave(); if (id === curDocId) docSaveNow();
}
async function docDuplicate(id) {
  if (id === curDocId) await docSaveNow();
  const src = docMeta(id); let txt = null; try { txt = await docStore.get(id); } catch (e) { }
  if (!src || !txt) return null;
  const nid = 'd' + SW.uid(), m = Object.assign({}, src, { id: nid, name: t('docs.copyName', { name: src.name }), savedAt: Date.now() });
  await docStore.put(nid, txt); docIndex.unshift(m); docIndexSave(); return m;
}
/* delete for good (the dialog asks first); deleting the open document starts a new one */
async function docDelete(id) {
  const m = docMeta(id); if (!m || plotting) return;
  docIndex = docIndex.filter(d => d.id !== id); docStore.del(id).catch(() => { });
  if (id === curDocId) { curDocId = null; docIndexSave(); docApply({ items: [], layerMeta: {}, doc: SWPens.defaultDoc(), page: null }); }
  else docIndexSave();
}

/* ---- project files ---- */
async function projectFileText() {
  const fonts = {};
  for (const id of SWProject.fontIds(items)) { const svg = await fontSrcGet(id); if (svg) fonts[id] = { name: customFonts[id] || id, svg }; }
  return SWProject.serialize(Object.assign(docState(), { name: docName() || t('docs.untitled', { n: 1 }), fonts }));
}
function downloadText(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function projectSave() {
  if (!items.length) { toast(t('docs.toast.empty')); return; }
  await docSaveNow();
  downloadText(SWProject.fileName(docName()), await projectFileText());
  toast(t('docs.toast.fileSaved'));
}
/* open a project file: it becomes a new document on the shelf */
async function projectOpen(text, fileName) {
  if (plotting) return false;
  let p;
  try { p = SWProject.parse(text); }
  catch (e) {
    const msg = e.code === 'NEWER' ? t('docs.err.newer') : e.code === 'NOTPROJECT' ? t('docs.err.notProject') : t('docs.err.notJson');
    showDialog(`<h3>${tHtml('docs.err.title')}</h3><p class="hint">${esc(msg)}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`);
    return false;
  }
  await docSaveNow();
  const name = docUniqueName(p.name || String(fileName || '').replace(/\.stiftwerk(\.json)?$|\.json$/i, '') || docUntitledName());
  curDocId = 'd' + SW.uid(); docIndex.unshift({ id: curDocId, name, savedAt: Date.now(), n: p.items.length });
  docIndexSave(); docApply(p); docSaveNow();
  toast(t('docs.toast.opened', { name }));
  return true;
}
