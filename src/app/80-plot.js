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
    if (serial.state === 'Alarm' && S.startMode !== 'home') { log('Plotter war gesperrt – entsperre ($X).', 's'); await serial.send(['$X']); }
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
    if (e.message !== 'abort' && e.message !== 'reset' && e.message !== 'closed') log('Plot abgebrochen: ' + e.message, 'e');
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
    $('#progL').textContent = `${Math.round(f * 100)} % · Stift ${plotState.layer + 1}/${plotState.layers}${plotState.errors ? ` · ${plotState.errors} Fehler` : ''}`;
    $('#progR').textContent = plotState.paused ? 'pausiert' : `noch ca. ${fmtTime(Math.max(0, rest))}`;
  });
}
function togglePause() {
  if (!plotting) return;
  if (!plotState.paused) { plotState.paused = true; plotState.pauseAt = performance.now(); serial.hold = true; serial.rt('!'); log('Pause (Vorschub angehalten)', 's'); }
  else { plotState.paused = false; plotState.pausedMs += performance.now() - plotState.pauseAt; serial.rt('~'); serial.hold = false; serial.pump(); log('Weiter', 's'); }
  renderPlotBtns(); tickProgress();
}
async function stopPlot(user, reason) {
  if (!plotting) return;
  plotState.abort = true; closeDialog(false);
  serial.hold = true; serial.rt('!'); await sleep(350);
  serial.failAll('abort'); serial.rt('\x18'); await sleep(1200);
  serial.hold = false;
  if (serial.connected) { await serial.send(['$X', SW.penUpLine(S)]).catch(() => { }); }
  log(user ? 'Plot abgebrochen. Stift ist oben.' : (reason || 'Plot gestoppt.'), 'e');
  if (!user && reason) showDialog(`<h3>Plot gestoppt</h3><p class="hint">${esc(reason)}</p><p class="hint">Prüfe die Position, setze ggf. den Nullpunkt neu und starte erneut.</p><div class="row"><button class="btn primary" data-close>Schließen</button></div>`);
}
function finishPlot(ok) {
  plotting = false; progress = null; renderPlotBtns(); render();
  if (ok) { $('#progBar').style.width = '100%'; $('#progL').textContent = `Fertig · ${fmtTime((performance.now() - plotState.t0 - plotState.pausedMs) / 1000)}`; $('#progR').textContent = plotState.errors ? `${plotState.errors} Fehler, siehe Konsole` : ''; toast('Plot fertig'); }
  else { $('#progR').textContent = 'abgebrochen'; }
}
function penDialog(L, i, n) {
  return new Promise(res => {
    showDialog(`<div class="row" style="gap:14px;flex-wrap:nowrap"><span class="swatch" style="background:${esc(L.color)}"></span><div><h3>Stift ${i + 1} von ${n}: ${esc(L.name)}</h3><p class="hint" style="margin:4px 0 0">${i ? 'Stift wechseln' : 'Stift einsetzen'}, Spitze knapp über dem Papier. Mit „Testen“ kurz absetzen.</p></div></div>
      <div class="row"><button class="btn" id="dTest">Testen</button><span class="fill"></span><button class="btn danger" data-close>Abbrechen</button><button class="btn primary" id="dGo">${i ? 'Weiterplotten' : 'Plot starten'}</button></div>`, res);
    $('#dGo').onclick = () => closeDialog(true);
    $('#dTest').onclick = () => serial.send([SW.penDownLine(S), 'G4 P0.4', SW.penUpLine(S)]).catch(() => { });
  });
}

