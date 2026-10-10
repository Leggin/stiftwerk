/* ---------------- Maschine → Einrichten: guided setup wizard ----------------
 * ① paper + motors off  ② zero point  ③ pen heights  ④ axis check (+ back to the zero point, so the origin is never moved silently) */
const MC_WIZ_KEY = 'sw-mc-wiz', MC_STEPS = ['mc.wiz.s1', 'mc.wiz.s2', 'mc.wiz.s3', 'mc.wiz.s4'];
const mcWiz = (() => {
  let o = {}; try { o = JSON.parse(sessionStorage.getItem(MC_WIZ_KEY) || '{}') || {}; } catch (e) { o = {}; }
  return { step: o.step >= 1 && o.step <= 4 ? o.step : 1, finished: !!o.finished, done: {}, ax: 'idle' };   // ax: idle → moved → ok | wrong
})();
const mcWizSave = () => { try { sessionStorage.setItem(MC_WIZ_KEY, JSON.stringify({ step: mcWiz.step, finished: mcWiz.finished })); } catch (e) { } };
const MC_CHECK = '<svg class="mc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const mcCmd = c => `<small class="mc-cmd">${esc(c)}</small>`;

function mcWizProgress() {
  return `<ol class="mc-prog" aria-label="${tHtml('mc.wiz.progress')}">${MC_STEPS.map((k, i) => {
    const n = i + 1, cur = n === mcWiz.step, done = !!mcWiz.done['s' + n];
    const aria = t(done ? 'mc.wiz.stepAriaDone' : 'mc.wiz.stepAria', { n, total: MC_STEPS.length, name: t(k) });
    return `<li class="${cur ? 'cur' : ''}${done ? ' done' : ''}"><button type="button" class="mc-pstep" data-mc-step="${n}"${cur ? ' aria-current="step"' : ''} aria-label="${esc(aria)}"><span class="mc-pn">${done ? MC_CHECK : n}</span><span class="mc-pl">${tHtml(k)}</span></button></li>`;
  }).join('')}</ol>`;
}
function mcStepper(k, label) {
  const id = 'mcw_' + k, f = settingsFields().find(x => x.k === k);
  return `<div class="mc-stepper"><label for="${id}">${tHtml(label)}</label><div class="mc-sc">
    <button type="button" class="btn mc-pm" data-mc-act="dec" data-k="${k}" data-mc-lock="plot" aria-label="${esc(t('mc.wiz.less', { name: t(label) }))}">−</button>
    <span class="mc-inp"><input type="number" inputmode="decimal" id="${id}" data-s="${k}" data-mc-lock="plot" step="${f.step}" min="${f.min}" max="${f.max}"><em>${tHtml('unit.mm')}</em></span>
    <button type="button" class="btn mc-pm" data-mc-act="inc" data-k="${k}" data-mc-lock="plot" aria-label="${esc(t('mc.wiz.more', { name: t(label) }))}">+</button></div></div>`;
}
function mcToggleRow(k, label, hint) {
  const id = 'mcw_' + k;
  return `<div class="mc-field mc-bool"><div class="mc-ft"><label for="${id}">${tHtml(label)}</label><small id="${id}_h">${tHtml(hint)}</small></div><input class="mc-switch" type="checkbox" role="switch" id="${id}" data-s="${k}" data-mc-lock="plot" aria-describedby="${id}_h"></div>`;
}
const mcIllus = `<svg class="mc-illus" viewBox="0 0 132 100" aria-hidden="true"><rect class="il-table" x="4" y="18" width="124" height="78" rx="10"/><rect class="il-sheet" x="32" y="32" width="80" height="58" rx="2"/><path class="il-corner" d="M32 50V32h18"/><circle class="il-target" cx="32" cy="32" r="4.5"/><g transform="translate(32 32) rotate(-38)"><rect class="il-pen" x="-3.5" y="-34" width="7" height="28" rx="2.5"/><path class="il-nib" d="M-3.5 -6h7L0 2z"/></g></svg>`;

function mcStepHtml(n) {
  const conn = !!serial.connected, asleep = conn && /^Sleep/.test(serial.state);
  const head = k => `<h4 id="mcWizT" tabindex="-1">${tHtml('mc.wiz.' + k + '.title')}</h4>`;
  if (n === 1) {
    const done = mcWiz.done.s1 || asleep;
    return `${mcIllus}${head(1)}<p>${tHtml('mc.wiz.1.body')}</p>
      <div class="row"><button type="button" class="btn mc-btn${done ? '' : ' primary'}" data-mc-act="sleep" data-mc-lock="conn" data-mc-primary>${tHtml('mc.ctl.sleep')} ${mcCmd('$SLP')}</button></div>
      ${done ? `<p class="mc-note ok" role="status">${tHtml('mc.wiz.1.done')}</p>` : ''}`;
  }
  if (n === 2) {
    return `${head(2)}<p>${tHtml('mc.wiz.2.body')}</p>
      <div class="row"><button type="button" class="btn mc-btn${mcZeroSet ? '' : ' primary'}" data-mc-act="zero" data-mc-lock="conn" data-mc-primary>${tHtml('mc.ctl.zero')} ${mcCmd('G92 X0 Y0')}</button></div>
      ${mcZeroSet ? `<p class="mc-note ok" role="status">${tHtml('mc.wiz.2.done')}</p>` : ''}
      <p class="hint mc-explain">${tHtml('mc.wiz.mode.' + S.startMode)} <button type="button" class="mc-link" data-mc-act="mode">${tHtml('mc.wiz.modeLink')}</button></p>`;
  }
  if (n === 3) {
    return `${head(3)}<p>${tHtml('mc.wiz.3.body')}</p>
      ${mcStepper('penUp', 'settings.penUp.label')}${mcStepper('penDown', 'settings.penDown.label')}
      <p class="mc-note warn mc-penwarn" role="status" hidden>${tHtml('mc.set.penOrder')}</p>
      <div class="row"><button type="button" class="btn mc-btn${mcWiz.done.s3 ? '' : ' primary'}" data-mc-act="test" data-mc-lock="conn" data-mc-primary>${tHtml('mc.wiz.3.test')}</button><span class="hint mc-grow">${tHtml('mc.wiz.3.testHint')}</span></div>`;
  }
  /* n === 4 */
  if (!mcZeroSet && mcWiz.ax === 'idle') {
    return `${head(4)}<p class="mc-note" role="status">${tHtml('mc.wiz.4.needZero')}</p><div class="row"><button type="button" class="btn mc-btn primary" data-mc-step="2" data-mc-primary>${tHtml('mc.wiz.4.toZero')}</button></div>`;
  }
  const ax = mcWiz.ax;
  if (ax === 'idle') return `${head(4)}<p>${tHtml('mc.wiz.4.body')}</p><div class="row"><button type="button" class="btn mc-btn primary" data-mc-act="axtest" data-mc-lock="conn" data-mc-primary>${tHtml('mc.wiz.4.test')}</button></div>`;
  if (ax === 'moved') return `${head(4)}<p><b>${tHtml('mc.wiz.4.ask')}</b></p><div class="row"><button type="button" class="btn mc-btn primary" data-mc-act="axyes" data-mc-primary>${tHtml('mc.wiz.4.yes')}</button><button type="button" class="btn mc-btn" data-mc-act="axno">${tHtml('mc.wiz.4.no')}</button></div>`;
  if (ax === 'wrong') {
    return `${head(4)}<p>${tHtml('mc.wiz.4.fix')}</p>
      ${mcToggleRow('invX', 'settings.invX.label', 'mc.wiz.4.invX')}${mcToggleRow('invY', 'settings.invY.label', 'mc.wiz.4.invY')}${mcToggleRow('swap', 'settings.swap.label', 'mc.wiz.4.swap')}
      <div class="row"><button type="button" class="btn mc-btn primary" data-mc-act="axretest" data-mc-lock="conn" data-mc-primary>${tHtml('mc.wiz.4.retest')}</button></div>`;
  }
  return `${head(4)}<p class="mc-note ok" role="status">${tHtml('mc.wiz.4.good')}</p><p>${tHtml('mc.wiz.4.back')}</p>
    <div class="row"><button type="button" class="btn mc-btn primary" data-mc-act="axback" data-mc-lock="conn" data-mc-primary>${tHtml('mc.wiz.4.goBack')} ${mcCmd('G1 X0 Y0')}</button></div>`;
}
function mcWizDoneHtml() {
  const needZero = S.startMode !== 'home' && !mcZeroSet;
  return `<div class="mc-wdone"><svg class="mc-bigcheck" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>
    <h4 id="mcWizT" tabindex="-1">${tHtml('mc.wiz.done.title')}</h4><p>${tHtml('mc.wiz.done.body')}</p></div>
    ${needZero ? `<p class="mc-note warn" role="status">${tHtml('mc.wiz.done.needZero')}</p><div class="row"><button type="button" class="btn mc-btn primary" data-mc-act="zero" data-mc-lock="conn" data-mc-primary>${tHtml('mc.ctl.zero')} ${mcCmd('G92 X0 Y0')}</button></div>` : ''}
    <div class="row"><button type="button" class="btn mc-btn${needZero ? '' : ' primary'}" data-mc-act="toPlot"${needZero ? '' : ' data-mc-primary'}>${tHtml('mc.wiz.done.plot')}</button><button type="button" class="btn ghost mc-btn" data-mc-act="again">${tHtml('mc.wiz.done.again')}</button></div>`;
}
function mcWizRender(focusHead) {
  const box = $('#mcWiz'); if (!box) return;
  const ae = document.activeElement; let key = '';
  if (ae && box.contains(ae)) key = ae.dataset.mcAct ? `[data-mc-act="${ae.dataset.mcAct}"]${ae.dataset.k ? `[data-k="${ae.dataset.k}"]` : ''}` : ae.id ? '#' + ae.id : ae.dataset.mcStep ? `[data-mc-step="${ae.dataset.mcStep}"]` : '';
  if (mcWiz.finished) box.innerHTML = mcWizDoneHtml();
  else {
    const n = mcWiz.step;
    box.innerHTML = `${mcWizProgress()}<div class="mc-wstep" role="group" aria-labelledby="mcWizT">${mcStepHtml(n)}</div>
      <div class="mc-wnav"><button type="button" class="btn ghost mc-btn" data-mc-act="back"${n === 1 ? ' hidden' : ''}>${tHtml('mc.wiz.back')}</button><span class="mc-grow"></span>${n < MC_STEPS.length ? `<button type="button" class="btn mc-btn${mcWizStepDone(n) ? ' primary' : ''}" data-mc-act="next">${tHtml('mc.wiz.next')}</button>` : ''}</div>`;
  }
  const bd = $('#mcWizBadge');
  bd.hidden = false; bd.className = 'mc-badge' + (mcWiz.finished ? '' : ' muted'); bd.textContent = mcWiz.finished ? t('mc.wiz.badgeDone') : t('mc.wiz.badge', { n: mcWiz.step, total: MC_STEPS.length });
  mcSyncInputs(); mcApplyLocks();
  if (focusHead) { const h = $('#mcWizT'); if (h) h.focus({ preventScroll: true }); }
  else if (key) { let el = null; try { el = box.querySelector(key); } catch (e) { } if (!el || el.disabled) el = box.querySelector('[data-mc-primary]:not(:disabled)'); if (el) el.focus({ preventScroll: true }); }
}
const mcWizStepDone = n => n === 2 ? mcZeroSet : n === 1 ? !!mcWiz.done.s1 || !!(serial.connected && /^Sleep/.test(serial.state)) : !!mcWiz.done['s' + n];
function mcWizGo(n) { mcWiz.step = Math.max(1, Math.min(MC_STEPS.length, n)); mcWiz.finished = false; mcWiz.ax = 'idle'; mcWizSave(); mcWizRender(true); }

/* 3: pen test = down, short dwell, up */
async function mcPenTest() { const ok = await mcRun([SW.penDownLine(S), 'G4 P0.7', SW.penUpLine(S)]); if (ok) mcWiz.done.s3 = true; return ok; }
/* 4: 10 mm right, then 10 mm down, pen up (slow enough to watch) */
async function mcAxisTest() {
  if (!mcZeroSet) return false;
  const { M } = SW.mapper(S), [ax, ay] = M(10, 0), [bx, by] = M(0, 10), f = 1500;
  const ok = await mcRun([SW.penUpLine(S), 'G91', `G1 X${SW.n3(ax)} Y${SW.n3(ay)} F${f}`, `G1 X${SW.n3(bx)} Y${SW.n3(by)} F${f}`, 'G90']);
  if (ok) mcWiz.ax = 'moved';
  return ok;
}
function mcPenNudge(k, dir) {
  const f = settingsFields().find(x => x.k === k), v = Math.round(Math.max(f.min, Math.min(f.max, S[k] + dir * 0.5)) * 1000) / 1000;
  if (v !== S[k]) mcSetSetting(k, v);
}
function mcFocusMode() {
  mcOpenSection('set');
  setTimeout(() => {
    const el = $('#mcs_startMode'); if (!el) return;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); el.focus({ preventScroll: true });
    const row = el.closest('.mc-field'); if (row) { row.classList.add('mc-flash'); setTimeout(() => row.classList.remove('mc-flash'), 1800); }
  }, 60);
}
/* open the drawer on the wizard (n = step); also used by the pre-flight "origin" check */
function mcOpenWizard(n) {
  mcWiz.finished = false; if (n) mcWiz.step = n; mcWiz.ax = 'idle'; mcWizSave(); mcWizRender();
  mcOpenSection('wiz', '#mcWizT');
}
$('#mcWiz').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.mcStep) return mcWizGo(+b.dataset.mcStep);
  const a = b.dataset.mcAct; if (!a) return;
  if (a === 'back') return mcWizGo(mcWiz.step - 1);
  if (a === 'next') return mcWizGo(mcWiz.step + 1);
  if (a === 'dec' || a === 'inc') return mcPenNudge(b.dataset.k, a === 'inc' ? 1 : -1);
  if (a === 'mode') return mcFocusMode();
  if (a === 'toPlot') { SWUI.machine.close(); showStep('plot'); return; }
  if (a === 'again') { mcWiz.finished = false; mcWiz.step = 1; mcWiz.ax = 'idle'; mcWiz.done = {}; mcWizSave(); return mcWizRender(true); }
  if (a === 'axyes') { mcWiz.ax = 'ok'; return mcWizRender(); }
  if (a === 'axno') { mcWiz.ax = 'wrong'; return mcWizRender(); }
  b.disabled = true;   // machine actions: no double clicks while the command is queued
  if (a === 'sleep') { if (await mcSleep()) mcWiz.done.s1 = true; }
  else if (a === 'zero') { if (await mcZero()) mcWiz.done.s2 = true; }
  else if (a === 'test') await mcPenTest();
  else if (a === 'axtest') await mcAxisTest();
  else if (a === 'axretest') { mcWiz.ax = 'idle'; await mcGoZero(); await mcAxisTest(); }
  else if (a === 'axback') { if (await mcGoZero()) { mcWiz.done.s4 = true; mcWiz.finished = true; mcWizSave(); mcWizRender(true); return; } }
  mcWizRender();
});
