/* ---------------- manual control (jog pad, pen, zero point, machine commands) ---------------- */
let jogStep = +(sessionStorageGet('sw-jog') || 10);
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function renderJog() {
  $$('#jogStep button').forEach(b => { const v = +b.dataset.v; b.textContent = fmt(v, v < 1 ? 1 : 0); b.setAttribute('aria-pressed', v === jogStep); });
}
$('#jogStep').onclick = e => { const b = e.target.closest('button'); if (!b) return; jogStep = +b.dataset.v; try { sessionStorage.setItem('sw-jog', jogStep); } catch (er) { } renderJog(); };

/* Every machine action goes through mcRun: it checks connection and plot lock, wakes a sleeping board
 * (after "Motoren aus" only a soft reset brings it back) and swallows aborted sends. */
async function mcGuard(opts = {}) {
  if (!serial.connected) { toast(t('manual.toast.connectFirst')); return false; }
  if (plotting) { toast(t('manual.toast.lockedDuringPlot')); return false; }
  if (opts.wake !== false && /^Sleep/.test(serial.state)) {
    log(t('manual.log.wake'), 's'); serial.failAll('reset'); serial.rt('\x18'); await sleep(1300);
    await serial.send(['$X']).catch(() => { });
    if (!serial.connected) return false;
  }
  return true;
}
async function mcRun(lines, opts) {
  if (!(await mcGuard(opts))) return false;
  try { await serial.send(lines); return true; } catch (e) { return false; }
}
const mcJog = (dx, dy, f) => { const { M } = SW.mapper(S), [a, c] = M(dx, dy); return mcRun(['G91', `G1 X${SW.n3(a)} Y${SW.n3(c)} F${f || Math.min(S.travelF, 6000)}`, 'G90']); };
/* servo / G-code pens report nothing back: remember what we sent */
const mcPenSent = (ok, down) => { if (ok && !isZPen()) { penDown = down; mcRenderPen(); } return ok; };
const mcPenUp = async () => mcPenSent(await mcRun([...SW.penLines(S, 'up')]), false);
const mcPenDown = async () => mcPenSent(await mcRun([...SW.penLines(S, 'down')]), true);
async function mcZero() {
  if (!(await mcGuard())) return false;
  try { await serial.send([...SW.penLines(S, 'up'), 'G92 X0 Y0']); } catch (e) { return false; }
  mcZeroSet = true; toast(t('manual.toast.zeroSet')); mcOriginChanged(); return true;
}
const mcGoZero = () => mcRun([...SW.penLines(S, 'up'), `G1 G90 X0 Y0 F${S.travelF}`]);
async function mcHome() { if (!S.canHome) return false; toast(t('manual.toast.homing')); mcZeroSet = false; mcOriginChanged(); return mcRun([...SW.penLines(S, 'up'), '$H']); }
const mcUnlock = () => mcRun(['$X']);
async function mcSleep() {
  if (!S.canSleep) { toast(t('manual.toast.noSleep')); return true; }   // the wizard goes on: just push the pen by hand
  if (serial.connected && /^Sleep/.test(serial.state)) { toast(t('manual.toast.motorsOff')); return true; }
  /* the board falls asleep right after acknowledging $SLP – don't wait forever if the "ok" never shows up */
  const ok = await Promise.race([mcRun([...SW.penLines(S, 'up'), 'G4 P0', '$SLP']), sleep(2500).then(() => serial.connected && !plotting)]);
  if (ok) { mcZeroSet = false; toast(t('manual.toast.motorsOff')); mcOriginChanged(); }
  return ok;
}
function mcReset() {
  if (!serial.connected) return toast(t('manual.toast.notConnected'));
  if (plotting) return toast(t('manual.toast.lockedDuringPlot'));
  serial.failAll('reset'); serial.rt('\x18'); mcZeroSet = false; log(t('manual.log.softReset'), 's'); mcOriginChanged();
}
/* the zero point changed → refresh everything that mentions it */
function mcOriginChanged() { mcWizRender(); SWUI.emit('origin'); }

$('#jog').onclick = e => { const b = e.target.closest('button[data-j]'); if (!b) return; const [dx, dy] = b.dataset.j.split(',').map(Number); mcJog(dx * jogStep, dy * jogStep); };
/* arrow keys on the pad (stopPropagation: the global arrow keys would move the selected object) */
$('#jog').addEventListener('keydown', e => {
  const d = { ArrowUp: '0,-1', ArrowDown: '0,1', ArrowLeft: '-1,0', ArrowRight: '1,0' }[e.key]; if (!d) return;
  e.preventDefault(); e.stopPropagation(); const [dx, dy] = d.split(',').map(Number); mcJog(dx * jogStep, dy * jogStep);
});
$('#jogPen').onclick = () => { if (penDown) mcPenUp(); else mcPenDown(); };
$('#cUp').onclick = mcPenUp;
$('#cDown').onclick = mcPenDown;
$('#cZero').onclick = mcZero;
$('#cGoZero').onclick = mcGoZero;
$('#cHome').onclick = mcHome;
$('#cUnlock').onclick = mcUnlock;
$('#cSleep').onclick = mcSleep;
$('#cReset').onclick = mcReset;
$('#machine').addEventListener('click', e => {
  const b = e.target.closest('[data-mc]'); if (!b) return;
  if (b.dataset.mc === 'connect') connectFlow();
  if (b.dataset.mc === 'unlock') mcUnlock();
});

const fmt0 = (v, d) => fmt(Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v, d);
function renderPos() {
  const ps = serial.connected && serial.pos;
  $('#posPage').textContent = ps ? `x ${fmt0(ps.page[0], 1)} · y ${fmt0(ps.page[1], 1)} mm` : '—';
  $('#posMach').textContent = ps ? `x ${fmt0(ps.mach[0], 2)} · y ${fmt0(ps.mach[1], 2)} · z ${fmt0(ps.mach[2], 2)}` : '—';
}
/* pen state, alarm and sleep notes in the control card */
function mcRenderPen() {
  const c = !!serial.connected, down = c && !!penDown, st = c ? String(serial.state || '').split(':')[0] : '';
  const b = $('#jogPen'); b.setAttribute('aria-pressed', down); b.classList.toggle('is-down', down);
  $('#mcPenState').textContent = c ? t(down ? 'mc.ctl.penIsDown' : 'mc.ctl.penIsUp') : '';
  $('#mcAlarm').hidden = st !== 'Alarm';
  $('#mcSleepNote').hidden = st !== 'Sleep';
  const lbl = dir => isZPen() ? 'Z ' + fmt(dir === 'up' ? S.penUp : S.penDown, 1) : (SW.penLines(S, dir)[0] || '–');
  $('#mcZUp').textContent = lbl('up'); $('#mcZDown').textContent = lbl('down');
  // only what this plotter can do (machine profile)
  $('#cHome').hidden = !S.canHome; $('#cSleep').hidden = !S.canSleep; $('#cUnlock').hidden = !S.canUnlock;
}
SWUI.on('profile', mcRenderPen);
SWUI.on('state', renderPos); SWUI.on('conn', () => { renderPos(); mcRenderPen(); });
SWUI.onRender(mcRenderPen);

/* plot lifecycle ↔ zero point: a plot in "current"/"home" mode sets its own zero (G92) at the start; afterwards the motors
 * are usually off (sleepAfter) and the pen may be moved by hand, so the next plot has to ask again. */
SWUI.on('plot', ph => {
  if (ph === 'start') { if (S.startMode !== 'keep') mcZeroSet = true; }
  else if (ph === 'done') { if (S.startMode !== 'keep') mcZeroSet = !S.sleepAfter; }
  else if (ph === 'abort') mcZeroSet = false;
  if (ph === 'start' || ph === 'done' || ph === 'abort') mcOriginChanged();
});

/* pre-flight: origin (zero point) – see docs/contract.md §3 */
SWUI.preflight.register({
  id: 'origin', order: 20,
  check() {
    const m = S.startMode, setup = { label: t('mc.pre.origin.setup'), run: () => mcOpenWizard(2) };
    if (m === 'home') return { state: 'info', label: S.homeOffX || S.homeOffY ? t('mc.pre.origin.homeOff', { x: fmt(S.homeOffX, 1), y: fmt(S.homeOffY, 1) }) : t('mc.pre.origin.home') };
    if (m === 'keep') return mcZeroSet ? { state: 'ok', label: t('mc.pre.origin.keep') } : { state: 'warn', confirm: true, label: t('mc.pre.origin.keepUnset'), detail: t('mc.pre.origin.keepUnsetDetail'), action: setup };
    return mcZeroSet ? { state: 'ok', label: t('mc.pre.origin.ok') } : { state: 'warn', confirm: true, label: t('mc.pre.origin.ask'), detail: t('mc.pre.origin.askDetail'), action: setup };
  }
});
