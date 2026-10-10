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
    const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
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
  const st = $('#pStart'); if (st) st.onclick = hasSerialApi ? startPlot : gcodeExport;
  const pa = $('#pPause'); if (pa) pa.onclick = togglePause;
  const so = $('#pStop'); if (so) so.onclick = () => {
    if (!cancelArm) { so.classList.add('sure'); so.innerHTML = stopBtnHtml(true); cancelArm = setTimeout(disarmCancel, 3000); }
    else { clearTimeout(cancelArm); cancelArm = 0; stopPlot(true); }
  };
}
SWUI.on('job', renderStats); SWUI.on('conn', renderStats); SWUI.on('preflight', renderStats);
/* the zero point (machine drawer), GRBL state (alarm) and font loads change check results too */
SWUI.on('origin', renderStats); SWUI.on('fonts', renderStats);
let pfStateSig = ''; SWUI.on('state', () => { const sig = serial.connected + '|' + String(serial.state).split(':')[0]; if (sig !== pfStateSig) { pfStateSig = sig; renderStats(); } });

/* plot progress (events from 80-plot.js: start, tick, pause, done, abort) */
function renderProgress() {
  const f = plotState.lines ? Math.min(1, plotState.done / plotState.lines) : 0;
  $('#progBar').style.width = (f * 100).toFixed(1) + '%';
  $('#progPct').textContent = `${Math.round(f * 100)} %`;
  const el = (performance.now() - plotState.t0 - (plotState.pausedMs || 0)) / 1000;
  const rest = f > 0.04 ? el / f - el : plotState.est - el;
  $('#progL').textContent = t('plot.progress.pen', { i: plotState.layer + 1, n: plotState.layers }) + (plotState.errors ? tn('plot.progress.errs', plotState.errors) : '');
  $('#progR').textContent = plotState.paused ? t('plot.progress.paused') : t('plot.progress.remaining', { time: fmtTime(Math.max(0, rest)) });
}
SWUI.on('plot', phase => {
  if (phase === 'start') { $('#sim').value = 1000; $('#progWrap').hidden = false; renderPlotBtns(); showStep('plot'); renderProgress(); }
  if (phase === 'tick' && plotting) renderProgress();
  if (phase === 'pause') { renderPlotBtns(); renderProgress(); }
  if (phase === 'done') { renderPlotBtns(); $('#progBar').style.width = '100%'; $('#progPct').textContent = '100 %'; $('#progL').textContent = t('plot.progress.done', { time: fmtTime((plotState.t1 - plotState.t0 - plotState.pausedMs) / 1000) }); $('#progR').textContent = plotState.errors ? tn('plot.progress.errorsHint', plotState.errors) : ''; toast(t('plot.toast.done')); }
  if (phase === 'abort') { renderPlotBtns(); $('#progR').textContent = t('plot.progress.aborted'); }
});
