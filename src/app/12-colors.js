/* ---------------- colours & layers ---------------- */
const NAMED = [['Schwarz', [25, 25, 30]], ['Grau', [128, 128, 128]], ['Rot', [215, 45, 40]], ['Orange', [240, 130, 30]], ['Gelb', [235, 205, 40]], ['Grün', [40, 150, 70]], ['Türkis', [30, 165, 170]], ['Blau', [40, 70, 210]], ['Violett', [130, 60, 190]], ['Pink', [230, 80, 160]], ['Braun', [125, 80, 45]], ['Weiß', [245, 245, 245]]];
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function colorName(hex) { const c = hexRgb(hex); let best = NAMED[0][0], bd = Infinity; for (const [n, r] of NAMED) { const d = (c[0] - r[0]) ** 2 * 2 + (c[1] - r[1]) ** 2 * 4 + (c[2] - r[2]) ** 2 * 3; if (d < bd) { bd = d; best = n; } } return best; }
function cssToHex(v, op) {
  if (!v || v === 'none' || v === 'transparent') return null;
  if (op !== undefined && parseFloat(op) === 0) return null;
  if (v.startsWith('url')) return '#000000';
  const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '#000000';
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
  if (p.length > 3 && p[3] === 0) return null;
  return '#' + p.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
function ensureLayer(key, color, name) {
  if (!layerMeta[key]) {
    const order = Object.values(layerMeta).reduce((m, l) => Math.max(m, l.order), -1) + 1;
    const col = color || (key.startsWith('#') ? key : '#1d2433');
    let nm = name || colorName(col); const taken = new Set(Object.values(layerMeta).map(l => l.name));
    if (taken.has(nm)) { let i = 2; while (taken.has(`${nm} ${i}`)) i++; nm = `${nm} ${i}`; }
    layerMeta[key] = { name: nm, color: col, enabled: true, order };
  }
  return layerMeta[key];
}
function usedLayers() {
  const keys = new Set();
  for (const it of items) {
    if (!it.visible) continue; for (const p of it.src.paths) keys.add(p.layer);
    if (it.hatch && it.hatch.on) for (const f of it.src.fills) keys.add(f.layer);
    if (it.textMode === 'plot' && it.src.texts) for (const t of it.src.texts) keys.add(t.layer);
  }
  return [...keys].map(k => ({ key: k, ...ensureLayer(k) })).sort((a, b) => a.order - b.order);
}

