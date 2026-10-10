function uiConn() {
  const c = serial.connected;
  $('#connChip').className = 'chip' + (c ? ' ok' : '');
  if (!c) $('#connText').textContent = 'Nicht verbunden';
  $('#btnConnect').textContent = c ? 'Trennen' : 'Plotter verbinden';
  $('#btnConnect').className = 'btn ' + (c ? '' : 'primary');
  uiState(); renderPlotBtns();
}
function uiState() {
  const s = serial.connected ? serial.state : '—', chip = $('#stateChip');
  const map = { Idle: ['ok', 'Bereit'], Run: ['run', 'Fährt'], Hold: ['warn', 'Angehalten'], Jog: ['run', 'Fährt'], Alarm: ['bad', 'Gesperrt'], Home: ['run', 'Referenzfahrt'], Sleep: ['warn', 'Motoren aus'], Door: ['warn', 'Tür'], Check: ['warn', 'Prüfmodus'] };
  const key = (s || '').split(':')[0], [cls, label] = map[key] || ['', s];
  chip.className = 'chip ' + cls; chip.querySelector('span').textContent = label || '—';
}
$('#btnConnect').onclick = async () => {
  if (serial.connected) { if (plotting) return toast('Erst den Plot abbrechen'); await serial.disconnect(); log('Getrennt.', 's'); return; }
  await connectFlow();
};
async function connectFlow() {
  try { await serial.connect(); uiConn(); toast('Plotter verbunden'); log('Verbunden mit ' + S.baud + ' Baud.', 's'); return true; }
  catch (e) {
    if (e.message === 'NOSERIAL') showDialog(`<h3>Dieser Browser kann nicht per USB verbinden</h3><p class="hint">Stiftwerk nutzt Web Serial. Das gibt es in <b>Chrome</b>, <b>Edge</b>, <b>Opera</b> und <b>Brave</b> am Desktop – nicht in Safari, Firefox oder auf dem Handy.</p><p class="hint">Die Vorschau und der G-Code-Export funktionieren trotzdem.</p><div class="row"><button class="btn primary" data-close>Verstanden</button></div>`);
    else if (e.name === 'SecurityError') showDialog(`<h3>USB ist in dieser Ansicht gesperrt</h3><p class="hint">Die eingebettete Ansicht erlaubt keinen Zugriff auf serielle Geräte. Öffne die Datei <b>stiftwerk.html</b> direkt in Chrome oder Edge – dann klappt die Verbindung.</p><div class="row"><button class="btn primary" data-close>Verstanden</button></div>`);
    else if (e.name === 'NotFoundError') { /* user closed the chooser */ }
    else if (e.name === 'InvalidStateError') toast('Der Anschluss ist schon offen – ggf. Inkscape schließen');
    else showDialog(`<h3>Verbindung fehlgeschlagen</h3><p class="hint">${esc(e.message)}</p><p class="hint">Prüfe das USB-Kabel, ob der Plotter eingeschaltet ist und ob ein anderes Programm (z. B. Inkscape) den Anschluss belegt.</p><div class="row"><button class="btn primary" data-close>Schließen</button></div>`);
    return false;
  }
}

