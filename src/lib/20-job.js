/* Job building, pure: items → page-mm paths per colour key → one ordered plot layer per pen.
 * Item geometry (xf, itemAffine, textPolys) lives here too so Node tests can run the exact app pipeline.
 * G-code itself is produced by SW.layerLines / SW.programText (core.js). */
const SWJob = ((SW, SWGeo) => {
  /* item transform: scale, optional mirror (flipX / flipY), rotation by any angle (degrees, clockwise on screen) around
   * the item's centre; (x, y) is the top-left of the rotated bounding box. Exact for 90° steps (same numbers as before). */
  function itemFrame(it) {
    const s = it.scale, W = it.src.w * s, H = it.src.h * s, r = (((it.rot || 0) % 360) + 360) % 360, a = r * Math.PI / 180;
    const c = r === 0 ? 1 : r === 180 ? -1 : r === 90 || r === 270 ? 0 : Math.cos(a);
    const sn = r === 90 ? 1 : r === 270 ? -1 : r === 0 || r === 180 ? 0 : Math.sin(a);
    return { s, W, H, c, sn, BW: Math.abs(W * c) + Math.abs(H * sn), BH: Math.abs(W * sn) + Math.abs(H * c) };
  }
  /* affine [a b c d e f] (x' = a·x + c·y + e, y' = b·x + d·y + f): item-local mm → page mm */
  function itemAffine(it) {
    const { s, W, H, c, sn, BW, BH } = itemFrame(it), fx = it.flipX ? -1 : 1, fy = it.flipY ? -1 : 1;
    const tx = (fx < 0 ? W : 0) - W / 2, ty = (fy < 0 ? H : 0) - H / 2;
    return [c * fx * s, sn * fx * s, -sn * fy * s, c * fy * s, c * tx - sn * ty + BW / 2 + it.x, sn * tx + c * ty + BH / 2 + it.y];
  }
  function xf(it, q) { const A = itemAffine(it); return [A[0] * q[0] + A[2] * q[1] + A[4], A[1] * q[0] + A[3] * q[1] + A[5]]; }
  /* an SVG <text> run → stroke polylines in item coordinates (mm), with a given plotter font.
   * adj (optional) = { k, ax, ay, dx, dy }: scale by k around (ax, ay) in run units, then shift by (dx, dy) item mm.
   * look (optional) = { bold, italic }: italic slants 12°, bold draws every stroke a second time, shifted by 6 % of the cap height */
  const ITALIC = 12, BOLD = 0.06;
  function textPolys(t, font, adj, look) {
    const capH = t.fs * 0.7, extra = t.ls / (capH / 10), w = SW.textWidth(t.str, capH, extra, font);
    const dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0, M = t.M;
    const k = adj ? adj.k : 1, ax = adj ? adj.ax : 0, ay = adj ? adj.ay : 0, ox = adj ? adj.dx : 0, oy = adj ? adj.dy : 0;
    const map = sh => g => g.map(([px, py]) => {
      let x = t.x + dx + px + sh, y = t.y - capH + py;
      if (adj) { x = ax + (x - ax) * k; y = ay + (y - ay) * k; }
      return [M[0] * x + M[2] * y + M[4] + ox, M[1] * x + M[3] * y + M[5] + oy];
    });
    const strokes = SW.renderText(t.str, capH, 1.7, 'left', look && look.italic ? ITALIC : 0, extra, font);
    const out = strokes.map(map(0));
    if (look && look.bold) for (const g of strokes) out.push(map(capH * BOLD)(g.slice().reverse()));
    return out;
  }

  /* an item's own stroke polylines in item mm: src.paths + plotted text (textFor(it) → {polys, unconverted}); with
   * it.occlude, parts covered by filled shapes painted later (src.occ, z = paint order) are removed. Cached per item. */
  const polyCache = new WeakMap();
  function itemPolys(it, textFor) {
    const tx = it.src.texts && it.src.texts.length && textFor ? textFor(it) : null;
    const occ = it.occlude && it.src.occ && it.src.occ.length ? it.src.occ : null;
    if (!occ) return { polys: tx && tx.polys.length ? it.src.paths.concat(tx.polys) : it.src.paths, unconverted: tx ? tx.unconverted || 0 : 0 };
    const c = polyCache.get(it);
    if (c && c.src === it.src && c.tx === tx) return c.res;
    const res = { polys: SWGeo.occlude(tx && tx.polys.length ? it.src.paths.concat(tx.polys) : it.src.paths, occ), unconverted: tx ? tx.unconverted || 0 : 0 };
    polyCache.set(it, { src: it.src, tx, res }); return res;
  }

  /* visible items → page-mm polylines grouped by colour key (clipped to the sheet). textFor(it) → {polys:[{layer, pts}], unconverted:n}
   * returns { by: Map(key → [pts]), clipped, unconverted } */
  function collect(items, page, textFor) {
    const by = new Map(); let clipped = 0, unconverted = 0;
    const add = (k, p) => { if (!by.has(k)) by.set(k, []); by.get(k).push(p); };
    for (const it of items) {
      if (!it.visible) continue;
      const { polys: own, unconverted: un } = itemPolys(it, textFor); unconverted += un;
      for (const p of own) { const r = SW.clipPoly(p.pts.map(q => xf(it, q)), page.w, page.h); if (r.clipped) clipped++; r.parts.forEach(x => add(p.layer, x)); }
      if (it.hatch && it.hatch.on) for (const f of it.src.fills) {
        const rings = f.rings.map(r => r.map(q => xf(it, q)));
        for (const seg of SW.hatch(rings, it.hatch.spacing, it.hatch.angle)) SW.clipPoly(seg, page.w, page.h).parts.forEach(x => add(f.layer, x));
      }
    }
    return { by, clipped, unconverted };
  }

  /* plan = SWPens.plan(...) → { groups:[{id, name, color, keys}], ghosts:[{key, name, color}] } */
  function buildJob(collected, plan, S) {
    const opt = start => ({ optimize: S.optimize, reverse: S.reverse, joinTol: S.joinTol, start });
    const gather = keys => { const out = []; for (const k of keys) if (collected.by.has(k)) out.push(...collected.by.get(k)); return out; };
    const layers = []; let start = [0, 0];
    for (const g of plan.groups) {
      const raw = gather(g.keys); if (!raw.length) continue;
      const paths = SW.order(SW.clean(raw, S.simplify), opt(start));
      if (!paths.length) continue;
      layers.push({ key: g.id, pen: g.id, name: g.name, color: g.color, keys: g.keys.filter(k => collected.by.has(k)), enabled: true, single: !!g.single, paths });
      start = paths[paths.length - 1].pts.slice(-1)[0];
    }
    for (const gh of plan.ghosts) {
      const raw = gather([gh.key]); if (!raw.length) continue;
      const paths = SW.order(SW.clean(raw, S.simplify), opt(start));
      if (paths.length) layers.push({ key: 'ghost:' + gh.key, ghost: true, name: gh.name, color: gh.color, keys: [gh.key], enabled: false, paths });
    }
    const plotLayers = layers.filter(l => l.enabled);
    const job = { layers, plotLayers, clipped: collected.clipped, unconverted: collected.unconverted, stats: SW.jobStats(plotLayers, S) };
    let g = 0; for (const L of layers) { L.base = g; g += L.paths.length; }
    job.total = g;
    // per-path cumulative drawn length (for the scrub slider)
    const cum = []; let acc = 0; for (const L of layers) for (const p of L.paths) { cum.push(acc); if (L.enabled) acc += SW.polyLen(p.pts) + 0.5; }
    cum.push(acc); job.cum = cum; job.cumTotal = acc;
    return job;
  }
  /* resume: the plot layers from path g (global index), starting at point k of that path. The first path gets
   * k0 = k (point numbers in G-code marks and the timeline stay those of the whole path) and never joins the one before. */
  function resumeLayers(layers, g, k) {
    const out = [];
    for (const L of layers) {
      const n = L.paths.length;
      if (g >= L.base + n) continue;
      if (g <= L.base) { out.push(L); continue; }
      const i = g - L.base, p = L.paths[i], k0 = Math.max(0, Math.min(k, p.pts.length - 2));
      const first = Object.assign({}, p, { pts: p.pts.slice(k0), join: false, k0 });
      out.push(Object.assign({}, L, { base: g, paths: [first, ...L.paths.slice(i + 1)] }));
    }
    return out;
  }
  /* page-mm box around every point the plot draws (frame trace) → { x0, y0, x1, y1 } or null */
  function frameBox(layers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const L of layers) for (const p of L.paths) for (const q of p.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    return x0 <= x1 ? { x0, y0, x1, y1 } : null;
  }
  /* metres of line per colour key (weights for pen grouping, pen list stats) */
  function lengths(collected) { const m = new Map(); for (const [k, ps] of collected.by) m.set(k, ps.reduce((s, p) => s + SW.polyLen(p), 0)); return m; }
  return { xf, itemAffine, itemFrame, textPolys, itemPolys, collect, buildJob, lengths, resumeLayers, frameBox };
})(typeof module !== 'undefined' ? require('../core.js') : SW, typeof module !== 'undefined' ? require('./15-geo.js') : SWGeo);
if (typeof module !== 'undefined') module.exports = SWJob;
