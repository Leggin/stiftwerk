/* ---------------- colours & pens ---------------- */
function cssToHex(v, op) {
  if (!v || v === 'none' || v === 'transparent') return null;
  if (op !== undefined && parseFloat(op) === 0) return null;
  if (v.startsWith('url')) return '#000000';
  const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '#000000';
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
  if (p.length > 3 && p[3] === 0) return null;
  return '#' + p.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
/* a design colour (stroke/fill hex, or 'L:<name>' for Inkscape layers). name null = automatic (shown as the colour's
 * name in the current language). The pen is assigned in rebuild() (SWPens.assignNew). */
function ensureLayer(key, color, name) {
  if (!layerMeta[key]) {
    const order = Object.values(layerMeta).reduce((m, l) => Math.max(m, l.order || 0), -1) + 1;
    const col = color || (key.startsWith('#') ? key : '#1d2433');
    layerMeta[key] = { name: name || null, color: col, enabled: true, order, pen: null };
  }
  return layerMeta[key];
}
const colorWord = hex => t('color.' + SWColor.nameId(hex));
/* automatic names get a number when two look the same ("Schwarz", "Schwarz 2") */
function numbered(list, colorOf, nameOf) {
  const seen = new Map();
  return list.map(x => { const own = nameOf(x); if (own) return own; const base = colorWord(colorOf(x)); const n = (seen.get(base) || 0) + 1; seen.set(base, n); return n > 1 ? `${base} ${n}` : base; });
}
function colorLabel(key) {
  const keys = Object.keys(layerMeta).sort((a, b) => (layerMeta[a].order || 0) - (layerMeta[b].order || 0));
  return numbered(keys, k => layerMeta[k].color, k => layerMeta[k].name)[keys.indexOf(key)] || key;
}
function penLabel(pen) {
  if (!pen) return '';
  if (pen.id === SWPens.SINGLE || pen === doc.single) return doc.single.name || colorWord(doc.single.color);
  const i = doc.pens.indexOf(pen); if (i < 0) return pen.name || colorWord(pen.color);
  return numbered(doc.pens, p => p.color, p => p.name)[i];
}
const penColorFor = key => SWPens.penColorFor(doc, layerMeta, key);
const layerOn = key => !layerMeta[key] || layerMeta[key].enabled !== false;
