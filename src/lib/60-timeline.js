/* Motion timeline of a plot: every move the plotter makes (travel, pen down/up, drawing) with its duration,
 * in exactly the order SW.layerLines / startPlot send them. Used for smooth preview playback (scrubbing,
 * "play") and to follow a running plot in real time (status position → place on the timeline).
 * Positions are page mm; times are seconds (moves ×1.15 for acceleration, like SW.jobStats). */
const SWTimeline = ((SW) => {
  const TRAVEL = 0, DRAW = 1, UP = 2, DOWN = 3, PAUSE = 4, ACC = 1.15;
  const key = (g, m) => g * 1e6 + m;
  /* layers: job.plotLayers ({ paths, base }). Each segment carries g = index of the path that is being drawn or
   * comes next (paths < g are complete), and m = points of path g complete at the end of a DRAW segment. */
  function build(layers, S) {
    const A = { ax: [], ay: [], bx: [], by: [], kind: [], dur: [], t0: [], g: [], m: [] };
    // pen timing from the machine profile (Z travel or servo dwell), same as SW.jobStats
    const tUp = SW.penTime(S, 'up'), tDown = SW.penTime(S, 'down') + (S.penDelay || 0) / 1000;
    const vTravel = (S.travelF || 8000) / 60, vDraw = (S.drawF || 2000) / 60;
    let cur = [0, 0], down = false, t = 0;
    const push = (b, kind, dur, g, m) => {
      A.ax.push(cur[0]); A.ay.push(cur[1]); A.bx.push(b[0]); A.by.push(b[1]); A.kind.push(kind); A.dur.push(dur); A.t0.push(t); A.g.push(g); A.m.push(m);
      t += dur; cur = b;
    };
    const len = b => Math.hypot(b[0] - cur[0], b[1] - cur[1]);
    const travel = (b, g) => push(b, TRAVEL, len(b) / vTravel * ACC, g, 0);
    let last = 0;
    layers.forEach((L, li) => {
      const g0 = L.base;
      if (layers.length > 1) {                       // pen change: pen up, park, wait for the user
        if (down) { push(cur, UP, tUp, g0, 0); down = false; }
        if (S.park === 'origin') travel([0, 0], g0);
        push(cur, PAUSE, 0, g0, 0);
      }
      L.paths.forEach((p, pi) => {
        const g = g0 + pi, pts = p.pts; let k0 = 0;
        if (!(p.join && down)) {
          if (down) { push(cur, UP, tUp, g, 0); down = false; }
          travel(pts[0], g);
          push(cur, DOWN, tDown, g, 0); down = true; k0 = 1;
        }
        const mo = p.k0 || 0;                       // a resumed path starts at point k0 of the original
        for (let k = k0; k < pts.length; k++) push(pts[k], DRAW, len(pts[k]) / vDraw * ACC, g, k + 1 + mo);
        if (k0 === 1 && pts.length === 1) push(cur, DRAW, 0.1, g, 1 + mo);   // a dot (G4 P0.1)
        last = g + 1;
      });
      if (down) { push(cur, UP, tUp, last, 0); down = false; }
    });
    travel([0, 0], last);                            // end: back to the origin
    const n = A.t0.length, index = new Map();
    for (let i = 0; i < n; i++) if (A.kind[i] === DRAW) index.set(key(A.g[i], A.m[i]), i);
    return { ...A, n, total: t, index, done: last };
  }
  /* segment index active at time t (binary search) */
  function segAt(tl, t) {
    let lo = 0, hi = tl.n - 1;
    if (hi < 0) return -1;
    if (t >= tl.total) return hi;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tl.t0[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /* state at time t: { i, f, pos, down, kind, g, k (complete points of path g), tip (pen position while drawing) } */
  function at(tl, t) {
    if (!tl.n) return null;
    if (t >= tl.total) return { i: tl.n - 1, f: 1, pos: [0, 0], down: false, kind: TRAVEL, g: tl.done, k: 0, tip: null, end: true };
    const i = segAt(tl, Math.max(0, t)), d = tl.dur[i], f = d > 0 ? Math.min(1, Math.max(0, (t - tl.t0[i]) / d)) : 1;
    const pos = [tl.ax[i] + (tl.bx[i] - tl.ax[i]) * f, tl.ay[i] + (tl.by[i] - tl.ay[i]) * f], kind = tl.kind[i];
    const draw = kind === DRAW;
    return { i, f, pos, kind, g: tl.g[i], k: draw ? Math.max(0, tl.m[i] - 1) : 0, tip: draw ? pos : null, down: draw };
  }
  const timeOf = (tl, i, f) => tl.t0[i] + tl.dur[i] * f;
  /* the place on the timeline (searching segments i0..i1) that best explains a measured pen position.
   * down: measured pen state (true/false/null) – segments of the other kind are penalised. → { i, f, d } */
  function locate(tl, x, y, i0, i1, down) {
    let best = null;
    for (let i = Math.max(0, i0); i <= Math.min(tl.n - 1, i1); i++) {
      const ax = tl.ax[i], ay = tl.ay[i], dx = tl.bx[i] - ax, dy = tl.by[i] - ay, l2 = dx * dx + dy * dy;
      const f = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      let d = Math.hypot(ax + dx * f - x, ay + dy * f - y);
      if (down != null) { const segDown = tl.kind[i] === DRAW; if (segDown !== down && tl.kind[i] !== UP && tl.kind[i] !== DOWN) d += 2; }
      if (!best || d < best.d - 0.05) best = { i, f, d };
    }
    return best;
  }
  /* segment index of an acknowledged G-code line (path g, point count m), or -1 */
  const indexOf = (tl, g, m) => { const i = tl.index.get(key(g, m)); return i == null ? -1 : i; };
  return { TRAVEL, DRAW, UP, DOWN, PAUSE, build, segAt, at, timeOf, locate, indexOf };
})(typeof module !== 'undefined' ? require('../core.js') : SW);
if (typeof module !== 'undefined') module.exports = SWTimeline;
