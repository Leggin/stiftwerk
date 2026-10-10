/* workflow steps (① Motiv ② Stifte ③ Plotten) with live badges, machine drawer, language switch */
const STEPS = ['motiv', 'pens', 'plot'];
let step = 'motiv';
function showStep(s) {
  if (!STEPS.includes(s)) s = 'motiv';
  if (plotting && s !== 'plot') s = 'plot';
  step = s;
  $$('#steps [data-step]').forEach(b => b.dataset.step === s ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
  $$('[data-step-pane]').forEach(p => p.hidden = p.dataset.stepPane !== s);
  document.body.dataset.step = s;
  try { sessionStorage.setItem('sw-step', s); } catch (e) { }
  if (s !== 'plot' && simFrac !== 1) { simFrac = 1; $('#sim').value = 1000; }
  if (s === 'plot') getJob();
  SWUI.emit('step', s); render();
}
/* old tab names (still used by a few callers): layout → motiv, ctrl/set → machine drawer */
function showTab(tb) { if (tb === 'ctrl' || tb === 'set') SWUI.machine.open(); else showStep(tb === 'layout' ? 'motiv' : tb); }
$('#steps').addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (!b || b.disabled) return;
  showStep(b.dataset.step);
  if (matchMedia('(max-width: 880px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* live badges: ② "3 Stifte", ③ "≈12 min" – or a red dot while a pre-flight check blocks */
function stepTimeBadge(sec) {
  if (sec < 45) return t('shell.badge.lt1');
  if (sec < 3600) return t('shell.badge.min', { n: Math.max(1, Math.round(sec / 60)) });
  const m = Math.round(sec / 60); return t('shell.badge.h', { t: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` });
}
function renderStepBadges() {
  const bp = $('#badgePens'), bl = $('#badgePlot');
  if (!job) { bp.hidden = bl.hidden = true; return; }
  const n = job.plotLayers.length;
  bp.hidden = !n; bp.textContent = n ? tn('shell.badge.pens', n) : '';
  let checks = []; try { checks = runPreflight(); } catch (e) { console.error(e); }
  const blocked = checks.some(c => c.state === 'block'), warned = checks.some(c => c.state === 'warn');
  bl.hidden = false;
  if (blocked) { bl.className = 'bd bad'; bl.innerHTML = `<i></i><span class="sr">${tHtml('shell.badge.blocked')}</span>`; }
  else { bl.className = 'bd' + (warned ? ' warn' : ''); bl.textContent = stepTimeBadge(job.stats.time); }
}
SWUI.on('job', renderStepBadges); SWUI.on('conn', renderStepBadges); SWUI.on('history', renderStepBadges); SWUI.on('preflight', renderStepBadges);
SWUI.onRender(renderStepBadges);
/* editing is locked while a plot runs: steps ① ② are greyed out and inert */
function lockEditing(on) {
  for (const el of $$('#objects, [data-step-pane="motiv"], [data-step-pane="pens"]')) el.inert = on;
  for (const b of $$('#steps [data-step]')) if (b.dataset.step !== 'plot') b.disabled = on;
}
SWUI.on('plot', ph => { if (ph === 'start') { lockEditing(true); showStep('plot'); } else if (ph === 'done' || ph === 'abort') lockEditing(false); renderStepBadges(); });

Object.assign(SWUI.machine, {
  open() { $('#machine').hidden = false; $('#btnMachine').setAttribute('aria-expanded', 'true'); document.body.classList.add('machine-open'); SWUI.emit('machine', true); },
  close() { $('#machine').hidden = true; $('#btnMachine').setAttribute('aria-expanded', 'false'); document.body.classList.remove('machine-open'); SWUI.emit('machine', false); $('#btnMachine').focus(); }
});
Object.defineProperty(SWUI.machine, 'isOpen', { get: () => !$('#machine').hidden });
$('#btnMachine').onclick = () => SWUI.machine.isOpen ? SWUI.machine.close() : SWUI.machine.open();
$('#machineClose').onclick = () => SWUI.machine.close();
function renderLang() { $$('#langSwitch [data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === I18N.lang)); }
$('#langSwitch').addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== I18N.lang) I18N.setLang(b.dataset.lang); });
/* header dot: grey = not connected, green = ready, amber = hold/sleep, red = alarm, pulsing = moving */
function renderMachineDot() {
  const d = $('#machineDot'), s = serial.connected ? String(serial.state || '').split(':')[0] : '';
  d.className = 'dot ' + (!serial.connected ? '' : /Alarm/.test(s) ? 'bad' : /Hold|Sleep|Door/.test(s) ? 'warn' : /Run|Jog|Home/.test(s) ? 'run' : 'ok');
}
SWUI.on('conn', renderMachineDot); SWUI.on('state', renderMachineDot);
