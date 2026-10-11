// Screenshots for the README: node tools/screenshots.mjs  →  docs/screenshots/*.webp
// Builds the dev app (simulated plotter), opens it in headless Google Chrome (DevTools protocol, no dependencies),
// sets up a few scenes with the example designs from tools/plotart and captures them at 1440 × 900, 2× scale.
// Chrome path: set CHROME=/path/to/chrome if it is not in the default macOS location.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(root, 'docs', 'screenshots');
const W = 1440, H = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'stiftwerk-shots-'));
mkdirSync(OUT, { recursive: true });

const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' }); if (r.status) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`); };
run('python3', ['build.py', '--dev']);
run('python3', ['tools/plotart/examples/cat_newspaper.py', join(tmp, 'news.svg')]);
run('python3', ['tools/plotart/examples/voucher.py', '--en', join(tmp, 'voucher.svg')]);
const svg = name => readFileSync(join(tmp, name), 'utf8');

// ---- Chrome + DevTools protocol
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, 'profile')}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
let page = null;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { }
}
if (!page) { chrome.kill(); throw new Error('Chrome did not start (set CHROME=…)'); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map(); let seq = 0;
ws.onmessage = e => { const m = JSON.parse(e.data); const p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
/* run async code in the page; returns its (JSON) result */
async function js(body) {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { const D = window.SWDEBUG, F = window.__fakeGrbl; ${body} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const theme = scheme => cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
async function shot(name, settle = 300) {
  await js(`document.getElementById('toast').style.display = 'none'; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
  await sleep(settle);
  const r = await cdp('Page.captureScreenshot', { format: 'webp', quality: 90 });
  writeFileSync(join(OUT, name + '.webp'), Buffer.from(r.data, 'base64'));
  console.log(`docs/screenshots/${name}.webp`);
}
/* a new document (named, on the given sheet) with one imported SVG, all texts converted to plotter fonts
 * (the Hershey fonts load from the CDN) */
const importDesign = (text, name, fmt = 'A4', orient = 'portrait') => js(`
  await D.docNew();
  const f = document.getElementById('pgFmt'); f.value = ${JSON.stringify(fmt)}; f.dispatchEvent(new Event('change'));
  document.querySelector('#pgOrient [data-v="${orient}"]').click();
  await D.importFiles([new File([${JSON.stringify(text)}], ${JSON.stringify(name + '.svg')}, { type: 'image/svg+xml' })]);
  await D.docSaveNow(); D.docRename(D.curDocId, ${JSON.stringify(name)});
  const it = D.items[D.items.length - 1], ts = {};
  for (const [k, v] of Object.entries(it.textStyle || {})) ts[k] = Object.assign({}, v, { mode: 'plot' });
  it.textStyle = ts; D.invalidate(true);
  await new Promise(r => setTimeout(r, 5000)); D.invalidate(true);
  return it.id;`);
const step = name => js(`document.querySelector('[data-step="${name}"]').click(); await new Promise(r => setTimeout(r, 300));`);

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await theme('light');
  await cdp('Page.navigate', { url: pathToFileURL(join(root, 'dist', 'stiftwerk.dev.html')).href + '?lang=en' });
  await sleep(2000);

  // 1. first start: which plotter?
  await shot('picker');
  await js(`document.querySelector('[data-tpl="idraw2-a4"]').click();`);

  // 2. design: the cat newspaper, its texts in plotter fonts, the headline picked in "Texts & fonts"
  const news = await importDesign(svg('news.svg'), 'The Daily Whisker');
  await step('motiv');
  await js(`D.toggleSelect(${JSON.stringify(news)}); await new Promise(r => setTimeout(r, 300));
    document.querySelector('#props .tx-row[data-el="2"]')?.click(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('#props [data-sec="svgTexts"]')?.scrollIntoView({ block: 'start' });`);
  await shot('design');

  // 3. patterns & templates: a calendar
  await js(`D.toggleSelect(${JSON.stringify(news)}); document.querySelector('#btnAddGen').click(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('#dialog [data-kind="calendar"]')?.click(); await new Promise(r => setTimeout(r, 600));`);
  await shot('patterns');
  await js(`document.querySelector('#dialog [data-close]')?.click();`);

  // 4. pens: the voucher with two colours, one pen each
  await importDesign(svg('voucher.svg'), 'Voucher', 'A6', 'landscape');
  await step('pens');
  await js(`document.querySelector('[data-step-pane="pens"] button[data-set="multi"]').click(); await new Promise(r => setTimeout(r, 500));`);
  await shot('pens');

  // 5. plotting live (simulated plotter), dark theme
  await theme('dark');
  await step('plot');
  await js(`
    F.opts.timeScale = 1;
    await D.serial.connect(); await new Promise(r => setTimeout(r, 1800));
    await D.mcZero();
    D.startPlot();
    for (let i = 0; i < 40 && !D.plotting || i < 4; i++) {          // confirm the pre-flight and the first pen
      await new Promise(r => setTimeout(r, 400));
      document.querySelector('#modal:not([hidden]) #dGoAnyway, #modal:not([hidden]) #pnGo')?.click();
    }
    await new Promise(r => setTimeout(r, 4000));
    document.querySelector('#modal:not([hidden]) #pnGo')?.click();
    await new Promise(r => setTimeout(r, 22000));
`);
  await shot('plot');
  await js(`await D.stopPlot(true);`);
} finally {
  ws.close(); chrome.kill();
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
}
