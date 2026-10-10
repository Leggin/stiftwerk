/* ---------------- sample & boot ---------------- */
const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="104mm" viewBox="0 0 150 104">
<circle cx="112" cy="26" r="15" fill="#d9472b" stroke="#d9472b" stroke-width=".4"/>
<path d="M2 84 L34 40 L52 62 L74 28 L104 70 L118 58 L148 84" fill="none" stroke="#1d2433" stroke-width=".5"/>
<path d="M66 40 L74 28 L82 40 L77 37 L72 41 Z" fill="none" stroke="#1d2433" stroke-width=".5"/>
${Array.from({ length: 5 }, (_, i) => `<path d="M2 ${88 + i * 3.5} C 22 ${82 + i * 3.5}, 42 ${94 + i * 3.5}, 62 ${88 + i * 3.5} S 102 ${82 + i * 3.5}, 148 ${88 + i * 3.5}" fill="none" stroke="#2a44d4" stroke-width=".4"/>`).join('')}
</svg>`;
/* the three sample objects of a fresh start, named and written in the current language */
function makeSamples() {
  const out = [];
  try { const { it } = importSVG(SAMPLE, 'sample.svg'); Object.assign(it, { name: t('sample.lake'), nameKey: 'sample.lake', sample: true, x: 30, y: 52 }); it.hatch.on = true; it.hatch.spacing = 0.9; it.hatch.angle = 35; out.push(it); } catch (e) { console.warn(e); }
  const head = makeText(t('sample.title.text'), { size: 8, align: 'center' }); Object.assign(head, { name: t('sample.title'), nameKey: 'sample.title', sample: true });
  head.x = (page.w - itemSize(head)[0]) / 2; head.y = 30; out.push(head);
  const foot = makeText(t('sample.footer.text'), { size: 3.2, align: 'center', color: '#1d2433' }); Object.assign(foot, { name: t('sample.footer'), nameKey: 'sample.footer', sample: true });
  foot.x = (page.w - itemSize(foot)[0]) / 2; foot.y = 172; out.push(foot);
  return out;
}
/* untouched samples follow a language switch */
I18N.onChange(() => {
  if (!items.length || !items.every(i => i.sample) || history.canUndo) return;
  items = makeSamples(); selId = null; invalidate(true, { sys: true }); historyReset(); renderAll();
});
function boot() {
  loadState();
  if (!items.length) items = makeSamples();
  for (const it of items) for (const f of itemFontIds(it)) if (f !== 'builtin') loadFont(f).catch(() => { });
  for (const f of [renderPage, renderSettings, renderObjects, renderProps, renderPens, renderStats, uiConn, renderJog]) SWUI.onRender(f);
  renderPage(); renderSettings(); bindPlotInputs(); renderJog(); renderObjects(); renderProps(); uiConn();
  log(t('boot.log.ready'), 's');
  resize(); rebuild(); historyReset();
  showTab(sessionStorageGet('sw-tab') || 'layout');
}
boot();
