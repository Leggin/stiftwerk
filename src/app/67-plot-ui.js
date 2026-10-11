/* ---------------- ③ Plotten: pre-flight checklist, start / pause / cancel, progress ---------------- */
const hasSerialApi = 'serial' in navigator;
const PRE_ICON = { ok: 'checkCircle', warn: 'alert', block: 'xCircle', info: 'info' };

/* all registered checks (SWUI.preflight) → [{ id, order, state, label, detail?, action?, confirm?, icon? }] */
function runPreflight() {
  const out = [];
  for (const c of SWUI.preflight.checks) {
    let r = null; try { r = c.check(); } catch (e) { console.error(e); }
    if (r && r.state) out.push(Object.assign({ id: c.id, order: c.order }, r));
  }
  return out;
}
/* the checks owned by the shell: something to plot · everything inside the work area · how long it takes */
SWUI.preflight.register({
  id: 'content', order: 10,
  check() {
    if (!job) return null;
    if (!job.plotLayers.length) return { state: 'block', label: t('plot.pre.content.none'), detail: t('plot.pre.content.noneHint'), action: { label: t('plot.pre.toMotiv'), run: () => showStep('motiv') } };
    const n = items.filter(i => i.visible).length;
    return { state: 'ok', label: t('plot.pre.content.ok'), detail: `${tn('plot.pre.objects', n)} · ${tn('shell.badge.pens', job.plotLayers.length)}` };
  }
});
let areaMemo = null;
SWUI.preflight.register({
  id: 'area', order: 20,
  check() {
    if (!job || !job.plotLayers.length) return null;
    const [mw, mh] = workArea();
    if (!areaMemo || areaMemo.job !== job || areaMemo.mw !== mw || areaMemo.mh !== mh) {
      let over = false;
      scan: for (const L of job.plotLayers) for (const p of L.paths) for (const q of p.pts) if (q[0] > mw + 0.01 || q[1] > mh + 0.01 || q[0] < -0.01 || q[1] < -0.01) { over = true; break scan; }
      areaMemo = { job, mw, mh, over };
    }
    const dims = `${fmt(mw, 0)} × ${fmt(mh, 0)} mm`, back = { label: t('plot.pre.toMotiv'), run: () => showStep('motiv') };
    if (areaMemo.over) return { state: 'block', label: t('plot.pre.area.block'), detail: t('plot.pre.area.blockHint', { dims }), action: back };
    if (job.clipped) return { state: 'warn', label: tn('plot.pre.area.clip', job.clipped), detail: t('plot.pre.area.clipHint'), action: back };
    return { state: 'ok', label: t('plot.pre.area.ok'), detail: t('plot.pre.area.okHint', { dims }) };
  }
});
SWUI.preflight.register({
  id: 'duration', order: 80,
  check() {
    if (!job || !job.plotLayers.length) return null;
    const s = job.stats, changes = Math.max(0, job.plotLayers.length - 1);
    const parts = [t('plot.pre.duration.draw', { m: fmt(s.draw / 1000, 1) }), t('plot.pre.duration.travel', { m: fmt(s.travel / 1000, 1) }), tn('plot.pre.duration.downs', s.downs)];
    if (changes) parts.push(tn('plot.pre.duration.changes', changes));
    return { state: 'info', icon: 'clock', label: t('plot.pre.duration', { time: fmtTime(s.time) }), detail: parts.join(' · ') };
  }
});

let preLast = [];
function renderPreflight() {
  const ul = $('#preflight'); preLast = runPreflight();
  ul.innerHTML = preLast.map((r, i) => `<li class="chk ${esc(r.state)}"><span class="ci">${swIcon(r.icon || PRE_ICON[r.state] || 'info')}</span><span class="lb"><span class="sr">${tHtml('plot.pre.state.' + r.state)}: </span>${esc(r.label)}</span>${r.detail ? `<span class="dt">${esc(r.detail)}</span>` : ''}${r.action ? `<button class="btn sm act" data-pre="${i}">${esc(r.action.label)}</button>` : ''}</li>`).join('');
}
$('#preflight').addEventListener('click', e => { const b = e.target.closest('[data-pre]'); const r = b && preLast[+b.dataset.pre]; if (r && r.action) r.action.run(); });
function flashPreflight() {
  const ul = $('#preflight'); ul.classList.remove('flash'); void ul.offsetWidth; ul.classList.add('flash');
  ul.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => ul.classList.remove('flash'), 2000);
}
/* pre-flight gate, awaited by startPlot(): blocked → show why and stop; confirm:true → ask once */
SWUI.beforePlot = async function (j) {
  const res = runPreflight();
  if (res.some(r => r.state === 'block')) { if (step !== 'plot') showStep('plot'); renderPreflight(); flashPreflight(); toast(t('plot.pre.blocked')); return false; }
  const ask = res.filter(r => r.confirm);
  if (!ask.length) return true;
  return new Promise(resolve => {
    showDialog(`<h3>${tHtml('plot.confirm.title')}</h3><p class="hint">${tHtml('plot.confirm.body')}</p>
      <ul class="list-plain">${ask.map(r => `<li>${swIcon(r.icon || PRE_ICON[r.state] || 'alert')}<span>${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</span></li>`).join('')}</ul>
      <div class="row"><button class="btn" data-close>${tHtml('common.cancel')}</button><button class="btn primary" id="dGoAnyway">${tHtml('plot.confirm.go')}</button></div>`, resolve);
    $('#dGoAnyway').onclick = () => closeDialog(true);
  });
};

/* the whole step (also called by uiConn when the connection changes) */
function renderStats() { renderPreflight(); renderPlotBtns(); }
let cancelArm = 0;
const stopBtnHtml = sure => sure ? tHtml('plot.btn.cancelSure') : `${swIcon('stop')}${tHtml('plot.btn.cancel')}`;
function disarmCancel() { clearTimeout(cancelArm); cancelArm = 0; const b = $('#pStop'); if (b) { b.classList.remove('sure'); b.innerHTML = stopBtnHtml(false); } }
function renderPlotBtns() {
  clearTimeout(cancelArm); cancelArm = 0;
  const b = $('#plotBtns'), can = !!(job && job.plotLayers.length);
  $('#plotTitle').textContent = t(plotting ? 'plot.title.running' : 'plot.title');
  if (!plotting) {
    b.innerHTML = `<button class="btn primary big" id="pStart" ${can ? '' : 'disabled'}>${swIcon(hasSerialApi ? 'play' : 'download')}${tHtml(!hasSerialApi ? (canSaveGcode() ? 'plot.btn.saveG' : 'plot.btn.copyG') : serial.connected ? 'plot.btn.start' : 'plot.btn.connect')}</button>`;
    const hint = $('#plotHint'); hint.hidden = hasSerialApi; if (!hasSerialApi) hint.textContent = t('plot.noSerial.hint');
  } else {
    b.innerHTML = `<button class="btn big" id="pPause">${swIcon(plotState.paused ? 'play' : 'pause')}${tHtml(plotState.paused ? 'plot.btn.resume' : 'plot.btn.pause')}</button><button class="btn danger big" id="pStop">${stopBtnHtml(false)}</button>`;
    $('#plotHint').hidden = true;
  }
  renderPlotMore(can);
  const st = $('#pStart'); if (st) st.onclick = hasSerialApi ? () => startPlot() : gcodeExport;
  const pa = $('#pPause'); if (pa) pa.onclick = togglePause;
  const so = $('#pStop'); if (so) so.onclick = () => {
    if (!cancelArm) { so.classList.add('sure'); so.innerHTML = stopBtnHtml(true); cancelArm = setTimeout(disarmCancel, 3000); }
    else { clearTimeout(cancelArm); cancelArm = 0; stopPlot(true); }
  };
}
/* below the start button: resume after an abort, "Ab hier plotten" at the paused preview, frame trace */
function renderPlotMore(can) {
  const box = $('#plotMore'); if (!box) return;
  if (plotting || !hasSerialApi || !can) { box.innerHTML = ''; box.hidden = true; return; }
  const rp = resumePoint(), pv = previewPoint(), n = job.total;
  let h = '';
  if (rp) h += `<div class="resume-card" role="group" aria-labelledby="rsT"><p id="rsT"><strong>${tHtml('plot.resume.title')}</strong> ${tHtml('plot.resume.where', { i: fmtInt(rp.g + 1), n: fmtInt(n) })}</p>
    <div class="row"><button class="btn primary" id="pResume">${swIcon('skip')}${tHtml('plot.resume.btn', { i: fmtInt(rp.g + 1) })}</button><button class="btn ghost sm" id="pResumeForget">${tHtml('plot.resume.forget')}</button></div></div>`;
  const row = [];
  if (pv && !(rp && rp.g === pv.g && rp.k === pv.k)) row.push(`<button class="btn sm" id="pFromHere" title="${tHtml('plot.fromHere.title')}">${swIcon('skip', 'sm')}${tHtml('plot.fromHere', { i: fmtInt(pv.g + 1) })}</button>`);
  row.push(`<button class="btn sm" id="pFrame" ${framing ? 'disabled' : ''} title="${tHtml('plot.frame.title')}">${swIcon('frame', 'sm')}${tHtml(framing ? 'plot.frame.busy' : 'plot.frame')}</button>`);
  h += `<div class="row">${row.join('')}</div>`;
  box.innerHTML = h; box.hidden = false;
  const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
  on('pResume', () => { const r = resumePoint(); if (r) startPlot({ from: { g: r.g, k: r.k } }); });
  on('pResumeForget', () => { setResume(null); renderPlotBtns(); });
  on('pFromHere', () => { const p = previewPoint(); if (p) { pbStop(); startPlot({ from: p }); } });
  on('pFrame', () => traceFrame());
}
let plotMoreSig = '';
SWUI.on('playback', () => { const p = previewPoint(), sig = p ? p.g + ':' + p.k : ''; if (sig !== plotMoreSig) { plotMoreSig = sig; if (!plotting) renderPlotMore(!!(job && job.plotLayers.length)); } });
SWUI.on('plot', ph => { if (ph === 'frame' || ph === 'frameDone') renderPlotMore(!!(job && job.plotLayers.length)); });
SWUI.on('job', renderStats); SWUI.on('conn', renderStats); SWUI.on('preflight', renderStats);
/* the zero point (machine drawer), GRBL state (alarm) and font loads change check results too */
SWUI.on('origin', renderStats); SWUI.on('fonts', renderStats);
let pfStateSig = ''; SWUI.on('state', () => { const sig = serial.connected + '|' + String(serial.state).split(':')[0]; if (sig !== pfStateSig) { pfStateSig = sig; renderStats(); } });

/* plot progress (events from 80-plot.js: start, tick, pause, done, abort) */
function renderProgress() {
  // time-based from the live playhead (where the pen really is), else acknowledged lines
  const live = plotting ? pbLiveInfo() : null;
  const f = live ? live.frac : plotState.lines ? Math.min(1, plotState.done / plotState.lines) : 0;
  $('#progBar').style.width = (f * 100).toFixed(1) + '%';
  $('#progPct').textContent = `${Math.round(f * 100)} %`;
  const el = (performance.now() - plotState.t0 - (plotState.pausedMs || 0)) / 1000;
  const rest = live ? live.remaining : f > 0.04 ? el / f - el : plotState.est - el;
  $('#progL').textContent = t('plot.progress.pen', { i: plotState.layer + 1, n: plotState.layers }) + (plotState.errors ? tn('plot.progress.errs', plotState.errors) : '');
  $('#progR').textContent = plotState.paused ? t('plot.progress.paused') : t('plot.progress.remaining', { time: fmtEta(Math.max(0, rest)) });
}
SWUI.on('plot', phase => {
  if (phase === 'start') { $('#sim').value = 1000; $('#progWrap').hidden = false; renderPlotBtns(); showStep('plot'); renderProgress(); }
  if (phase === 'tick' && plotting) renderProgress();
  if (phase === 'pause') { renderPlotBtns(); renderProgress(); }
  if (phase === 'done') { renderPlotBtns(); $('#progBar').style.width = '100%'; $('#progPct').textContent = '100 %'; $('#progL').textContent = t('plot.progress.done', { time: fmtTime((plotState.t1 - plotState.t0 - plotState.pausedMs) / 1000) }); $('#progR').textContent = plotState.errors ? tn('plot.progress.errorsHint', plotState.errors) : ''; toast(t('plot.toast.done')); }
  if (phase === 'abort') { renderPlotBtns(); $('#progR').textContent = t('plot.progress.aborted'); }
});

/* ---- preview playback in the stage dock (step ③): play / pause, speed, "0:42 / 2:13" ---- */
const pbClock = sec => {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = v => String(v).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
};
let pbUi = {};   // what the dock shows: 'playback' fires every frame while playing, so only changed values are written
function pbPaint() {
  const st = pbStatus(), play = $('#pbPlay'), u = pbUi;
  if (u.playing !== st.playing) {
    u.playing = st.playing;
    play.innerHTML = swIcon(st.playing ? 'pause' : 'play');
    play.setAttribute('aria-label', t('plot.pb.play')); play.title = t(st.playing ? 'plot.pb.pause' : 'plot.pb.play'); play.setAttribute('aria-pressed', String(st.playing));
  }
  const clock = `${pbClock(st.t)} / ${pbClock(st.total)}`;
  if (u.clock !== clock) { u.clock = clock; $('#pbTime').textContent = clock; }
  if (u.speed !== st.speed) { u.speed = st.speed; for (const b of $$('#pbSpeed [data-v]')) b.setAttribute('aria-pressed', String(+b.dataset.v === st.speed)); }
}
$('#pbPlay').onclick = () => pbToggle();
$('#pbSpeed').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) pbSetSpeed(+b.dataset.v); });
SWUI.on('playback', () => pbPaint());
SWUI.on('job', () => pbPaint());

/* ---- live line under the progress bar while plotting ("Zeichnet Linie 43 von 91") ---- */
function liveRender(ended) {
  const row = $('#liveRow'), el = $('#liveInfo'), on = plotting && !ended;
  row.hidden = !on; if (!on) return;
  const c = pbLiveInfo();
  const txt = !c ? null : c.kind === 'draw' ? t('plot.live.draw', { i: fmtInt(c.path), n: fmtInt(c.paths) }) : c.kind === 'travel' ? t('plot.live.travel') : c.kind === 'pause' ? t('plot.live.pause') : t('plot.live.pen');
  el.hidden = txt == null;
  if (txt != null && el.textContent !== txt) el.textContent = txt;   // only touch the DOM when the text changes
}

/* ---- "Ansicht folgt dem Stift": while plotting, re-center the view when the pen is about to leave the visible canvas.
 * Skipped for 3 s after the user pans or zooms the canvas by hand. ---- */
let followOn = sessionStorageGet('sw-follow') !== '0', gestureAt = -1e9;
cv.addEventListener('pointerdown', () => { gestureAt = performance.now(); });
cv.addEventListener('wheel', () => { gestureAt = performance.now(); }, { passive: true });
function followPen() {
  const c = plotting && pbCut(), r = cv.getBoundingClientRect();
  if (!c || !r.width || performance.now() - gestureAt < 3000) return;
  const [sx, sy] = toScr(c.pos[0], c.pos[1]), m = 16;
  if (sx >= m && sy >= m && sx <= r.width - m && sy <= r.height - m) return;
  view.ox += r.width / 2 - sx; view.oy += r.height / 2 - sy; render();
}
const followEl = $('#followPen');
followEl.checked = followOn;
followEl.onchange = e => {
  followOn = e.target.checked;
  try { sessionStorage.setItem('sw-follow', followOn ? '1' : '0'); } catch (er) { }
  if (followOn) followPen();
};

SWUI.on('plot', ph => {
  if (ph === 'done' || ph === 'abort') { liveRender(true); pbPaint(); return; }   // the readout shows the preview again, from the end
  liveRender();
  if (ph === 'tick' && followOn) followPen();
});
SWUI.onRender(() => { pbUi = {}; pbPaint(); liveRender(); awakeRender(); });
/* "the screen stays on – don't close the laptop" while plotting (wake lock in 80-plot.js) */
function awakeRender() { const el = $('#awakeHint'); if (el) el.textContent = t(wakeLock ? 'plot.awake.on' : 'plot.awake.off'); }
SWUI.on('awake', awakeRender); SWUI.on('plot', ph => { if (ph === 'start') awakeRender(); });
