/* ---------------- job ---------------- */
let job = null, jobDirty = true, jobTimer = 0;
function invalidate(now) { jobDirty = true; clearTimeout(jobTimer); if (now) rebuild(); else jobTimer = setTimeout(rebuild, 120); render(); persist(); }
function rebuild() {
  clearTimeout(jobTimer);
  const by = new Map(); let clipped = 0, unconverted = 0;
  const add = (k, p) => { if (!by.has(k)) by.set(k, []); by.get(k).push(p); };
  for (const it of items) {
    if (!it.visible) continue;
    let own = it.src.paths;
    if (it.src.texts && it.src.texts.length) { if (it.textMode === 'plot') own = own.concat(textGeom(it)); else unconverted += it.src.texts.length; }
    for (const p of own) { const r = SW.clipPoly(p.pts.map(q => xf(it, q)), page.w, page.h); if (r.clipped) clipped++; r.parts.forEach(x => add(p.layer, x)); }
    if (it.hatch && it.hatch.on) for (const f of it.src.fills) {
      const rings = f.rings.map(r => r.map(q => xf(it, q)));
      for (const seg of SW.hatch(rings, it.hatch.spacing, it.hatch.angle)) SW.clipPoly(seg, page.w, page.h).parts.forEach(x => add(f.layer, x));
    }
  }
  const layers = []; let start = [0, 0];
  for (const L of usedLayers()) {
    if (!by.has(L.key)) continue;
    const paths = SW.order(SW.clean(by.get(L.key), S.simplify), { optimize: S.optimize, reverse: S.reverse, joinTol: S.joinTol, start });
    if (!paths.length) continue;
    layers.push({ key: L.key, name: L.name, color: L.color, enabled: L.enabled, paths });
    if (L.enabled) start = paths[paths.length - 1].pts.slice(-1)[0];
  }
  const plotLayers = layers.filter(l => l.enabled);
  job = { layers, plotLayers, clipped, unconverted, stats: SW.jobStats(plotLayers, S) };
  let g = 0; for (const L of layers) { L.base = g; g += L.paths.length; }
  job.total = g;
  // per-path cumulative drawn length (for the "Ablauf" slider)
  const cum = []; let acc = 0; for (const L of layers) for (const p of L.paths) { cum.push(acc); if (L.enabled) acc += SW.polyLen(p.pts) + 0.5; }
  cum.push(acc); job.cum = cum; job.cumTotal = acc;
  jobDirty = false;
  render(); renderPens(); renderStats();
}
function getJob() { if (jobDirty || !job) rebuild(); return job; }

