/* ---------------- document state ---------------- */
const FORMATS = { A6: [105, 148, 'DIN A6'], A5: [148, 210, 'DIN A5'], A4: [210, 297, 'DIN A4'], A3: [297, 420, 'DIN A3'], A2: [420, 594, 'DIN A2'], A1: [594, 841, 'DIN A1'],
  C6: [114, 162, 'Kuvert C6'], DL: [110, 220, 'Kuvert DL'], LTR: [215.9, 279.4, 'US Letter'], LEG: [215.9, 355.6, 'US Legal'], TAB: [279.4, 431.8, 'US Tabloid'] };
let page = Object.assign({ fmt: 'A4', orient: 'portrait', w: 210, h: 297, cw: 210, ch: 297, margin: 10 }, store.get('page', {}));
function pageDims() {
  let w, h;
  if (page.fmt === 'custom') { w = page.cw; h = page.ch; }
  else if (page.fmt === 'machine') { [w, h] = workArea(); page.w = w; page.h = h; return; }   // the whole work area, as it lies
  else [w, h] = FORMATS[page.fmt] || FORMATS.A4;
  if (page.orient === 'landscape') [w, h] = [Math.max(w, h), Math.min(w, h)]; else [w, h] = [Math.min(w, h), Math.max(w, h)];
  page.w = w; page.h = h;
}
pageDims();
/* items: plain JSON objects (see docs/contract.md); src is replaced, never mutated. layerMeta: design colours.
 * doc: pens and pen mode (lib/10-pens.js). */
let items = [];
let layerMeta = {};
let doc = SWPens.defaultDoc();
let selId = null;
let saveTimer = 0, saveUser = false, saveWarned = false;
/* save (debounced) and record an undo step. meta.sys = change not made by the user (font loaded, migration) */
function persist(meta) {
  if (!(meta && meta.sys)) saveUser = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPersist, 400);
}
function flushPersist() {
  clearTimeout(saveTimer); saveTimer = 0;
  store.set('page', page); store.set('layers', layerMeta); store.set('doc', doc);
  try { localStorage.setItem('stiftwerk:items', JSON.stringify(items)); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast(t('state.toast.saveFailed')); } }
  historyCommit(saveUser); saveUser = false;
}
/* load + migrate (v1 → v2). The first migration keeps a copy of the old data under *.v1 */
function loadState() {
  let raw = null; try { raw = localStorage.getItem('stiftwerk:items'); } catch (e) { }
  let parsed = null; try { parsed = JSON.parse(raw || 'null'); } catch (e) { }
  const storedDoc = store.get('doc', null), storedLayers = store.get('layers', {});
  if (!storedDoc && raw && raw.length < 1.5e6) { try { localStorage.setItem('stiftwerk:items.v1', raw); localStorage.setItem('stiftwerk:layers.v1', JSON.stringify(storedLayers)); } catch (e) { } }
  const st = SWMigrate.migrate({ items: Array.isArray(parsed) ? parsed : [], layerMeta: storedLayers, doc: storedDoc });
  items = st.items; layerMeta = st.layerMeta; doc = st.doc;
}
