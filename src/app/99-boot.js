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
  try { const { it } = importSVG(SAMPLE, 'sample.svg'); Object.assign(it, { name: t('sample.lake'), nameKey: 'sample.lake', sample: true }); it.x = (page.w - itemSize(it)[0]) / 2; it.y = 52 * page.h / 297; it.hatch.on = true; it.hatch.spacing = 0.9; it.hatch.angle = 35; out.push(it); } catch (e) { console.warn(e); }
  const head = makeText(t('sample.title.text'), { size: 8, align: 'center' }); Object.assign(head, { name: t('sample.title'), nameKey: 'sample.title', sample: true });
  head.x = (page.w - itemSize(head)[0]) / 2; head.y = 30 * page.h / 297; out.push(head);
  const foot = makeText(t('sample.footer.text'), { size: 3.2, align: 'center', color: '#1d2433' }); Object.assign(foot, { name: t('sample.footer'), nameKey: 'sample.footer', sample: true });
  foot.x = (page.w - itemSize(foot)[0]) / 2; foot.y = 172 * page.h / 297; out.push(foot);
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
  for (const f of [renderPage, renderSettings, renderObjects, renderProps, renderPens, renderStats, uiConn, renderJog, renderPos, renderLang, renderMachineDot]) SWUI.onRender(f);
  renderPage(); renderSettings(); bindPlotInputs(); renderJog(); renderObjects(); renderProps(); uiConn();
  log(t('boot.log.ready'), 's');
  resize(); rebuild(); historyReset();
  renderLang(); renderMachineDot();
  showStep(sessionStorageGet('sw-step') || 'motiv');
  // machine profiles: new users pick their plotter (picker in 07-machine-ui.js), existing users get theirs migrated
  if (machineFresh && typeof showMachinePicker === 'function') showMachinePicker({ first: true });
  else if (machineMigrated) toast(t('machine.toast.migrated', { name: activeMachine().name }), { duration: 7000 });
}
boot();
/* dev build only (simulated plotter present): a window for tests to look inside */
if (window.__fakeGrbl) window.SWDEBUG = { SWUI, pb, serial, draw, importFiles, getJob, invalidate, addGen, updateGen, makeCopies, alignSelected, distributeSelected, orderSelected, toggleSelect, selectAll, selectedItems, rotateItem, flipItem, libAdd, libUpdate, libLink, libFromPen, libRemove, get penLib() { return penLib; }, docNew, docOpen, docSaveNow, docDelete, docRename, docDuplicate, projectOpen, projectFileText, get docIndex() { return docIndex; }, get curDocId() { return curDocId; }, startPlot, stopPlot, traceFrame, resumePoint, previewPoint, get resumeAt() { return resumeAt; }, runPreflight, get plotFrom() { return plotFrom; }, get mcZeroSet() { return mcZeroSet; }, workArea, switchMachine, addMachineFromTemplate, exportMachine, importMachine, get machines() { return machines; }, get S() { return S; }, pbTime, pbCut, pbLiveInfo, pbStatus, pbScrub, pbPlay, pbPause, get job() { return job; }, get items() { return items; }, get doc() { return doc; }, get progress() { return progress; }, get plotting() { return plotting; } };
