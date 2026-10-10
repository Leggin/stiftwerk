/* ---------------- items ---------------- */
/* item geometry is shared with the job pipeline (lib/20-job.js) */
const { xf, itemAffine, textPolys } = SWJob;
function normalise(paths, fills, texts = []) {
  const all = paths.map(p => p.pts).concat(...fills.map(f => f.rings));
  for (const t of texts) all.push(...textPolys(t, SW.BUILTIN));
  const b = SW.bbox(all);
  const sh = q => [q[0] - b.x, q[1] - b.y];
  const src = { paths: paths.map(p => ({ layer: p.layer, pts: p.pts.map(sh) })), fills: fills.map(f => ({ layer: f.layer, rings: f.rings.map(r => r.map(sh)) })), w: b.w, h: b.h };
  if (texts.length) src.texts = texts.map(t => ({ ...t, M: [t.M[0], t.M[1], t.M[2], t.M[3], t.M[4] - b.x, t.M[5] - b.y] }));
  return { src, x: b.x, y: b.y };
}
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

