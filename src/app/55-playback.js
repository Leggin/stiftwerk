/* ---------------- playback: smooth preview and live plot view ----------------
 * The motion timeline (lib/60-timeline.js) knows where the pen is at every moment of the plot. The canvas draws
 * everything up to the playhead, including the part of the line that is being drawn right now:
 *  - scrubbing the "Ablauf" slider or playing the preview (pbPlay) moves the playhead through the timeline;
 *  - while plotting, the playhead follows the real pen: GRBL status positions are placed on the timeline and
 *    interpolated between two reports (never ahead of what GRBL has acknowledged).
 * API: pbCut() for drawing, pbPen() marker, pbScrub(frac), pbPlay(), pbPause(), pbToggle(), pbSetSpeed(x),
 *      pbStatus() → { playing, speed, t, total, frac }, pbLiveInfo() → current path / kind / progress. Event 'playback'. */
const PB_SPEEDS = [1, 5, 20, 100];
const pb = { tl: null, key: '', t: null, playing: false, speed: 20, raf: 0, last: 0, live: null, lastDraw: 0 };
function pbTimeline() {
  const j = getJob(), key = [S.drawF, S.travelF, S.zUpF, S.zDownF, S.penDelay, S.penUp, S.penDown, S.park, S.penType, S.penDwell].join();
  if (pb.tlJob !== j || pb.key !== key) { pb.tl = SWTimeline.build(j.plotLayers, S); pb.tlJob = j; pb.key = key; }
  return pb.tl;
}
/* playhead time: live plot > preview playhead > null (= show everything) */
function pbTime() {
  if (plotting && pb.live) return pbLiveNow();
  return pb.t;
}
/* what to draw: { pi (current path), k (complete points), tip (pen while drawing), pos, down, kind } or null */
function pbCut() {
  const t = pbTime(); if (t == null || !job) return null;
  const tl = pbTimeline(); if (!tl.n) return null;
  const s = SWTimeline.at(tl, t); return s && { pi: s.g, k: s.k, tip: s.tip, pos: s.pos, down: s.down, kind: s.kind };
}
/* pen marker while previewing or plotting: { pos, down } (live: interpolated real pen) */
function pbPen() { const c = pbCut(); return c && (plotting || pb.t != null) ? { pos: c.pos, down: c.down } : null; }
function pbStatus() { const tl = job ? pbTimeline() : pb.tl, total = tl ? tl.total : 0, t = pbTime(); return { playing: pb.playing, speed: pb.speed, t: t == null ? total : t, total, frac: total ? Math.min(1, (t == null ? total : t) / total) : 1 }; }
const pbEmit = () => SWUI.emit('playback', pbStatus());

/* ---- preview: scrub / play ---- */
function pbScrub(frac) {
  pbPause(true);
  const tl = pbTimeline(); pb.t = frac >= 1 ? null : Math.max(0, frac) * tl.total;
  render(); pbEmit();
}
function pbFrame(now) {
  pb.raf = 0; if (!pb.playing) return;
  const tl = pbTimeline(), dt = Math.min(0.1, (now - pb.last) / 1000); pb.last = now;
  pb.t = (pb.t || 0) + dt * pb.speed;
  if (pb.t >= tl.total) { pb.t = null; pb.playing = false; }
  render(); pbEmit();
  if (pb.playing) pb.raf = requestAnimationFrame(pbFrame);
}
function pbPlay() {
  if (plotting) return;
  const tl = pbTimeline(); if (!tl.n) return;
  if (pb.t == null || pb.t >= tl.total) pb.t = 0;
  pb.playing = true; pb.last = performance.now();
  if (!pb.raf) pb.raf = requestAnimationFrame(pbFrame);
  pbEmit();
}
function pbPause(silent) { pb.playing = false; if (pb.raf) cancelAnimationFrame(pb.raf); pb.raf = 0; if (!silent) pbEmit(); }
function pbToggle() { if (pb.playing) pbPause(); else pbPlay(); }
function pbStop() { pbPause(true); pb.t = null; render(); pbEmit(); }
function pbSetSpeed(x) { pb.speed = x; pbEmit(); }

/* ---- live: follow the real pen during a plot ---- */
function pbLiveBound(tl) {
  // the last drawing line GRBL acknowledged (+ the travel / pen moves right after it): the pen can't be further
  let i = progress ? SWTimeline.indexOf(tl, progress.pi, progress.k) : -1;
  if (i < 0) i = pb.live ? pb.live.i : 0;
  let j = i + 1; while (j < tl.n - 1 && tl.kind[j] !== SWTimeline.DRAW) j++;
  return { i: j, t: tl.t0[j] + tl.dur[j] };
}
function pbLiveStatus() {
  const L = pb.live; if (!plotting || !L || !serial.pos) return;
  const tl = pb.tl, [x, y] = serial.pos.page, now = performance.now(), b = pbLiveBound(tl);
  const st = String(serial.state || '').split(':')[0];
  if (/Hold|Door/.test(st) || plotState.paused) { L.rate = 0; L.at = now; L.tS = L.disp; return; }
  const loc = SWTimeline.locate(tl, x, y, L.i, Math.min(tl.n - 1, Math.max(b.i, L.i) + 2, L.i + 800), isZPen() ? penDown : null);
  if (!loc || loc.d > 4) return;                       // position doesn't fit (yet) – keep the estimate
  const tS = SWTimeline.timeOf(tl, loc.i, loc.f);
  if (tS + 0.05 < L.tS) return;                        // never backwards
  const dtReal = (now - L.at) / 1000;
  if (dtReal > 0.05) { const r = Math.min(3, Math.max(0, (tS - L.tS) / dtReal)); L.rate = L.rate * 0.5 + r * 0.5; }
  if (st === 'Idle' && L.rate < 0.05) L.rate = 0;
  L.i = loc.i; L.tS = tS; L.at = now;
}
/* displayed live time: last report + extrapolation, never ahead of GRBL, never backwards (computed on demand,
 * so progress stays right even while the animation loop is paused in a background tab) */
function pbLiveNow() {
  const L = pb.live; if (!L || !pb.tl) return 0;
  let d = L.tS + (performance.now() - L.at) / 1000 * (L.rate || 0);
  d = Math.min(d, pbLiveBound(pb.tl).t, L.tS + 1.5);
  if (d > L.disp) L.disp = d;
  return L.disp;
}
function pbLiveFrame(now) {
  pb.raf = 0; const L = pb.live; if (!plotting || !L) return;
  const before = L.disp; pbLiveNow();
  if (L.disp > before && now - pb.lastDraw > 40) { pb.lastDraw = now; render(); SWUI.emit('plot', 'tick'); }
  pb.raf = requestAnimationFrame(pbLiveFrame);
}
SWUI.on('plot', ph => {
  if (ph === 'start') {
    pbPause(true); pb.t = null;
    const tl = pbTimeline(); pb.live = { i: 0, tS: 0, at: performance.now(), rate: 1, disp: 0 };
    if (tl.n && !pb.raf) pb.raf = requestAnimationFrame(pbLiveFrame);
  }
  if (ph === 'done' || ph === 'abort') { pb.live = null; if (pb.raf) cancelAnimationFrame(pb.raf); pb.raf = 0; render(); }
});
SWUI.on('state', pbLiveStatus);
SWUI.on('job', () => { if (!plotting && pb.t != null) { pbPause(true); pb.t = null; pbEmit(); } });
/* "Zeichnet Linie 12 von 340" – for the plot step while plotting (or the preview while playing) */
function pbLiveInfo() {
  const c = pbCut(); if (!c || !pb.tl) return null;
  const n = job.plotLayers.reduce((a, L) => a + L.paths.length, 0), st = pbStatus();
  const kind = c.kind === SWTimeline.DRAW ? 'draw' : c.kind === SWTimeline.TRAVEL ? 'travel' : c.kind === SWTimeline.PAUSE ? 'pause' : 'pen';
  let layer = 0; for (let i = 0; i < job.plotLayers.length; i++) if (c.pi >= job.plotLayers[i].base) layer = i;
  return { path: Math.min(n, c.pi + 1), paths: n, kind, layer, layers: job.plotLayers.length, frac: st.frac, remaining: Math.max(0, st.total - st.t) / (plotting && pb.live && pb.live.rate > 0.2 ? Math.min(1.5, pb.live.rate) : 1) };
}
