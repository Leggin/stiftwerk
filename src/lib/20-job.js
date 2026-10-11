/* Job building, pure: items → page-mm paths per colour key → one ordered plot layer per pen.
 * Item geometry (xf, itemAffine, textPolys) lives here too so Node tests can run the exact app pipeline.
 * G-code itself is produced by SW.layerLines / SW.programText (core.js). */
const SWJob = ((SW) => {
  /* item-local mm → page mm (scale, 90° rotations, position) */
  function xf(it, q) {
    const s = it.scale, u = q[0] * s, v = q[1] * s, W = it.src.w * s, H = it.src.h * s;
    let a, b;
    switch (it.rot) { case 90: a = H - v; b = u; break; case 180: a = W - u; b = H - v; break; case 270: a = v; b = W - u; break; default: a = u; b = v; }
    return [a + it.x, b + it.y];
  }
  function itemAffine(it) {
    const s = it.scale, W = it.src.w * s, H = it.src.h * s, X = it.x, Y = it.y;
    switch (it.rot) { case 90: return [0, s, -s, 0, H + X, Y]; case 180: return [-s, 0, 0, -s, W + X, H + Y]; case 270: return [0, -s, s, 0, X, W + Y]; default: return [s, 0, 0, s, X, Y]; }
  }
  /* an SVG <text> run → stroke polylines in item coordinates (mm), with a given plotter font.
   * adj (optional) = { k, ax, ay, dx, dy }: scale by k around (ax, ay) in run units, then shift by (dx, dy) item mm */
  function textPolys(t, font, adj) {
    const capH = t.fs * 0.7, extra = t.ls / (capH / 10), w = SW.textWidth(t.str, capH, extra, font);
    const dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0, M = t.M;
    const k = adj ? adj.k : 1, ax = adj ? adj.ax : 0, ay = adj ? adj.ay : 0, ox = adj ? adj.dx : 0, oy = adj ? adj.dy : 0;
    return SW.renderText(t.str, capH, 1.7, 'left', 0, extra, font).map(g => g.map(([px, py]) => {
      let x = t.x + dx + px, y = t.y - capH + py;
      if (adj) { x = ax + (x - ax) * k; y = ay + (y - ay) * k; }
      return [M[0] * x + M[2] * y + M[4] + ox, M[1] * x + M[3] * y + M[5] + oy];
    }));
  }

  /* visible items → page-mm polylines grouped by colour key (clipped to the sheet). textFor(it) → {polys:[{layer, pts}], unconverted:n}
   * returns { by: Map(key → [pts]), clipped, unconverted } */
  function collect(items, page, textFor) {
    const by = new Map(); let clipped = 0, unconverted = 0;
    const add = (k, p) => { if (!by.has(k)) by.set(k, []); by.get(k).push(p); };
    for (const it of items) {
      if (!it.visible) continue;
      let own = it.src.paths;
      if (it.src.texts && it.src.texts.length && textFor) { const tx = textFor(it); if (tx.polys.length) own = own.concat(tx.polys); unconverted += tx.unconverted || 0; }
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
  /* metres of line per colour key (weights for pen grouping, pen list stats) */
  function lengths(collected) { const m = new Map(); for (const [k, ps] of collected.by) m.set(k, ps.reduce((s, p) => s + SW.polyLen(p), 0)); return m; }
  return { xf, itemAffine, textPolys, collect, buildJob, lengths };
})(typeof module !== 'undefined' ? require('../core.js') : SW);
if (typeof module !== 'undefined') module.exports = SWJob;
