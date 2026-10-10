/* ---------------- plotting ---------------- */
let plotting = false;
const plotState = { paused: false, abort: false, errors: 0, lines: 0, done: 0, t0: 0, layer: 0, layers: 0, est: 0 };
async function startPlot() {
  const j = getJob();
  if (!j.plotLayers.length) return;
  if (!serial.connected) { const ok = await connectFlow(); if (!ok) return; await sleep(400); }
  const L = j.plotLayers;
  const chunks = L.map(l => SW.layerLines(l.paths, S, l.base));
  Object.assign(plotState, { paused: false, abort: false, errors: 0, lines: chunks.reduce((s, c) => s + c.length, 0), done: 0, t0: performance.now(), layer: 0, layers: L.length, est: j.stats.time, pausedMs: 0 });
  plotting = true; progress = { pi: L[0].base, k: 0 }; simFrac = 1; $('#sim').value = 1000;
  $('#progWrap').hidden = false; renderPlotBtns(); showTab('plot'); tickProgress();
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
function tickProgress() {
  if (progT) return;
  progT = requestAnimationFrame(() => {
    progT = 0; render();
    const f = plotState.lines ? Math.min(1, plotState.done / plotState.lines) : 0;
    $('#progBar').style.width = (f * 100).toFixed(1) + '%';
    const el = (performance.now() - plotState.t0 - (plotState.pausedMs || 0)) / 1000;
    const rest = f > 0.04 ? el / f - el : plotState.est - el;
    $('#progL').textContent = t('plot.progress.line', { pct: Math.round(f * 100), pen: t('plot.progress.pen', { i: plotState.layer + 1, n: plotState.layers }), errs: plotState.errors ? tn('plot.progress.errs', plotState.errors) : '' });
    $('#progR').textContent = plotState.paused ? t('plot.progress.paused') : t('plot.progress.remaining', { time: fmtTime(Math.max(0, rest)) });
  });
}
function togglePause() {
  if (!plotting) return;
  if (!plotState.paused) { plotState.paused = true; plotState.pauseAt = performance.now(); serial.hold = true; serial.rt('!'); log(t('plot.log.paused'), 's'); }
  else { plotState.paused = false; plotState.pausedMs += performance.now() - plotState.pauseAt; serial.rt('~'); serial.hold = false; serial.pump(); log(t('plot.log.resumed'), 's'); }
  renderPlotBtns(); tickProgress();
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
  plotting = false; progress = null; renderPlotBtns(); render();
  if (ok) { $('#progBar').style.width = '100%'; $('#progL').textContent = t('plot.progress.done', { time: fmtTime((performance.now() - plotState.t0 - plotState.pausedMs) / 1000) }); $('#progR').textContent = plotState.errors ? tn('plot.progress.errorsHint', plotState.errors) : ''; toast(t('plot.toast.done')); }
  else { $('#progR').textContent = t('plot.progress.aborted'); }
}
function penDialog(L, i, n) {
  return new Promise(res => {
    showDialog(`<div class="row" style="gap:14px;flex-wrap:nowrap"><span class="swatch" style="background:${esc(L.color)}"></span><div><h3>${tHtml('plot.pen.title', { i: i + 1, n, name: L.name })}</h3><p class="hint" style="margin:4px 0 0">${i ? tHtml('plot.pen.hintChange') : tHtml('plot.pen.hintInsert')}</p></div></div>
      <div class="row"><button class="btn" id="dTest">${tHtml('plot.pen.test')}</button><span class="fill"></span><button class="btn danger" data-close>${tHtml('common.cancel')}</button><button class="btn primary" id="dGo">${i ? tHtml('plot.pen.goNext') : tHtml('plot.pen.go')}</button></div>`, res);
    $('#dGo').onclick = () => closeDialog(true);
    $('#dTest').onclick = () => serial.send([SW.penDownLine(S), 'G4 P0.4', SW.penUpLine(S)]).catch(() => { });
  });
}

