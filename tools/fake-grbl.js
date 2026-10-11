/* Dev tool: a simulated iDraw 2.0 (GRBL 1.1h "DrawCore V2.12") behind a fake navigator.serial.
 * Mirrors what was measured on the real board (see docs/entwicklung.md):
 *  - opening the port reboots the board: input in the first bootMs is swallowed, then the banner arrives
 *  - every line gets exactly one "ok" (or "error:N"); "?" answers a status report; 0x18 = soft reset + banner
 *  - motion is real-time-ish: moves go into a 15-block planner and are executed at their feed rate (× opts.timeScale);
 *    "ok" for a move comes when it enters the planner (so acknowledgements run ahead of the pen, like real GRBL);
 *    G4 waits for the planner to empty; status reports show the interpolated position: <Run|MPos:x,y,z|FS:f,0>
 * Injected by `python3 build.py --dev` (dist/stiftwerk.dev.html). Inspect window.__fakeGrbl: { sent, lost, opts, reset() }.
 * window.__fakeGrblOpts = { bootMs, timeScale (0.05 = 20× faster than real), planner } before load to tweak. */
(() => {
  const opts = { bootMs: 1200, timeScale: 0.1, planner: 15, ...(window.__fakeGrblOpts || {}) };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const banner = "\r\nGrbl 1.1h DrawCore V2.12 ['$' for help]\r\n";
  const F = { sent: [], lost: [], opts, state: 'Idle', wco: [0, 0, 0], abs: true, feed: 1000, reports: 0 };
  let ctrl = null, openedAt = 0, buf = '', open = false;
  const moves = [];                 // planner: { a:[x,y,z], b:[x,y,z], dur(ms), start? } or { dwell: ms }
  const waiting = [];               // lines read but not yet accepted (planner full / G4 waiting)
  let pos = [0, 0, 0], end = [0, 0, 0], hold = false, holdAt = 0;
  const out = s => { if (open && ctrl) { try { ctrl.enqueue(enc.encode(s)); } catch (e) { } } };
  const n3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
  /* advance the motion simulation to now */
  function step(now) {
    if (hold) return;
    while (moves.length) {
      const m = moves[0];
      if (m.start == null) m.start = now;
      const dur = m.dur * opts.timeScale, f = dur > 0 ? (now - m.start) / dur : 1;
      if (f < 1) { if (m.a) pos = m.a.map((v, i) => v + (m.b[i] - v) * f); return; }
      if (m.b) pos = m.b.slice();
      moves.shift();
      if (moves.length) moves[0].start = m.start + dur;
      pump(now);
    }
  }
  function status() {
    const now = performance.now(); step(now);
    if (F.state !== 'Alarm' && F.state !== 'Sleep') F.state = hold ? 'Hold:0' : moves.length ? 'Run' : 'Idle';
    const wco = (F.reports++ % 10 === 0) ? `|WCO:${F.wco.map(n3).join(',')}` : '';
    return `<${F.state}|MPos:${pos.map(n3).join(',')}|FS:${moves.length ? Math.round(F.feed) : 0},0${wco}>\r\n`;
  }
  /* accept waiting lines while the planner has room */
  function pump(now) {
    while (waiting.length) {
      const line = waiting[0];
      if (/^G4\b|\bG4\b/i.test(line) && moves.some(m => m.a)) return;      // dwell waits for motion to finish
      if (moves.length >= opts.planner) return;
      waiting.shift(); F.sent.push(line.trim()); out(exec(line, now) + '\r\n');
    }
  }
  function exec(line, now) {
    const l = line.replace(/\(.*?\)|;.*$/g, '').trim().toUpperCase();
    if (!l) return 'ok';
    if (l === '$I') return '[VER:1.1h DrawCore V2.12.20240704:]\r\n[OPT:VZHDL,15,128]\r\nok';
    if (l === '$X') { if (F.state === 'Alarm') F.state = 'Idle'; return '[MSG:Caution: Unlocked]\r\nok'; }
    if (l === '$H') { moves.length = 0; pos = [0, 0, 0]; end = [0, 0, 0]; F.state = 'Idle'; return 'ok'; }
    if (l === '$SLP') { F.state = 'Sleep'; return 'ok'; }
    if (l === '$$') return '$0=5\r\n$10=1\r\n$22=1\r\n$130=210.000\r\n$131=297.000\r\n$132=10.000\r\nok';
    if (l === '$G') return `[GC:G1 G54 G17 G21 ${F.abs ? 'G90' : 'G91'} G94 M5 M9 T0 F0 S0]\r\nok`;
    if (l.startsWith('$')) return 'error:3';
    if (F.state === 'Alarm') return 'error:9';
    if (F.state === 'Sleep') return 'error:8';
    const words = {}; for (const m of l.matchAll(/([A-Z])(-?\d*\.?\d+)/g)) (words[m[1]] = words[m[1]] || []).push(parseFloat(m[2]));
    const g = words.G || [];
    if (g.includes(90)) F.abs = true;
    if (g.includes(91)) F.abs = false;
    if (words.F) F.feed = words.F[0];
    if (g.includes(92)) { ['X', 'Y', 'Z'].forEach((a, i) => { if (words[a]) F.wco[i] = end[i] - words[a][0]; }); return 'ok'; }
    if (g.includes(4)) { const ms = (words.P ? words.P[0] : 0) * 1000; if (ms > 0) moves.push({ dwell: true, dur: ms }); return 'ok'; }
    const b = ['X', 'Y', 'Z'].map((a, i) => words[a] ? (F.abs ? words[a][0] + F.wco[i] : end[i] + words[a][0]) : end[i]);
    const d = Math.hypot(b[0] - end[0], b[1] - end[1], b[2] - end[2]);
    if (d > 0) { moves.push({ a: end.slice(), b, dur: d / Math.max(1, F.feed) * 60000 }); end = b; if (moves.length === 1) moves[0].start = now; }
    return 'ok';
  }
  function onBytes(s) {
    const now = performance.now(), booting = now - openedAt < opts.bootMs;
    for (const ch of s) {
      if (booting) { F.lost.push(ch); continue; }
      if (ch === '?') { out(status()); continue; }
      if (ch === '!') { step(now); if (moves.length) { hold = true; holdAt = now; } continue; }
      if (ch === '~') { if (hold) { hold = false; if (moves[0] && moves[0].start != null) moves[0].start += now - holdAt; pump(now); } continue; }
      if (ch === '\x18') {
        step(now); const wasMoving = moves.some(m => m.a) || hold;
        moves.length = 0; waiting.length = 0; hold = false; buf = ''; end = pos.slice(); F.wco = [0, 0, 0]; F.abs = true;
        F.state = wasMoving ? 'Alarm' : 'Idle'; out(banner + (wasMoving ? 'ALARM:3\r\n' : '')); continue;
      }
      if (ch === '\n' || ch === '\r') { const line = buf; buf = ''; if (!line.trim()) continue; step(now); waiting.push(line); pump(now); continue; }
      buf += ch;
    }
  }
  let ticker = 0;
  const port = {
    readable: null, writable: null,
    async open() {
      if (open) { const e = new Error('The port is already open.'); e.name = 'InvalidStateError'; throw e; }
      open = true; openedAt = performance.now(); F.state = 'Idle'; pos = [0, 0, 0]; end = [0, 0, 0]; F.wco = [0, 0, 0]; buf = ''; moves.length = 0; waiting.length = 0; hold = false;
      this.readable = new ReadableStream({ start(c) { ctrl = c; } });
      this.writable = new WritableStream({ write(chunk) { onBytes(dec.decode(chunk)); } });
      setTimeout(() => out(banner), opts.bootMs);
      ticker = setInterval(() => { const now = performance.now(); step(now); pump(now); }, 20);
    },
    async close() { open = false; clearInterval(ticker); try { ctrl && ctrl.close(); } catch (e) { } ctrl = null; },
    getInfo() { return { usbVendorId: 6790, usbProductId: 32832, fake: true }; }
  };
  F.reset = () => { F.sent.length = 0; F.lost.length = 0; };
  window.__fakeGrbl = F;
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port, getPorts: async () => [port], addEventListener() { }, removeEventListener() { } } });
})();
