#!/usr/bin/env python3
"""Dev tool: HTTP <-> serial bridge for debugging with the REAL plotter.

Serves dist/ plus:
  /debug.html   the app with tools/debug-serial.js injected: the browser's own Web Serial is used,
                every byte, JS error and app log line is mirrored into the log file.
  /bridge.html  the app with tools/bridge-client.js injected: navigator.serial is replaced by a port
                that tunnels through this server to the plotter (works in any browser, e.g. a preview pane).
  /serial/{open,write,read,close}, /log

Only use it deliberately – it moves real hardware.
usage: python3 tools/bridge.py [HTTP_PORT=8766] [SERIAL_DEV=auto] [LOGFILE=tools/bridge.log]"""
import os, sys, glob, termios, time, select, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, 'dist')
HTTP_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
DEV = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'auto' else None
LOG = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HERE, 'bridge.log')

def find_dev():
    c = sorted(glob.glob('/dev/cu.usbmodem*') + glob.glob('/dev/cu.usbserial*') + glob.glob('/dev/ttyACM*') + glob.glob('/dev/ttyUSB*'))
    return c[0] if c else None

lock = threading.Condition()
st = {'fd': None, 'rx': bytearray(), 'gen': 0}
t0 = time.time()
logf = open(LOG, 'a', buffering=1)
def log(*a): logf.write(f'{time.time() - t0:8.3f} ' + ' '.join(str(x) for x in a) + '\n')

def reader(fd, gen):
    while True:
        with lock:
            if st['fd'] != fd or st['gen'] != gen: return
        r, _, _ = select.select([fd], [], [], 0.2)
        if not r: continue
        try: d = os.read(fd, 4096)
        except (BlockingIOError, InterruptedError): continue
        except OSError as e: log('READ ERROR', e); return
        if not d: continue
        log('<', repr(d))
        with lock: st['rx'] += d; lock.notify_all()

def inject(script):
    html = open(os.path.join(DIST, 'stiftwerk.html'), encoding='utf-8').read()
    return html.replace('<body>', f'<body>\n<script src="/__tools/{script}"></script>', 1).encode('utf-8')

class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def reply(self, code, body=b'', ctype='text/plain'):
        self.send_response(code); self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n) if n else b''
        if self.path == '/serial/open':
            with lock:
                if st['fd'] is not None: return self.reply(409, b'already open')
                dev = DEV or find_dev()
                if not dev: return self.reply(404, b'no serial device found')
                try:
                    fd = os.open(dev, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
                except OSError as e:
                    log('OPEN FAILED', e); return self.reply(500, str(e).encode())
                a = termios.tcgetattr(fd)
                a[0] = 0; a[1] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL | termios.HUPCL; a[3] = 0
                a[4] = a[5] = termios.B115200; termios.tcsetattr(fd, termios.TCSANOW, a)
                st['fd'] = fd; st['rx'] = bytearray(); st['gen'] += 1
                threading.Thread(target=reader, args=(fd, st['gen']), daemon=True).start()
            log('OPEN', dev); return self.reply(200, b'ok')
        if self.path == '/serial/write':
            fd = st['fd']
            if fd is None: return self.reply(409, b'closed')
            log('>', repr(body))
            mv = memoryview(body)
            while mv:
                try: k = os.write(fd, mv); mv = mv[k:]
                except BlockingIOError: select.select([], [fd], [], 0.5)
            return self.reply(200, b'ok')
        if self.path == '/serial/close':
            with lock:
                fd = st['fd']; st['fd'] = None; lock.notify_all()
            if fd is not None: os.close(fd); log('CLOSE')
            return self.reply(200, b'ok')
        if self.path == '/log':
            log('PAGE', body.decode('utf-8', 'replace')); return self.reply(200, b'ok')
        self.reply(404)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p.startswith('/serial/read'):
            with lock:
                if st['fd'] is None: return self.reply(409, b'closed')
                if not st['rx']: lock.wait(0.5)
                d = bytes(st['rx']); st['rx'] = bytearray()
            return self.reply(200, d, 'application/octet-stream')
        if p == '/debug.html':
            log('SERVE debug.html to', self.headers.get('User-Agent'))
            return self.reply(200, inject('debug-serial.js'), 'text/html; charset=utf-8')
        if p == '/bridge.html':
            log('SERVE bridge.html to', self.headers.get('User-Agent'))
            return self.reply(200, inject('bridge-client.js'), 'text/html; charset=utf-8')
        if p.startswith('/__tools/') and p.endswith('.js') and '/' not in p[len('/__tools/'):]:
            f = os.path.join(HERE, p[len('/__tools/'):])
            if os.path.isfile(f): return self.reply(200, open(f, 'rb').read(), 'text/javascript')
        return super().do_GET()

log('bridge up on', HTTP_PORT, 'serving', DIST)
print(f'bridge on http://localhost:{HTTP_PORT}/  (debug.html, bridge.html) – log: {LOG}', flush=True)
ThreadingHTTPServer(('127.0.0.1', HTTP_PORT), functools.partial(H, directory=DIST)).serve_forever()
