/* ---------------- Maschine drawer: connection card, locks, card state ---------------- */
/* Which parts of the drawer are usable:  data-mc-lock="conn"      → needs a connection and no running plot
 *                                        data-mc-lock="conn-soft" → needs a connection (console also works while plotting)
 *                                        data-mc-lock="plot"      → only locked while plotting (settings) */
function mcApplyLocks() {
  const c = !!serial.connected, busy = !!plotting, reason = busy ? 'plot' : !c ? 'conn' : '';
  for (const el of $$('#machine [data-mc-lock]')) {
    const k = el.dataset.mcLock, off = k === 'plot' ? busy : k === 'conn-soft' ? !c : (busy || !c);
    if (el.disabled !== off) el.disabled = off;
  }
  for (const el of $$('#machine [data-mc-need]')) {
    el.hidden = !reason;
    const tx = el.querySelector('[data-mc-need-t]'), b = el.querySelector('button');
    if (tx) tx.textContent = t(busy ? 'mc.need.plot' : 'mc.need.conn');
    if (b) b.hidden = busy;
  }
  const np = $('[data-mc-need-plot]'); if (np) np.hidden = !busy;
  const bc = $('#btnConnect'); if (bc) { bc.disabled = serial.phase === 'starting' || (c && busy); bc.title = c && busy ? t('conn.toast.abortPlotFirst') : ''; }
  const cmd = $('#cmdIn'); if (cmd) cmd.placeholder = c ? t('mc.log.cmdPh') : t('mc.need.conn');
}
function uiConn() {
  const c = serial.connected, starting = serial.phase === 'starting';
  $('#connChip').className = 'chip mc-status' + (c ? ' ok' : starting ? ' run' : '');
  $('#connText').textContent = c ? t('conn.status.connected') : starting ? t('serial.status.starting') : t('conn.status.notConnected');
  const bn = $('#mcBanner'); bn.hidden = !(c && serial.banner); bn.textContent = serial.banner || '';
  const b = $('#btnConnect'); b.className = 'btn mc-btn ' + (c ? 'ghost' : 'primary prominent');
  $('#btnConnectLbl').textContent = c ? t('conn.btn.disconnect') : t('conn.btn.connect');
  $('#mcConnHint').textContent = !('serial' in navigator) ? t('mc.conn.hintNoSerial') : c ? t('mc.conn.hintOn', { baud: S.baud }) : starting ? t('mc.conn.hintStarting') : t('mc.conn.hintOff');
  uiState(); mcApplyLocks();
  if (typeof renderPlotBtns === 'function') renderPlotBtns();
}
function uiState() {
  const c = serial.connected, s = c ? serial.state : '—', chip = $('#stateChip');
  chip.hidden = !c;
  const map = { Idle: ['ok', t('conn.state.idle')], Run: ['run', t('conn.state.run')], Hold: ['warn', t('conn.state.hold')], Jog: ['run', t('conn.state.jog')], Alarm: ['bad', t('conn.state.alarm')], Home: ['run', t('conn.state.home')], Sleep: ['warn', t('conn.state.sleep')], Door: ['warn', t('conn.state.door')], Check: ['warn', t('conn.state.check')] };
  const key = (s || '').split(':')[0], [cls, label] = map[key] || ['', s];
  chip.className = 'chip ' + cls; chip.querySelector('span').textContent = label || '—';
  if (typeof mcRenderPen === 'function') mcRenderPen();
}
$('#btnConnect').onclick = async () => {
  if (serial.connected) { if (plotting) return toast(t('conn.toast.abortPlotFirst')); await serial.disconnect(); log(t('conn.log.disconnected'), 's'); return; }
  await connectFlow();
};
async function connectFlow() {
  try { await serial.connect(); uiConn(); toast(t('conn.toast.connected')); log(t('conn.log.connected', { baud: S.baud }), 's'); return true; }
  catch (e) {
    if (e.message === 'NOSERIAL') showDialog(`<h3>${tHtml('conn.dialog.noSerial.title')}</h3><p class="hint">${tHtml('conn.dialog.noSerial.body')}</p><p class="hint">${tHtml('conn.dialog.noSerial.preview')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.ok')}</button></div>`);
    else if (e.name === 'SecurityError') showDialog(`<h3>${tHtml('conn.dialog.security.title')}</h3><p class="hint">${tHtml('conn.dialog.security.body')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.ok')}</button></div>`);
    else if (e.name === 'NotFoundError') { /* user closed the chooser */ }
    else if (e.name === 'InvalidStateError') toast(t('conn.toast.portBusy'));
    else showDialog(`<h3>${tHtml('conn.dialog.failed.title')}</h3><p class="hint">${esc(e.message)}</p><p class="hint">${tHtml('conn.dialog.failed.hint')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`);
    uiConn();
    return false;
  }
}
SWUI.on('conn', () => { if (!serial.connected) mcZeroSet = false; uiConn(); if (typeof mcWizRender === 'function') mcWizRender(); });
SWUI.on('state', uiState);
SWUI.on('plot', ph => { if (ph !== 'tick') { mcApplyLocks(); } });

/* cards: open/closed state is remembered for the session */
const MC_CARDS_KEY = 'sw-mc-cards';
function mcCardsInit() {
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem(MC_CARDS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  for (const d of $$('#machine details[data-mc-card]')) {
    const k = d.dataset.mcCard; if (k in saved) d.open = !!saved[k];
    d.addEventListener('toggle', () => {
      saved[k] = d.open; try { sessionStorage.setItem(MC_CARDS_KEY, JSON.stringify(saved)); } catch (e) { }
      if (k === 'log' && d.open) { $('#mcLogBadge').hidden = true; mcLogToEnd(); }
    });
  }
}
mcCardsInit();
/* open the drawer on a card ('conn' | 'wiz' | 'ctl' | 'set' | 'log'); other files can call this */
function mcOpenSection(name, focusSel) {
  if (!SWUI.machine.isOpen) SWUI.machine.open();
  const card = $('#machine [data-mc-card="' + name + '"]'); if (!card) return;
  card.open = true;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    card.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    const f = focusSel && card.querySelector(focusSel); if (f && !f.disabled) f.focus({ preventScroll: true });
  });
}
/* the drawer is a non-modal sheet: put keyboard focus into it when it opens */
SWUI.on('machine', open => { if (open) { mcApplyLocks(); const h = $('#machineTitle'); if (h) h.focus({ preventScroll: true }); mcLogToEnd(); } });

/* pre-flight: connection (see docs/contract.md §3) */
SWUI.preflight.register({
  id: 'connection', order: 10,
  check() {
    if (serial.phase === 'starting') return { state: 'info', label: t('serial.status.starting') };
    if (!serial.connected) return { state: 'info', label: t('mc.pre.conn.off'), action: { label: t('mc.pre.conn.connect'), run: () => connectFlow() } };
    if (/^Alarm/.test(serial.state)) return { state: 'block', label: t('mc.pre.conn.alarm'), detail: t('mc.pre.conn.alarmDetail'), action: { label: t('mc.pre.conn.unlock'), run: () => mcUnlock() } };
    return { state: 'ok', label: serial.banner ? t('mc.pre.conn.ok', { banner: serial.banner }) : t('conn.status.connected') };
  }
});
