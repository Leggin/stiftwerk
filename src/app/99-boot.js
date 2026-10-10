/* ---------------- sample & boot ---------------- */
const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="104mm" viewBox="0 0 150 104">
<circle cx="112" cy="26" r="15" fill="#d9472b" stroke="#d9472b" stroke-width=".4"/>
<path d="M2 84 L34 40 L52 62 L74 28 L104 70 L118 58 L148 84" fill="none" stroke="#1d2433" stroke-width=".5"/>
<path d="M66 40 L74 28 L82 40 L77 37 L72 41 Z" fill="none" stroke="#1d2433" stroke-width=".5"/>
${Array.from({ length: 5 }, (_, i) => `<path d="M2 ${88 + i * 3.5} C 22 ${82 + i * 3.5}, 42 ${94 + i * 3.5}, 62 ${88 + i * 3.5} S 102 ${82 + i * 3.5}, 148 ${88 + i * 3.5}" fill="none" stroke="#2a44d4" stroke-width=".4"/>`).join('')}
</svg>`;
function boot() {
  let saved = null; try { saved = JSON.parse(localStorage.getItem('stiftwerk:items') || 'null'); } catch (e) { }
  if (Array.isArray(saved) && saved.length) { items = saved; for (const it of items) if (/^Beispiel: /.test(it.name)) it.sample = true; }
  else {
    try { const { it } = importSVG(SAMPLE, 'Beispiel Bergsee.svg'); it.name = 'Beispiel: Bergsee'; it.sample = true; it.x = 30; it.y = 52; it.hatch.on = true; it.hatch.spacing = 0.9; it.hatch.angle = 35; items.push(it); } catch (e) { console.warn(e); }
    const t = makeText('Grüße vom Bergsee', { size: 8, align: 'center' }); t.name = 'Beispiel: Überschrift'; t.sample = true;
    const [tw] = itemSize(t); t.x = (page.w - tw) / 2; t.y = 30; items.push(t);
    const s = makeText('Mit Stiftwerk geplottet – SVG öffnen oder Text schreiben,\ndann unter „Plotten“ starten.', { size: 3.2, align: 'center', color: '#1d2433' }); s.name = 'Beispiel: Fußzeile'; s.sample = true;
    const [sw] = itemSize(s); s.x = (page.w - sw) / 2; s.y = 172; items.push(s);
  }
  for (const it of items) if (it.font && it.font !== 'builtin') loadFont(it.font).catch(() => { });
  renderPage(); renderSettings(); bindPlotInputs(); renderJog(); renderObjects(); renderProps(); uiConn();
  log('Bereit. „Plotter verbinden“ öffnet die Auswahl des USB-Anschlusses.', 's');
  resize(); rebuild();
  showTab(sessionStorageGet('sw-tab') || 'layout');
}
boot();
