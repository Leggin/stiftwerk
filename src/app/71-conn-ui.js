function uiConn() {
  const c = serial.connected;
  $('#connChip').className = 'chip' + (c ? ' ok' : '');
  $('#connText').textContent = c ? (serial.banner || t('conn.status.connected')) : serial.phase === 'starting' ? t('serial.status.starting') : t('conn.status.notConnected');
  $('#btnConnect').textContent = c ? t('conn.btn.disconnect') : t('conn.btn.connect');
  $('#btnConnect').className = 'btn ' + (c ? '' : 'primary');
  uiState(); renderPlotBtns();
}
function uiState() {
  const s = serial.connected ? serial.state : '—', chip = $('#stateChip');
  const map = { Idle: ['ok', t('conn.state.idle')], Run: ['run', t('conn.state.run')], Hold: ['warn', t('conn.state.hold')], Jog: ['run', t('conn.state.jog')], Alarm: ['bad', t('conn.state.alarm')], Home: ['run', t('conn.state.home')], Sleep: ['warn', t('conn.state.sleep')], Door: ['warn', t('conn.state.door')], Check: ['warn', t('conn.state.check')] };
  const key = (s || '').split(':')[0], [cls, label] = map[key] || ['', s];
  chip.className = 'chip ' + cls; chip.querySelector('span').textContent = label || '—';
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
    return false;
  }
}
SWUI.on('conn', uiConn);
SWUI.on('state', uiState);
