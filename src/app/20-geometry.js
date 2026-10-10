/* ---------------- items ---------------- */
function normalise(paths, fills, texts = []) {
  const all = paths.map(p => p.pts).concat(...fills.map(f => f.rings));
  for (const t of texts) all.push(...textPolys(t, SW.BUILTIN));
  const b = SW.bbox(all);
  const sh = q => [q[0] - b.x, q[1] - b.y];
  const src = { paths: paths.map(p => ({ layer: p.layer, pts: p.pts.map(sh) })), fills: fills.map(f => ({ layer: f.layer, rings: f.rings.map(r => r.map(sh)) })), w: b.w, h: b.h };
  if (texts.length) src.texts = texts.map(t => ({ ...t, M: [t.M[0], t.M[1], t.M[2], t.M[3], t.M[4] - b.x, t.M[5] - b.y] }));
  return { src, x: b.x, y: b.y };
}
/* an SVG <text> run → stroke polylines in item coordinates (mm), with a given plotter font */
function textPolys(t, font) {
  const capH = t.fs * 0.7, extra = t.ls / (capH / 10), w = SW.textWidth(t.str, capH, extra, font);
  const dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0, M = t.M;
  return SW.renderText(t.str, capH, 1.7, 'left', 0, extra, font).map(g => g.map(([px, py]) => { const x = t.x + dx + px, y = t.y - capH + py; return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }));
}
const tgCache = new WeakMap();
function textGeom(it) {
  const f = fontFor(it.font), key = f.id || 'builtin', c = tgCache.get(it);
  if (c && c.key === key && c.src === it.src) return c.polys;
  const polys = []; for (const t of it.src.texts) for (const p of textPolys(t, f)) polys.push({ layer: t.layer, pts: p });
  tgCache.set(it, { key, src: it.src, polys }); return polys;
}
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function itemAffine(it) {
  const s = it.scale, W = it.src.w * s, H = it.src.h * s, X = it.x, Y = it.y;
  switch (it.rot) { case 90: return [0, s, -s, 0, H + X, Y]; case 180: return [-s, 0, 0, -s, W + X, H + Y]; case 270: return [0, -s, s, 0, X, W + Y]; default: return [s, 0, 0, s, X, Y]; }
}

