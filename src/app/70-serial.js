/* ---------------- serial / GRBL ---------------- */
const serial = {
  port: null, reader: null, writer: null, connected: false, phase: 'off', banner: '', pos: null, keep: false, wchain: Promise.resolve(),
  queue: [], inflight: [], bytes: 0, hold: false, state: '—', wco: [0, 0, 0], poll: 0, lastLines: [],
  // mpos = machine position, wcoAt = when the last WCO field arrived, session = counts connections (a new connection
  // or a reboot of the board loses the machine position), statusWaiters = statusNow() promises
  mpos: null, wcoAt: 0, session: 0, statusWaiters: [],
  // health: lastRxAt = anything received, probeAt = oldest status request still unanswered, resetAt = our last soft reset
  // (its banner is expected), boots = unexpected restarts of the board (they lose position and zero point),
  // wall/mono = clocks of the last poll (sleep detection: the wall clock moves on while the computer sleeps)
  lastRxAt: 0, probeAt: 0, resetAt: 0, boots: 0, sleptAt: 0, wall: 0, mono: 0, losing: false,
  async connect() {
    if (!('serial' in navigator)) throw new Error('NOSERIAL');
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: +S.baud, bufferSize: 4096 });
    this.baud = +S.baud; this.info = ''; this.family = null; this.lastAckAt = performance.now();
    this.port = port; this.keep = true; this.writer = port.writable.getWriter(); this.session++; this.mpos = null; this.wco = [0, 0, 0]; this.wcoAt = 0;
    this.wchain = Promise.resolve(); this.queue = []; this.inflight = []; this.bytes = 0; this.hold = false;
    // Opening the port reboots many boards (DrawCore: banner after ~1.2 s). Anything sent before the banner is
    // swallowed, and a lost line shifts every later "ok" onto the wrong command. Profiles of boards that don't
    // reboot set bootWait = false.
    const banner = new Promise(r => this.onBanner = r);
    this.phase = 'starting'; this.banner = ''; SWUI.emit('conn');
    this.readLoop();
    if (S.bootWait !== false) await Promise.race([banner, sleep(2500)]); else await sleep(150);
    this.onBanner = null; this.connected = true; this.phase = 'ready'; SWUI.emit('conn');
    // status reports: 5/s while plotting (live view), otherwise ~3/s – and the health checks (see health())
    this.lastRxAt = performance.now(); this.probeAt = 0; this.wall = Date.now(); this.mono = performance.now();
    const poll = () => {
      if (this.connected && this.health()) {
        if (!this.probeAt || this.lastRxAt >= this.probeAt) this.probeAt = performance.now();   // the oldest unanswered request counts
        this.rt('?');
        if (this.inflight.length && /^Idle/.test(this.state) && performance.now() - this.lastAckAt > 10000) this.stalled();
      }
      if (this.connected) this.poll = setTimeout(poll, plotting ? 200 : 300);
    };
    poll();
    // is this a GRBL controller at all? It must answer $I with "ok" (the banner alone is not enough when there is none)
    const ok = await Promise.race([this.send(['$I']).then(() => true, () => false), sleep(3000).then(() => false)]);
    if (!ok && !this.banner) { await this.disconnect(); throw new Error('NOTGRBL'); }
    machineDetected(this.banner + '\n' + this.info);
  },
  /* send one command and collect the lines it prints before its "ok" (e.g. "$$" → "$130=297.000" …) */
  query(cmd, timeout = 4000) {
    if (!this.connected) return Promise.reject(new Error('closed'));
    const buf = []; this.collect = buf;
    const end = () => { if (this.collect === buf) this.collect = null; };
    return Promise.race([this.send([cmd]).then(() => buf.join('\n')), sleep(timeout).then(() => { throw new Error('timeout'); })]).finally(end);
  },
  /* a line was sent but nothing came back for 10 s although the controller is idle: it was lost */
  stalled() {
    log(t('serial.log.stalled', { line: this.inflight[0].l }), 'e');
    this.failAll('timeout');
    if (plotting) stopPlot(false, t(this.recentlySlept() ? 'serial.stop.slept' : 'serial.stop.stalled'));
  },
  recentlySlept() { return this.sleptAt && performance.now() - this.sleptAt < 120000; },
  /* called by every poll; false = the connection was given up.
   *  - sleep: the wall clock jumped further than the monotonic clock → the computer was asleep (USB suspended)
   *  - dead: a status request ("?") has been unanswered for 4 s and nothing else came in either – only checked while
   *    plotting or while lines wait for an "ok" (an idle board in $SLP may not answer), and not right after our reset */
  health() {
    const now = performance.now(), wall = Date.now();
    const slept = (wall - this.wall) - (now - this.mono);
    this.wall = wall; this.mono = now;
    if (slept > 10000) {
      this.sleptAt = now; log(t('serial.log.slept', { min: fmt(slept / 60000, 1) }), 'e');
      this.probeAt = 0;   // ask again now, judge the answer
    }
    const busy = plotting || this.inflight.length > 0;
    if (busy && this.phase === 'ready' && this.probeAt && this.lastRxAt < this.probeAt && now - this.probeAt > 4000
        && now - this.resetAt > 4000 && !/^Sleep/.test(this.state)) {
      this.lost(t(this.recentlySlept() ? 'serial.stop.slept' : 'serial.stop.silent'));
      return false;
    }
    return true;
  },
  /* the connection is gone (no answers, write error, read side closed, device unplugged): close the port and tell
   * the plot (it ends; "Weiterplotten ab Linie N" stays available). Reconnecting restarts the board. */
  async lost(reason) {
    if (this.losing || !this.port) return;
    this.losing = true;
    const wasPlotting = plotting;
    log(reason, 'e');
    await this.disconnect();
    this.losing = false;
    if (wasPlotting) plotInterrupted(reason);
  },
  async disconnect() {
    clearTimeout(this.poll); this.keep = false; this.connected = false;
    this.failAll('closed');
    try { await this.reader?.cancel(); } catch (e) { }
    try { this.writer?.releaseLock(); } catch (e) { }
    try { await this.port?.close(); } catch (e) { }
    this.port = null; this.state = '—'; this.phase = 'off'; pen = null; SWUI.emit('conn');
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
      } catch (e) { if (this.keep) log(t('serial.log.readError', { msg: e.message }), 'e'); }
      finally { try { this.reader.releaseLock(); } catch (e) { } }
      if (!this.keep) break;
      await sleep(50);
    }
    // the read side is gone for good (device lost) while we still wanted it: the connection is dead
    if (this.keep && this.port) this.lost(t('serial.stop.connLost'));
  },
  write(str) {
    const data = new TextEncoder().encode(str);
    this.wchain = this.wchain.then(() => this.writer && this.writer.write(data)).catch(e => {
      log(t('serial.log.writeError', { msg: e.message }), 'e');
      if (this.port && !this.losing) this.lost(t('serial.stop.connLost'));   // a failing write means the device is gone
    });
    return this.wchain;
  },
  rt(ch) { if (ch === '\x18') this.resetAt = performance.now(); return this.write(ch); },
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
      this.queue.shift(); if (!this.inflight.length) this.lastAckAt = performance.now(); this.inflight.push(x); this.bytes += n; x.n = n;
      if (logAll() || !plotting) log(x.l, 'o');
      this.write(x.l + '\n');
    }
  },
  onLine(line) {
    this.lastRxAt = performance.now();
    if (line[0] === '<') return this.onStatus(line);
    if (line === 'ok' || line.startsWith('error')) {
      const x = this.inflight.shift(); if (x) this.bytes -= x.n; this.lastAckAt = performance.now();
      if (line !== 'ok') { log(`${line}${x ? '  ← ' + x.l : ''}${grblErrSuffix(line.split(':')[1])}`, 'e'); if (plotting) plotState.errors++; }
      else if (logAll() || !plotting) log('ok', 's');
      if (x) { if (x.cb && x.m) x.cb(x.m); if (x.resolve) x.resolve(); }
      this.pump(); return;
    }
    if (line.startsWith('ALARM')) { log(line + alarmSuffix(line.split(':')[1]), 'e'); this.state = 'Alarm'; SWUI.emit('state'); if (plotting) stopPlot(false, t('serial.stop.alarm', { line })); return; }
    if (this.collect) this.collect.push(line);
    if (/^\[(VER|OPT):/.test(line)) { this.info += line + '\n'; log(line, 's'); return; }
    if (/^Grbl(HAL)?\b/i.test(line)) {
      // startup banner: the controller (re)booted, so nothing in flight will be acknowledged
      log(line, 's'); this.banner = line.replace(/\[.*\]/, '').trim(); SWUI.emit('conn');
      if (this.onBanner) { this.onBanner(); return; }
      // a banner we did not cause with a soft reset: the board restarted (power, USB, brown-out) – the machine position
      // and the zero point are gone, and every line in flight is lost
      const expected = performance.now() - this.resetAt < 4000;
      if (!expected) { this.boots++; log(t('serial.log.rebooted'), 'e'); if (typeof mcZeroSet !== 'undefined') { mcZeroSet = false; mcOriginChanged(); } }
      const wasPlotting = plotting;
      this.failAll('reset');
      if (!expected && wasPlotting) plotInterrupted(t('serial.stop.rebooted'));
      return;
    }
    if (/DrawCore/i.test(line)) { log(line, 's'); return; }
    if (/EBB|Err:/i.test(line)) { log(line, 'e'); showDialog(`<h3>${tHtml('serial.ebb.title')}</h3><p class="hint">${tHtml('serial.ebb.body')}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.ok')}</button></div>`); return; }
    log(line, 's');
  },
  onStatus(line) {
    const body = line.slice(1, -1).split('|'); this.state = body[0];
    let mpos = null, wpos = null;
    for (const f of body.slice(1)) { const [k, v] = f.split(':'); const n = (v || '').split(',').map(parseFloat); if (k === 'MPos') mpos = n; if (k === 'WPos') wpos = n; if (k === 'WCO') { this.wco = n; this.wcoAt = performance.now(); } }
    if (!wpos && mpos) wpos = mpos.map((v, i) => v - (this.wco[i] || 0));
    this.mpos = mpos || (wpos && wpos.map((v, i) => v + (this.wco[i] || 0))) || this.mpos;
    if (wpos) {
      const { inv } = SW.mapper(S), q = inv(wpos[0], wpos[1]); pen = q;
      // pen state from Z only for a Z-axis pen (closer to 'down' than to 'up'); servo/G-code pens: the last command sent (73-manual)
      if (isZPen()) penDown = Math.abs(wpos[2] - S.penDown) < Math.abs(wpos[2] - S.penUp);
      this.pos = { page: q, mach: wpos };
      render();
    }
    SWUI.emit('state');
    for (const w of this.statusWaiters.splice(0)) w(true);
  },
  /* ask for a status report now and wait for it (false after ms without one) */
  statusNow(ms = 1000) {
    if (!this.connected) return Promise.resolve(false);
    return new Promise(res => {
      const w = ok => { clearTimeout(tm); res(ok); }, tm = setTimeout(() => { const i = this.statusWaiters.indexOf(w); if (i >= 0) this.statusWaiters.splice(i, 1); res(false); }, ms);
      this.statusWaiters.push(w); this.rt('?');
    });
  },
  failAll(reason) { const all = this.inflight.concat(this.queue); this.inflight = []; this.queue = []; this.bytes = 0; const seen = new Set(); for (const x of all) if (x.reject && !seen.has(x.reject)) { seen.add(x.reject); x.reject(new Error(reason)); } }
};
let penDown = false;
const grblErrSuffix = c => I18N.has('serial.grblErr.' + c) ? ' (' + t('serial.grblErr.' + c) + ')' : '';
const alarmSuffix = c => I18N.has('serial.alarm.' + c) ? ' – ' + t('serial.alarm.' + c) : '';
if ('serial' in navigator) navigator.serial.addEventListener('disconnect', e => { if (serial.port && e.target === serial.port) { log(t('serial.log.deviceGone'), 'e'); serial.lost(t('serial.stop.connLost')); } });

