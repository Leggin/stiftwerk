// Replaces navigator.serial with a port that tunnels to bridge.py (same origin).
(() => {
  let alive = false;
  const port = {
    readable: null, writable: null,
    async open() {
      const r = await fetch('/serial/open', { method: 'POST' });
      if (!r.ok) { const e = new Error(await r.text()); e.name = 'NetworkError'; throw e; }
      alive = true;
      this.readable = new ReadableStream({
        async pull(c) {
          for (;;) {
            if (!alive) { c.close(); return; }
            const res = await fetch('/serial/read');
            if (!res.ok) { alive = false; c.close(); return; }
            const b = new Uint8Array(await res.arrayBuffer());
            if (b.length) { c.enqueue(b); return; }
          }
        },
        cancel() { }
      });
      this.writable = new WritableStream({ async write(chunk) { await fetch('/serial/write', { method: 'POST', body: chunk }); } });
    },
    async close() { alive = false; await fetch('/serial/close', { method: 'POST' }); },
    getInfo() { return { bridge: true }; }
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port, addEventListener() { }, getPorts: async () => [port] } });
  window.addEventListener('error', e => fetch('/log', { method: 'POST', body: 'JS ERROR ' + e.message + ' @' + e.lineno }));
  window.addEventListener('unhandledrejection', e => fetch('/log', { method: 'POST', body: 'UNHANDLED ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason) }));
  return 'bridge serial installed';
})();
