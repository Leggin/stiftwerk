/* ---------------- serial / GRBL ---------------- */
const serial = {
  port: null, reader: null, writer: null, connected: false, keep: false, wchain: Promise.resolve(),
  queue: [], inflight: [], bytes: 0, hold: false, state: '—', wco: [0, 0, 0], poll: 0, lastLines: [],
  async connect() {
    if (!('serial' in navigator)) throw new Error('NOSERIAL');
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: +S.baud, bufferSize: 4096 });
    this.port = port; this.keep = true; this.writer = port.writable.getWriter();
    this.wchain = Promise.resolve(); this.queue = []; this.inflight = []; this.bytes = 0; this.hold = false;
    // Opening the port reboots the DrawCore board (banner after ~1.2 s). Anything sent before the
    // banner is swallowed, and a lost line shifts every later "ok" onto the wrong command.
    const banner = new Promise(r => this.onBanner = r);
    $('#connText').textContent = 'Plotter startet …';
    this.readLoop();
    await Promise.race([banner, sleep(2500)]);
    this.onBanner = null; this.connected = true;
    this.poll = setInterval(() => { if (this.connected) this.rt('?'); }, 300);
    this.send(['$I']).catch(() => { });
  },
  async disconnect() {
    clearInterval(this.poll); this.keep = false; this.connected = false;
    this.failAll('closed');
    try { await this.reader?.cancel(); } catch (e) { }
    try { this.writer?.releaseLock(); } catch (e) { }
    try { await this.port?.close(); } catch (e) { }
    this.port = null; this.state = '—'; pen = null; uiConn();
  },
  async readLoop() {
    const dec = new TextDecoder(); let buf = '';
    while (this.port && this.port.readable && this.keep) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.search(/[\r\n]/)) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onLine(line); }
        }
      } catch (e) { if (this.keep) log('Verbindung unterbrochen: ' + e.message, 'e'); }
      finally { try { this.reader.releaseLock(); } catch (e) { } }
      if (!this.keep) break;
      await sleep(50);
    }
  },
  write(str) { const data = new TextEncoder().encode(str); this.wchain = this.wchain.then(() => this.writer && this.writer.write(data)).catch(e => log('Schreibfehler: ' + e.message, 'e')); return this.wchain; },
  rt(ch) { return this.write(ch); },
  /* queue lines; resolves when the last one is acknowledged */
  send(lines, onAck) {
    return new Promise((resolve, reject) => {
      const L = lines.map(x => typeof x === 'string' ? { l: x } : x).filter(x => x.l && !x.l.startsWith(';'));
      if (!L.length) return resolve();
      L.forEach((x, i) => { x.cb = onAck; if (i === L.length - 1) { x.resolve = resolve; } x.reject = reject; });
      this.queue.push(...L); this.pump();
    });
  },
  pump() {
    while (!this.hold && this.queue.length && this.connected) {
      const x = this.queue[0], n = x.l.length + 1;
      if (S.stream === 'ack' ? this.inflight.length > 0 : (this.inflight.length && this.bytes + n > S.rxBuf)) break;
      this.queue.shift(); this.inflight.push(x); this.bytes += n; x.n = n;
      if ($('#logAll').checked || !plotting) log(x.l, 'o');
      this.write(x.l + '\n');
    }
  },
  onLine(line) {
    if (line[0] === '<') return this.onStatus(line);
    if (line === 'ok' || line.startsWith('error')) {
      const x = this.inflight.shift(); if (x) this.bytes -= x.n;
      if (line !== 'ok') { log(`${line}${x ? '  ← ' + x.l : ''}${GRBL_ERR[line.split(':')[1]] ? ' (' + GRBL_ERR[line.split(':')[1]] + ')' : ''}`, 'e'); if (plotting) plotState.errors++; }
      else if ($('#logAll').checked || !plotting) log('ok', 's');
      if (x) { if (x.cb && x.m) x.cb(x.m); if (x.resolve) x.resolve(); }
      this.pump(); return;
    }
    if (line.startsWith('ALARM')) { log(line + (ALARMS[line.split(':')[1]] ? ' – ' + ALARMS[line.split(':')[1]] : ''), 'e'); this.state = 'Alarm'; uiState(); if (plotting) stopPlot(false, 'Alarm vom Plotter: ' + line); return; }
    if (/^Grbl /i.test(line)) {
      // startup banner: the controller (re)booted, so nothing in flight will be acknowledged
      log(line, 's'); $('#connText').textContent = line.replace(/\[.*\]/, '').trim();
      if (this.onBanner) this.onBanner(); else this.failAll('reset');
      return;
    }
    if (/DrawCore/i.test(line)) { log(line, 's'); return; }
    if (/EBB|Err:/i.test(line)) { log(line, 'e'); showDialog(`<h3>Das sieht nach einem iDraw 1.x aus</h3><p class="hint">Der Plotter antwortet im EBB-Protokoll (AxiDraw-kompatibel). Stiftwerk spricht GRBL/G-Code wie die DrawCore-Platine des iDraw 2.0. Für 1.x-Modelle bleibt die AxiDraw-Erweiterung in Inkscape der Weg.</p><div class="row"><button class="btn primary" data-close>Verstanden</button></div>`); return; }
    log(line, 's');
  },
  onStatus(line) {
    const body = line.slice(1, -1).split('|'); this.state = body[0];
    let mpos = null, wpos = null;
    for (const f of body.slice(1)) { const [k, v] = f.split(':'); const n = (v || '').split(',').map(parseFloat); if (k === 'MPos') mpos = n; if (k === 'WPos') wpos = n; if (k === 'WCO') this.wco = n; }
    if (!wpos && mpos) wpos = mpos.map((v, i) => v - (this.wco[i] || 0));
    if (wpos) {
      const { inv } = SW.mapper(S), q = inv(wpos[0], wpos[1]); pen = q; penDown = wpos[2] > (S.penUp + S.penDown) / 2;
      $('#posPage').textContent = `x ${fmt(q[0])} · y ${fmt(q[1])} mm`;
      $('#posMach').textContent = `${wpos.map(v => fmt(v, 2)).join(' · ')}`;
      render();
    }
    uiState();
  },
  failAll(reason) { const all = this.inflight.concat(this.queue); this.inflight = []; this.queue = []; this.bytes = 0; const seen = new Set(); for (const x of all) if (x.reject && !seen.has(x.reject)) { seen.add(x.reject); x.reject(new Error(reason)); } }
};
let penDown = false;
const GRBL_ERR = { 1: 'unbekannter Befehl', 2: 'Zahl fehlt', 3: '$-Befehl unbekannt', 8: 'nicht im Leerlauf', 9: 'gesperrt – Referenzfahrt oder Entsperren', 15: 'Fahrweg überschritten', 20: 'nicht unterstützter Befehl', 22: 'Vorschub fehlt' };
const ALARMS = { 1: 'Endschalter ausgelöst', 2: 'Ziel außerhalb des Arbeitsbereichs', 3: 'Reset während der Bewegung – Position neu setzen', 8: 'Referenzfahrt fehlgeschlagen', 9: 'Referenzfahrt: Schalter nicht gefunden' };
if ('serial' in navigator) navigator.serial.addEventListener('disconnect', e => { if (serial.port && e.target === serial.port) { log('Plotter getrennt.', 'e'); if (plotting) stopPlot(false, 'Verbindung verloren'); serial.disconnect(); } });

