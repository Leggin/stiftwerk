/* ---------------- plotting ---------------- */
let plotting = false;
const plotState = { paused: false, abort: false, errors: 0, lines: 0, done: 0, t0: 0, layer: 0, layers: 0, est: 0 };
/* resumeAt: where an aborted plot stopped (or null) – { g, k, sig, wco, session, boots }: path g (global index) from
 * point k, sig = job signature (the same drawing), wco = work offset of the plot (machine mm) when it was known for
 * sure, session / boots = the connection and the board start it belongs to (a new connection or a restart of the
 * board loses the machine position). Saved (without wco) so it survives a reload of the page.
 * plotFrom: the start point of the plot being prepared (pre-flight reads it). */
let resumeAt = (() => { const r = store.get('resume', null); return r && typeof r.g === 'number' && typeof r.sig === 'string' ? { g: r.g, k: r.k || 0, sig: r.sig } : null; })();
let plotFrom = null;
function setResume(r) { resumeAt = r; store.set('resume', r ? { g: r.g, k: r.k, sig: r.sig } : null); }
const jobSig = j => j ? j.total + ':' + j.cumTotal.toFixed(2) : '';
/* resume point that fits the current drawing */
function resumePoint() { const j = job; return resumeAt && j && !jobDirty && resumeAt.sig === jobSig(j) ? resumeAt : null; }
/* can the zero point of an aborted plot be put back (same connection, board not restarted, offset known)? */
const canRestoreOrigin = () => !!(resumeAt && resumeAt.wco && serial.connected && resumeAt.session === serial.session && resumeAt.boots === serial.boots);
/* the playhead of the preview (scrubbed or paused) as a start point { g, k } – null at the very start or end */
function previewPoint() {
  if (plotting || pb.playing || pb.t == null || !job) return null;
  const s = SWTimeline.at(pbTimeline(), pb.t); if (!s || s.end || (s.g === 0 && s.k === 0)) return null;
  return { g: s.g, k: Math.max(0, s.k - 1) };
}
/* opts.from = { g, k }: plot only from path g, point k on (resume). The zero point is kept: re-set (current mode)
 * only when it is unknown, restored from the aborted plot when possible, homing as usual. */
async function startPlot(opts = {}) {
  const j = getJob(), from = opts.from || null;
  if (!j.plotLayers.length || plotting) return;
  plotFrom = from;
  try { if (SWUI.beforePlot && !(await SWUI.beforePlot(j))) return; } finally { plotFrom = null; }   // pre-flight (67-plot-ui)
  if (!serial.connected) { const ok = await connectFlow(); if (!ok) return; await sleep(400); }
  const L = from ? SWJob.resumeLayers(j.plotLayers, from.g, from.k) : j.plotLayers;
  if (!L.length) return;
  const restore = from && S.startMode !== 'home' && !mcZeroSet && canRestoreOrigin() ? resumeAt.wco : null;
  const zero = !from || S.startMode === 'home' || (!mcZeroSet && !restore);
  const runTl = from ? SWTimeline.build(L, S) : null; if (runTl) runTl.resumed = true;
  const chunks = L.map(l => SW.layerLines(l.paths, l.S || S, l.base));   // l.S: a pen from the pen library
  Object.assign(plotState, { paused: false, abort: false, errors: 0, lines: chunks.reduce((s, c) => s + c.length, 0), done: 0, t0: performance.now(), layer: 0, layers: L.length,
    est: runTl ? runTl.total : j.stats.time, pausedMs: 0, tl: runTl, from, zeroAt: Infinity, sig: jobSig(j) });
  plotState.session = serial.session; plotState.boots = serial.boots;
  plotting = true; progress = { pi: L[0].base, k: from ? from.k : 0 }; simFrac = 1; setResume(null);
  document.body.classList.add('plotting'); SWUI.emit('plot', 'start'); tickProgress();
  try {
    if (serial.state === 'Alarm' && S.startMode !== 'home') { log(t('plot.log.unlocking'), 's'); await serial.send(['$X']); }
    if (serial.state === 'Sleep') { serial.rt('\x18'); await sleep(1200); await serial.send(['$X']).catch(() => { }); }
    const start = SW.startLines(S, { zero });
    if (restore) {   // a soft reset clears G92: put the zero point back where it was (machine position minus the old offset)
      await serial.statusNow(); const m = serial.mpos;
      if (m && (Math.abs(serial.wco[0] - restore[0]) > 0.005 || Math.abs(serial.wco[1] - restore[1]) > 0.005)) {
        start.splice(start.length - 1, 0, `G92 X${SW.n3(m[0] - restore[0])} Y${SW.n3(m[1] - restore[1])}`);
        log(t('plot.log.originRestored'), 's');
      }
    }
    await serial.send(start);
    plotState.zeroAt = performance.now();
    if (from) log(t('plot.log.resumeFrom', { n: from.g + 1 }), 's');
    const penChanges = j.plotLayers.length > 1;
    for (let i = 0; i < L.length; i++) {
      plotState.layer = i;
      if (penChanges) {
        await serial.send([...SW.penLines(S, 'up'), ...(S.park === 'origin' ? [`G1 G90 X0 Y0 F${S.travelF}`] : []), 'G4 P0']);
        const pausedAt = performance.now();
        const orig = j.plotLayers.find(x => x.key === L[i].key) || L[i];   // a resumed layer is a sliced copy
        const go = await penDialog(orig, j.plotLayers.indexOf(orig), j.plotLayers.length);
        plotState.pausedMs += performance.now() - pausedAt;
        if (!go || plotState.abort) throw new Error('abort');
        await serial.send([`G1 F${S.travelF}`]);
      }
      progress = { pi: L[i].base, k: i === 0 && from ? from.k : 0 };
      await serial.send(chunks[i], m => { plotState.done++; progress = { pi: m[0], k: m[1] }; tickProgress(); });
      plotState.done = chunks.slice(0, i + 1).reduce((s, c) => s + c.length, 0);
    }
    await serial.send(SW.endLines(S));
    finishPlot(true);
  } catch (e) {
    if (e.message !== 'abort' && e.message !== 'reset' && e.message !== 'closed') log(t('plot.log.aborted', { msg: e.message }), 'e');
    finishPlot(false);
  }
}
/* where did the pen stop? The live view knows (real pen position on the timeline); without it the last acknowledged
 * line, one path back (acknowledgements run ahead of the pen). One point earlier than the pen: a small overlap, no gap. */
function rememberResume() {
  let g = null, k = 0;
  if (pb.live && (pb.tl || plotState.tl)) { const s = SWTimeline.at(plotState.tl || pb.tl, pbLiveNow()); if (s && !s.end) { g = s.g; k = Math.max(0, s.k - 1); } }
  if (g == null && progress) { g = Math.max(0, progress.pi - 1); k = 0; }
  if (g == null) return;
  const sureWco = serial.wcoAt > plotState.zeroAt;
  setResume({ g, k, sig: plotState.sig, wco: sureWco ? serial.wco.slice(0, 3) : null, session: plotState.session, boots: plotState.boots });
}
/* the plot ended without the user cancelling it (connection lost, computer asleep, board restarted): say what happened
 * and how to go on. Runs after finishPlot has stored the resume point. */
function plotInterrupted(reason) {
  setTimeout(() => {
    const rp = resumePoint(), keep = canRestoreOrigin(), conn = serial.connected;
    const steps = [];
    if (!conn && penDown) steps.push(tHtml('plot.int.lift'));       // the last report had the pen on the paper
    if (!conn) steps.push(tHtml('plot.int.reconnect'));
    if (!keep) steps.push(tHtml('plot.int.zero'));
    if (rp) steps.push(tHtml('plot.int.resume', { i: fmtInt(rp.g + 1) }));
    showDialog(`<h3>${tHtml('plot.int.title')}</h3><p class="hint">${esc(reason)}</p>
      ${rp ? `<p>${tHtml('plot.int.where', { i: fmtInt(rp.g + 1), n: fmtInt(job ? job.total : 0) })}</p>` : ''}
      ${steps.length ? `<ol class="int-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <p class="hint">${tHtml('plot.int.awake')}</p>
      <div class="row"><button class="btn" data-close>${tHtml('common.close')}</button>${conn ? '' : `<button class="btn primary" id="dIntConnect">${tHtml('plot.int.connectBtn')}</button>`}</div>`);
    const b = $('#dIntConnect');
    if (b) b.onclick = async () => { closeDialog(true); const ok = await connectFlow(); if (ok && !canRestoreOrigin() && S.startMode !== 'home') mcOpenWizard(2); };
  }, 0);
}
/* keep the screen on while plotting: a locked or sleeping laptop suspends USB and the plot stops (Screen Wake Lock;
 * released by the browser when the page is hidden, requested again when it comes back) */
let wakeLock = null;
async function awakeOn() {
  if (wakeLock || !plotting || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; SWUI.emit('awake'); });
  } catch (e) { wakeLock = null; }
  SWUI.emit('awake');
}
function awakeOff() { const w = wakeLock; wakeLock = null; if (w) w.release().catch(() => { }); SWUI.emit('awake'); }
SWUI.on('plot', ph => { if (ph === 'start') awakeOn(); else if (ph === 'done' || ph === 'abort') awakeOff(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') awakeOn(); });
/* pen up, trace the rectangle around everything that will be drawn (pen stays up), back to the zero point */
async function traceFrame() {
  const j = getJob(); if (plotting || !j.plotLayers.length) return false;
  const b = SWJob.frameBox(j.plotLayers); if (!b) return false;
  if (!serial.connected) { const ok = await connectFlow(); if (!ok) return false; await sleep(400); }
  if (!(await mcGuard())) return false;
  const { M } = SW.mapper(S), f = Math.min(S.travelF, 3000), go = (x, y) => { const [a, c] = M(x, y); return `G1 X${SW.n3(a)} Y${SW.n3(c)} F${f}`; };
  // zero point as a plot would set it (current: here; home: homing), unless it is already set
  const lines = mcZeroSet ? ['G21', 'G90', ...SW.penLines(S, 'up')] : SW.startLines(S);
  lines.push(go(b.x0, b.y0), go(b.x1, b.y0), go(b.x1, b.y1), go(b.x0, b.y1), go(b.x0, b.y0), `G1 X0 Y0 F${S.travelF}`, 'G4 P0');
  framing = true; SWUI.emit('plot', 'frame');
  log(t('plot.log.frame', { w: fmt(b.x1 - b.x0, 1), h: fmt(b.y1 - b.y0, 1) }), 's');
  let ok = false;
  try { await serial.send(lines); ok = true; } catch (e) { }
  framing = false;
  if (ok && S.startMode !== 'keep') { mcZeroSet = true; mcOriginChanged(); }
  SWUI.emit('plot', 'frameDone');
  return ok;
}
let framing = false;
let progT = 0;
function tickProgress() { if (progT) return; progT = requestAnimationFrame(() => { progT = 0; render(); SWUI.emit('plot', 'tick'); }); }
function togglePause() {
  if (!plotting) return;
  if (!plotState.paused) { plotState.paused = true; plotState.pauseAt = performance.now(); serial.hold = true; serial.rt('!'); log(t('plot.log.paused'), 's'); }
  else { plotState.paused = false; plotState.pausedMs += performance.now() - plotState.pauseAt; serial.rt('~'); serial.hold = false; serial.pump(); log(t('plot.log.resumed'), 's'); }
  SWUI.emit('plot', 'pause'); tickProgress();
}
async function stopPlot(user, reason) {
  if (!plotting) return;
  plotState.abort = true; closeDialog(false);
  serial.hold = true; serial.rt('!'); await sleep(350);
  serial.failAll('abort'); serial.rt('\x18'); await sleep(1200);
  serial.hold = false;
  if (serial.connected) { await serial.send(['$X', ...SW.penLines(S, 'up')]).catch(() => { }); }
  log(user ? t('plot.log.abortedByUser') : (reason || t('plot.log.stopped')), 'e');
  if (!user && reason) showDialog(`<h3>${tHtml('plot.stop.title')}</h3><p class="hint">${esc(reason)}</p><p class="hint">${tHtml('plot.stop.hint')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`);
}
function finishPlot(ok) {
  if (!ok) rememberResume();
  plotting = false; progress = null; plotState.ok = ok; plotState.t1 = performance.now(); plotState.tl = null;
  document.body.classList.remove('plotting'); render(); SWUI.emit('plot', ok ? 'done' : 'abort');
}
