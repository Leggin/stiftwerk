/* ---------------- files ---------------- */
/* a freshly imported SVG: add it, say so; import notes live on the item ("Hinweise" card) and a toast action leads there */
function afterImport(it, notes, toastText) {
  if (notes && notes.length && !it.notes) it.notes = notes;
  addItem(it);
  if (it.notes && it.notes.length) toast(tn('files.toast.withNotes', it.notes.length, { name: it.name }), { action: { label: t('files.toast.showNotes'), run: () => { select(it.id); showStep('motiv'); const c = $('#props .notes'); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } } });
  else toast(toastText);
}
async function importFiles(files) {
  for (const f of files) {
    if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') { toast(t('files.toast.onlySvg', { name: f.name })); continue; }
    try { const { it, notes } = importSVG(await f.text(), f.name); afterImport(it, notes, t('files.toast.imported', { name: it.name })); }
    catch (e) { showDialog(`<h3>${tHtml('files.dialog.importFailed')}</h3><p class="hint">${esc(e.message)}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`); }
  }
}
$('#btnOpen').onclick = () => $('#fileIn').click();
$('#fontIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) { fontTarget = null; return; }
  try {
    const txt = await f.text(), font = SW.parseSvgFont(txt, f.name.replace(/\.svg$/i, '')), id = 'custom:' + SW.uid();
    font.id = id; fontCache.set(id, font); customFonts[id] = font.name; store.set('customFonts', customFonts);
    try { localStorage.setItem('stiftwerk:fontsrc:' + id, txt); } catch (er) { }
    const tg = fontTarget; fontTarget = null;
    if (tg) { const it = tg.it; if (it.type === 'text') { it.font = id; it.src = textSource(it); } else setTextStyle(it, tg.els || allEls(it), fontTargetConvert ? { font: id, mode: 'plot' } : { font: id }); }
    fontTargetConvert = false; invalidate(true); renderProps(); toast(t('files.font.loaded', { name: font.name, n: font.map.size }));
  } catch (er) { fontTarget = null; showDialog(`<h3>${tHtml('files.font.failed')}</h3><p class="hint">${esc(er.code === 'NOGLYPHS' ? t('files.font.noGlyphs') : er.message)}</p><div class="row"><button class="btn primary" data-close>${tHtml('common.close')}</button></div>`); }
};
$('#fileIn').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
$('#btnAddText').onclick = () => { const it = makeText(t('files.text.default')); it.x = page.margin + 5; it.y = page.margin + 5; addItem(it); showTab('layout'); setTimeout(() => { const t = $('#tStr'); if (t) { t.focus(); t.select(); } }, 30); };
$('#btnAddTest').onclick = () => addItem(makeTest());
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop').hidden = true; if (e.dataTransfer.files.length && !plotting) importFiles([...e.dataTransfer.files]); });
window.addEventListener('paste', e => {
  if (plotting || (e.target.closest && e.target.closest('input,textarea'))) return;
  const txt = e.clipboardData && e.clipboardData.getData('text'); if (!txt || !/<svg[\s>]/i.test(txt)) return;
  try { const { it, notes } = importSVG(txt, t('files.name.pasted')); afterImport(it, notes, t('files.toast.pasted')); } catch (er) { toast(er.message); }
});
