/* ---------------- plotting ---------------- */
let plotting = false;
const plotState = { paused: false, abort: false, errors: 0, lines: 0, done: 0, t0: 0, layer: 0, layers: 0, est: 0 };
async function startPlot() {
  const j = getJob();
  if (!j.plotLayers.length || plotting) return;
  if (SWUI.beforePlot && !(await SWUI.beforePlot(j))) return;   // pre-flight (67-plot-ui)
  if (!serial.connected) { const ok = await connectFlow(); if (!ok) return; await sleep(400); }
  const L = j.plotLayers;
  const chunks = L.map(l => SW.layerLines(l.paths, S, l.base));
  Object.assign(plotState, { paused: false, abort: false, errors: 0, lines: chunks.reduce((s, c) => s + c.length, 0), done: 0, t0: performance.now(), layer: 0, layers: L.length, est: j.stats.time, pausedMs: 0 });
  plotting = true; progress = { pi: L[0].base, k: 0 }; simFrac = 1;
  document.body.classList.add('plotting'); SWUI.emit('plot', 'start'); tickProgress();
  try {
    if (serial.state === 'Alarm' && S.startMode !== 'home') { log(t('plot.log.unlocking'), 's'); await serial.send(['$X']); }
    if (serial.state === 'Sleep') { serial.rt('\x18'); await sleep(1200); await serial.send(['$X']).catch(() => { }); }
    await serial.send(SW.startLines(S));
    for (let i = 0; i < L.length; i++) {
      plotState.layer = i;
      if (L.length > 1) {
        await serial.send([SW.penUpLine(S), ...(S.park === 'origin' ? [`G1 G90 X0 Y0 F${S.travelF}`] : []), 'G4 P0']);
        const pausedAt = performance.now();
        const go = await penDialog(L[i], i, L.length);
        plotState.pausedMs += performance.now() - pausedAt;
        if (!go || plotState.abort) throw new Error('abort');
        await serial.send([`G1 F${S.travelF}`]);
      }
      progress = { pi: L[i].base, k: 0 };
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
  if (serial.connected) { await serial.send(['$X', SW.penUpLine(S)]).catch(() => { }); }
  log(user ? t('plot.log.abortedByUser') : (reason || t('plot.log.stopped')), 'e');
  if (!user && reason) showDialog(`<h3>${tHtml('plot.stop.title')}</h3><p class="hint">${esc(reason)}</p><p class="hint">${tHtml('plot.stop.hint')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`);
}
function finishPlot(ok) {
  plotting = false; progress = null; plotState.ok = ok; plotState.t1 = performance.now();
  document.body.classList.remove('plotting'); render(); SWUI.emit('plot', ok ? 'done' : 'abort');
}
