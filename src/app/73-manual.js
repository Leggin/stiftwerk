/* manual control */
let jogStep = +(sessionStorageGet('sw-jog') || 10);
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function renderJog() { $$('#jogStep button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === jogStep)); }
$('#jogStep').onclick = e => { const b = e.target.closest('button'); if (!b) return; jogStep = +b.dataset.v; try { sessionStorage.setItem('sw-jog', jogStep); } catch (er) { } renderJog(); };
const needConn = () => { if (!serial.connected) { toast(t('manual.toast.connectFirst')); return false; } if (plotting) { toast(t('manual.toast.lockedDuringPlot')); return false; } return true; };
$('#jog').onclick = e => {
  const b = e.target.closest('button[data-j]'); if (!b || !needConn()) return;
  const [dx, dy] = b.dataset.j.split(',').map(Number), { M } = SW.mapper(S), [a, c] = M(dx * jogStep, dy * jogStep);
  serial.send(['G91', `G1 X${SW.n3(a)} Y${SW.n3(c)} F${Math.min(S.travelF, 6000)}`, 'G90']).catch(() => { });
};
$('#jogPen').onclick = () => { if (needConn()) serial.send([penDown ? SW.penUpLine(S) : SW.penDownLine(S)]).catch(() => { }); };
$('#cUp').onclick = () => { if (needConn()) serial.send([SW.penUpLine(S)]).catch(() => { }); };
$('#cDown').onclick = () => { if (needConn()) serial.send([SW.penDownLine(S)]).catch(() => { }); };
$('#cZero').onclick = () => { if (needConn()) serial.send([SW.penUpLine(S), 'G92 X0 Y0']).then(() => toast(t('manual.toast.zeroSet'))).catch(() => { }); };
$('#cGoZero').onclick = () => { if (needConn()) serial.send([SW.penUpLine(S), `G1 G90 X0 Y0 F${S.travelF}`]).catch(() => { }); };
$('#cHome').onclick = () => { if (needConn()) { toast(t('manual.toast.homing')); serial.send([SW.penUpLine(S), '$H']).catch(() => { }); } };
$('#cUnlock').onclick = () => { if (needConn()) serial.send(['$X']).catch(() => { }); };
$('#cSleep').onclick = () => { if (needConn()) serial.send([SW.penUpLine(S), 'G4 P0', '$SLP']).then(() => toast(t('manual.toast.motorsOff'))).catch(() => { }); };
$('#cReset').onclick = async () => { if (!serial.connected) return toast(t('manual.toast.notConnected')); serial.failAll('reset'); serial.rt('\x18'); log(t('manual.log.softReset'), 's'); };
const fmt0 = (v, d) => fmt(Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v, d);
function renderPos() {
  const ps = serial.connected && serial.pos;
  $('#posPage').textContent = ps ? `x ${fmt0(ps.page[0], 1)} · y ${fmt0(ps.page[1], 1)} mm` : '—';
  $('#posMach').textContent = ps ? ps.mach.map(v => fmt0(v, 2)).join(' · ') : '—';
}
SWUI.on('state', renderPos); SWUI.on('conn', renderPos);
