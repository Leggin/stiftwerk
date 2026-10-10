// Instrumentation for the real browser's Web Serial: mirrors bytes, errors and the app console to /log.
(() => {
  const t0 = performance.now(), q = [];
  let busy = false;
  const L = (...a) => { q.push(((performance.now() - t0) / 1000).toFixed(3) + ' ' + a.join(' ')); flush(); };
  const flush = () => { if (busy || !q.length) return; busy = true; const body = q.splice(0).join('\n'); fetch('/log', { method: 'POST', body }).catch(() => { }).finally(() => { busy = false; flush(); }); };
  window.__L = L;
  L('LOAD', navigator.userAgent, 'serial' in navigator ? 'has navigator.serial' : 'NO navigator.serial', typeof SerialPort);
  window.addEventListener('error', e => L('JS ERROR', e.message, '@' + e.lineno + ':' + e.colno));
  window.addEventListener('unhandledrejection', e => L('UNHANDLED', e.reason && (e.reason.name + ': ' + e.reason.message + ' ' + (e.reason.stack || '')) || e.reason));
  const dec = new TextDecoder();
  function wrap(p) {
    if (p.__wrapped) return p; p.__wrapped = true;
    const proto = Object.getPrototypeOf(p);
    const rdesc = Object.getOwnPropertyDescriptor(proto, 'readable'), wdesc = Object.getOwnPropertyDescriptor(proto, 'writable');
    const open = p.open.bind(p), close = p.close.bind(p);
    p.open = async o => { L('OPEN call', JSON.stringify(o)); try { await open(o); L('OPEN ok'); } catch (e) { L('OPEN FAIL', e.name, e.message); throw e; } };
    p.close = async () => { L('CLOSE call'); try { await close(); L('CLOSE ok'); } catch (e) { L('CLOSE FAIL', e.name, e.message); throw e; } };
    const rc = new WeakMap(), wc = new WeakMap();
    Object.defineProperty(p, 'readable', { configurable: true, get() {
      const r = rdesc.get.call(p); if (!r) return r;
      if (!rc.has(r)) { const ts = new TransformStream({ transform(ch, c) { L('<', JSON.stringify(dec.decode(ch))); c.enqueue(ch); } }); r.pipeTo(ts.writable).catch(e => L('READ PIPE ERR', e && e.name, e && e.message)); rc.set(r, ts.readable); }
      return rc.get(r);
    } });
    Object.defineProperty(p, 'writable', { configurable: true, get() {
      const w = wdesc.get.call(p); if (!w) return w;
      if (!wc.has(w)) { const ts = new TransformStream({ transform(ch, c) { L('>', JSON.stringify(dec.decode(ch))); c.enqueue(ch); } }); ts.readable.pipeTo(w).catch(e => L('WRITE PIPE ERR', e && e.name, e && e.message)); wc.set(w, ts.writable); }
      return wc.get(w);
    } });
    return p;
  }
  if (navigator.serial) {
    const req = navigator.serial.requestPort.bind(navigator.serial);
    navigator.serial.requestPort = async (...a) => { L('requestPort'); try { const p = await req(...a); L('requestPort ->', JSON.stringify(p.getInfo ? p.getInfo() : {})); return wrap(p); } catch (e) { L('requestPort FAIL', e.name, e.message); throw e; } };
  }
  // mirror the app's own console panel
  let seen = 0;
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('console'); if (!el) return;
    new MutationObserver(() => { const lines = el.innerText.split('\n'); if (lines.length < seen) seen = 0; for (const l of lines.slice(seen)) L('APP', l); seen = lines.length; }).observe(el, { childList: true, characterData: true, subtree: true });
    document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) L('CLICK', b.id || '', JSON.stringify(b.innerText.trim().slice(0, 40))); }, true);
  });
})();
