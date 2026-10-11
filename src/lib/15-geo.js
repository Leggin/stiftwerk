/* Polyline ↔ polygon clipping for hidden-line removal (occlusion by filled shapes painted later) and SVG clip paths.
 * A region is a list of rings (closed polylines) filled with the even-odd rule. Pure, Node-tested. */
const SWGeo = (() => {
  const EPS = 1e-9;
  function ringsBox(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1 };
  }
  const boxOverlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  function polyBox(pts) { return ringsBox([pts]); }
  /* even-odd point in region */
  function inside(p, rings) {
    let c = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  /* parameters t ∈ (0,1) where segment p→q crosses the region's edges */
  function cuts(p, q, rings) {
    const out = [], dx = q[0] - p[0], dy = q[1] - p[1];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < EPS) continue;
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den, u = ((a[0] - p[0]) * dy - (a[1] - p[1]) * dx) / den;
      if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) out.push(t);
    }
    return out.sort((x, y) => x - y);
  }
  /* split a polyline by a region; keep the parts inside (keep = 'inside') or outside ('outside') → [pts] */
  function clipPolyline(pts, rings, keep) {
    const want = keep === 'inside', res = []; let cur = null;
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], ts = [0, ...cuts(p, q, rings), 1];
      for (let k = 1; k < ts.length; k++) {
        const a = lerp(p, q, ts[k - 1]), b = lerp(p, q, ts[k]);
        if (inside(lerp(p, q, (ts[k - 1] + ts[k]) / 2), rings) === want) {
          if (!cur) { cur = [a]; res.push(cur); }
          cur.push(b);
        } else cur = null;
      }
    }
    return res.filter(r => r.length > 1 && (r.length > 2 || Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]) > 1e-6));
  }
  /* hidden-line removal: polys [{ pts, z, ...props }] lose every part covered by an occluder { z, rings } painted later
   * (z greater). Returns new polys (props kept). */
  function occlude(polys, occluders) {
    const occ = occluders.map(o => Object.assign({ box: ringsBox(o.rings) }, o));
    const out = [];
    for (const p of polys) {
      let parts = [p.pts]; const pb = polyBox(p.pts);
      for (const o of occ) {
        if (!(o.z > p.z) || !boxOverlap(pb, o.box)) continue;
        const next = []; for (const part of parts) next.push(...clipPolyline(part, o.rings, 'outside'));
        parts = next; if (!parts.length) break;
      }
      for (const part of parts) out.push(Object.assign({}, p, { pts: part }));
    }
    return out;
  }
  /* keep only what lies inside a clip region */
  const clipTo = (polys, rings) => polys.flatMap(p => clipPolyline(p.pts, rings, 'inside').map(pts => Object.assign({}, p, { pts })));
  return { inside, cuts, clipPolyline, occlude, clipTo, ringsBox };
})();
if (typeof module !== 'undefined') module.exports = SWGeo;
