/* Persisted-state migration (idempotent). v1 = the original app: per-object text mode/font, one pen per colour,
 * German auto-names stored as data. v2 = doc with pens, per-<text>-element textStyle, auto-names as null. */
const SWMigrate = ((C, P) => {
  const AUTO_NAME = new RegExp('^(' + Object.keys(C.LEGACY_DE).join('|') + ')( \\d+)?$');
  const SAMPLE_KEYS = { 'Beispiel: Bergsee': 'sample.lake', 'Beispiel: Überschrift': 'sample.title', 'Beispiel: Fußzeile': 'sample.footer' };
  /* every colour key referenced by item geometry */
  function usedKeys(items) {
    const s = new Set();
    for (const it of items || []) {
      if (!it || !it.src) continue;
      for (const p of it.src.paths || []) s.add(p.layer);
      for (const f of it.src.fills || []) s.add(f.layer);
      for (const t of it.src.texts || []) s.add(t.layer);
    }
    return s;
  }
  function migrateItem(it) {
    if (!it || !it.src) return it;
    if (it.type === 'svg') {
      const texts = it.src.texts || [];
      if (texts.length && !it.textStyle) {
        // legacy runs carry no element index: each run becomes its own element (never wrongly merged)
        if (texts.some(t => t.el == null)) it.src = Object.assign({}, it.src, { texts: texts.map((t, i) => t.el == null ? Object.assign({}, t, { el: i }) : t) });
        const mode = it.textMode === 'plot' ? 'plot' : 'svg', font = it.font || 'builtin', ts = {};
        for (const t of it.src.texts) if (!ts[t.el]) ts[t.el] = { mode, font };
        it.textStyle = ts;
      }
      delete it.textMode; delete it.font;
    }
    if (!it.nameKey && SAMPLE_KEYS[it.name]) { it.sample = true; it.nameKey = SAMPLE_KEYS[it.name]; }
    return it;
  }
  /* state = { items, layerMeta, doc } (objects are modified in place and returned) */
  function migrate(state) {
    const items = Array.isArray(state.items) ? state.items.filter(it => it && it.src && Array.isArray(it.src.paths)) : [];
    const layerMeta = state.layerMeta && typeof state.layerMeta === 'object' ? state.layerMeta : {};
    let doc = state.doc;
    for (const it of items) migrateItem(it);
    if (!doc || doc.v !== 2) {
      doc = P.defaultDoc();
      doc.penMode = items.length ? 'multi' : 'single';   // keep the old behaviour for existing documents
      const used = usedKeys(items);
      for (const k of Object.keys(layerMeta)) if (!used.has(k)) delete layerMeta[k];
      const keys = Object.keys(layerMeta).sort((a, b) => (layerMeta[a].order || 0) - (layerMeta[b].order || 0));
      for (const k of keys) {
        const m = layerMeta[k];
        if (m.name && AUTO_NAME.test(m.name)) m.name = null;
        if (m.enabled == null) m.enabled = true;
        m.pen = P.newPen(doc, m.color, m.name).id;   // one pen per colour, as before (merges are only suggested)
      }
      const firstBlack = keys.map(k => layerMeta[k].color).find(c => C.isInkBlack(c));
      if (firstBlack) doc.single.color = firstBlack;
    } else {
      for (const k of Object.keys(layerMeta)) { const m = layerMeta[k]; if (m.enabled == null) m.enabled = true; if (m.name && AUTO_NAME.test(m.name)) m.name = null; }
      if (!doc.single) doc.single = P.defaultDoc().single;
      if (!Array.isArray(doc.pens)) doc.pens = [];
      if (!doc.nextPen) doc.nextPen = doc.pens.reduce((m, p) => Math.max(m, +String(p.id).replace(/\D/g, '') || 0), 0) + 1;
    }
    return { items, layerMeta, doc };
  }
  return { migrate, migrateItem, usedKeys, AUTO_NAME, SAMPLE_KEYS };
})(typeof module !== 'undefined' ? require('./00-color.js') : SWColor, typeof module !== 'undefined' ? require('./10-pens.js') : SWPens);
if (typeof module !== 'undefined') module.exports = SWMigrate;
