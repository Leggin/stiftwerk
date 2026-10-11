/* ---------------- items ---------------- */
/* item geometry is shared with the job pipeline (lib/20-job.js) */
const { xf, itemAffine, textPolys } = SWJob;
function normalise(paths, fills, texts = [], occ = []) {
  const all = paths.map(p => p.pts).concat(...fills.map(f => f.rings));
  for (const t of texts) all.push(...textPolys(t, SW.BUILTIN));
  const b = SW.bbox(all);
  const sh = q => [q[0] - b.x, q[1] - b.y];
  const src = { paths: paths.map(p => Object.assign({ layer: p.layer, pts: p.pts.map(sh) }, p.z != null ? { z: p.z } : null)), fills: fills.map(f => ({ layer: f.layer, rings: f.rings.map(r => r.map(sh)) })), w: b.w, h: b.h };
  if (texts.length) src.texts = texts.map(t => ({ ...t, M: [t.M[0], t.M[1], t.M[2], t.M[3], t.M[4] - b.x, t.M[5] - b.y] }));
  // filled shapes that hide what lies beneath them (hidden-line removal), z = paint order
  if (occ.length) src.occ = occ.map(o => ({ z: o.z, rings: o.rings.map(r => r.map(sh)) }));
  return { src, x: b.x, y: b.y };
}
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

