/* Project files (.stiftwerk.json), pure: the whole document in one file – objects, colours, pens, sheet and the
 * custom fonts it uses (their SVG source, so the file opens anywhere).
 * { app: 'stiftwerk', kind: 'project', v: 1, name, savedAt, page, items, layerMeta, doc, fonts: { id: { name, svg } } } */
const SWProject = (() => {
  const V = 1;
  function serialize(state, now) {
    const o = { app: 'stiftwerk', kind: 'project', v: V, name: state.name || '', savedAt: (now || new Date()).toISOString(),
      page: state.page, items: state.items, layerMeta: state.layerMeta, doc: state.doc, fonts: state.fonts || {} };
    return JSON.stringify(o);
  }
  /* → { name, page, items, layerMeta, doc, fonts } or throws Error with .code NOTJSON | NOTPROJECT | NEWER */
  function parse(text) {
    let o; try { o = JSON.parse(text); } catch (e) { throw Object.assign(new Error('not JSON'), { code: 'NOTJSON' }); }
    if (!o || typeof o !== 'object' || o.app !== 'stiftwerk' || o.kind !== 'project' || !Array.isArray(o.items)) throw Object.assign(new Error('not a project'), { code: 'NOTPROJECT' });
    if (+o.v > V) throw Object.assign(new Error('newer version'), { code: 'NEWER' });
    const fonts = {};
    if (o.fonts && typeof o.fonts === 'object') for (const [id, f] of Object.entries(o.fonts)) if (/^custom:/.test(id) && f && typeof f.svg === 'string') fonts[id] = { name: String(f.name || id).slice(0, 80), svg: f.svg };
    const page = o.page && typeof o.page === 'object' ? o.page : null;
    return { name: String(o.name || '').slice(0, 80), page, items: o.items, layerMeta: o.layerMeta && typeof o.layerMeta === 'object' ? o.layerMeta : {}, doc: o.doc || null, fonts };
  }
  /* custom font ids an item list uses (SVG items' textStyle, text items) */
  function fontIds(items) {
    const s = new Set();
    for (const it of items || []) {
      if (it.type === 'text' && it.font) s.add(it.font);
      for (const k in it.textStyle || {}) if (it.textStyle[k].font) s.add(it.textStyle[k].font);
      if (it.gen && it.gen.font) s.add(it.gen.font);
    }
    return [...s].filter(id => /^custom:/.test(id));
  }
  /* file name for a project name */
  const fileName = name => (String(name || '').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '-') || 'stiftwerk') + '.stiftwerk.json';
  const isProjectName = n => /\.stiftwerk(\.json)?$/i.test(n) || /\.json$/i.test(n);
  return { V, serialize, parse, fontIds, fileName, isProjectName };
})();
if (typeof module !== 'undefined') module.exports = SWProject;
