/* workflow steps (① Motiv ② Stifte ③ Plotten), machine drawer, language switch */
const STEPS = ['motiv', 'pens', 'plot'];
let step = 'motiv';
function showStep(s) {
  if (!STEPS.includes(s)) s = 'motiv';
  step = s;
  $$('#steps [data-step]').forEach(b => b.dataset.step === s ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
  $$('[data-step-pane]').forEach(p => p.hidden = p.dataset.stepPane !== s);
  document.body.dataset.step = s;
  try { sessionStorage.setItem('sw-step', s); } catch (e) { }
  if (s === 'plot') getJob();
  SWUI.emit('step', s); render();
}
/* old tab names (still used by a few callers): layout → motiv, ctrl/set → machine drawer */
function showTab(tb) { if (tb === 'ctrl' || tb === 'set') SWUI.machine.open(); else showStep(tb === 'layout' ? 'motiv' : tb); }
$('#steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) showStep(b.dataset.step); });
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
