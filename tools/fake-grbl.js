/* Dev tool: a simulated iDraw 2.0 (GRBL 1.1h "DrawCore V2.12") behind a fake navigator.serial.
 * Mirrors what was measured on the real board (see docs/entwicklung.md):
 *  - opening the port reboots the board: input in the first BOOT_MS is swallowed, then the banner arrives
 *  - every line gets exactly one "ok" (or "error:N"), "?" answers a status report, 0x18 = soft reset + banner
 *  - $10=1 style reports: <State|MPos:x,y,z|FS:f,0> plus |WCO:...| every few reports
 * Injected by `python3 build.py --dev` (dist/stiftwerk.dev.html) or by pasting into a console.
 * Inspect with window.__fakeGrbl: { sent, lost, opts, reset(), state }. */
(() => {
  const opts = { bootMs: 1200, lineDelayMs: 2, mmPerSec: 400, ...(window.__fakeGrblOpts || {}) };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const banner = "\r\nGrbl 1.1h DrawCore V2.12 ['$' for help]\r\n";
  const F = { sent: [], lost: [], opts, state: 'Idle', mpos: [0, 0, 0], wco: [0, 0, 0], abs: true, reports: 0 };
  let ctrl = null, openedAt = 0, buf = '', busyUntil = 0, open = false, queue = Promise.resolve();
  const out = s => { if (open && ctrl) setTimeout(() => { try { ctrl.enqueue(enc.encode(s)); } catch (e) { } }, opts.lineDelayMs); };
  const n3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
  const status = () => {
    const now = performance.now(); if (F.state === 'Run' && now >= busyUntil) F.state = 'Idle';
    const wco = (F.reports++ % 10 === 0) ? `|WCO:${F.wco.map(n3).join(',')}` : '';
    return `<${F.state}|MPos:${F.mpos.map(n3).join(',')}|FS:0,0${wco}>\r\n`;
  };
  function exec(line) {
    const l = line.replace(/\(.*?\)|;.*$/g, '').trim().toUpperCase();
    if (!l) return 'ok';
    if (l === '$I') return '[VER:1.1h DrawCore V2.12.20240704:]\r\n[OPT:VZHDL,15,128]\r\nok';
    if (l === '$X') { if (F.state === 'Alarm') F.state = 'Idle'; return '[MSG:Caution: Unlocked]\r\nok'; }
    if (l === '$H') { F.mpos = [0, 0, 0]; F.state = 'Idle'; return 'ok'; }
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
    if (g.includes(92)) { ['X', 'Y', 'Z'].forEach((a, i) => { if (words[a]) F.wco[i] = F.mpos[i] - words[a][0]; }); return 'ok'; }
    if (g.includes(4)) return 'ok';
    const axes = ['X', 'Y', 'Z'].map((a, i) => words[a] ? (F.abs ? words[a][0] + F.wco[i] : F.mpos[i] + words[a][0]) : F.mpos[i]);
    const d = Math.hypot(axes[0] - F.mpos[0], axes[1] - F.mpos[1]);
    if (axes.some((v, i) => v !== F.mpos[i])) {
      F.mpos = axes; F.state = 'Run';
      busyUntil = Math.max(busyUntil, performance.now()) + d / opts.mmPerSec * 1000;
    }
    return 'ok';
  }
  function onBytes(s) {
    const booting = performance.now() - openedAt < opts.bootMs;
    for (const ch of s) {
      if (booting) { F.lost.push(ch); continue; }
      if (ch === '?') { out(status()); continue; }
      if (ch === '!') { if (F.state === 'Run') F.state = 'Hold:0'; continue; }
      if (ch === '~') { if (/^Hold/.test(F.state)) F.state = 'Run'; continue; }
      if (ch === '\x18') { const wasMoving = F.state === 'Run' || /^Hold/.test(F.state); buf = ''; F.wco = [0, 0, 0]; F.abs = true; F.state = wasMoving ? 'Alarm' : 'Idle'; out(banner + (wasMoving ? 'ALARM:3\r\n' : '')); continue; }
      if (ch === '\n' || ch === '\r') { const line = buf; buf = ''; if (!line.trim()) continue; F.sent.push(line.trim()); out(exec(line) + '\r\n'); continue; }
      buf += ch;
    }
  }
  const port = {
    readable: null, writable: null,
    async open() {
      if (open) { const e = new Error('The port is already open.'); e.name = 'InvalidStateError'; throw e; }
      open = true; openedAt = performance.now(); F.state = 'Idle'; F.mpos = [0, 0, 0]; F.wco = [0, 0, 0]; buf = '';
      this.readable = new ReadableStream({ start(c) { ctrl = c; } });
      this.writable = new WritableStream({ write(chunk) { onBytes(dec.decode(chunk)); } });
      setTimeout(() => out(banner), opts.bootMs);
    },
    async close() { open = false; try { ctrl && ctrl.close(); } catch (e) { } ctrl = null; },
    getInfo() { return { usbVendorId: 6790, usbProductId: 32832, fake: true }; }
  };
  F.reset = () => { F.sent.length = 0; F.lost.length = 0; };
  window.__fakeGrbl = F;
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port, getPorts: async () => [port], addEventListener() { }, removeEventListener() { } } });
})();
