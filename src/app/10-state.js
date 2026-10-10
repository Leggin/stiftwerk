/* ---------------- document state ---------------- */
const FORMATS = { A4: [210, 297, 'DIN A4'], A5: [148, 210, 'DIN A5'], A6: [105, 148, 'DIN A6'], C6: [114, 162, 'Kuvert C6'], DL: [110, 220, 'Kuvert DL'], LTR: [215.9, 279.4, 'US Letter'], A3: [297, 420, 'DIN A3'] };
let page = Object.assign({ fmt: 'A4', orient: 'portrait', w: 210, h: 297, cw: 210, ch: 297, margin: 10 }, store.get('page', {}));
function pageDims() {
  let w, h; if (page.fmt === 'custom') { w = page.cw; h = page.ch; } else { [w, h] = FORMATS[page.fmt]; }
  if (page.orient === 'landscape') [w, h] = [Math.max(w, h), Math.min(w, h)]; else [w, h] = [Math.min(w, h), Math.max(w, h)];
  page.w = w; page.h = h;
}
pageDims();
let items = [];
let layerMeta = store.get('layers', {});
let selId = null;
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.set('page', page); store.set('layers', layerMeta); try { localStorage.setItem('stiftwerk:items', JSON.stringify(items)); } catch (e) { } }, 400);
}

