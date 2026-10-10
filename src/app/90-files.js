/* ---------------- files ---------------- */
async function importFiles(files) {
  for (const f of files) {
    if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') { toast(`${f.name}: nur SVG-Dateien`); continue; }
    try { const { it, notes } = importSVG(await f.text(), f.name); addItem(it); toast(notes.length ? notes.join(' · ') : `„${it.name}“ importiert`); }
    catch (e) { showDialog(`<h3>Import fehlgeschlagen</h3><p class="hint">${esc(e.message)}</p><div class="row"><button class="btn primary" data-close>Schließen</button></div>`); }
  }
}
$('#btnOpen').onclick = () => $('#fileIn').click();
$('#fontIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) { fontTarget = null; return; }
  try {
    const txt = await f.text(), font = SW.parseSvgFont(txt, f.name.replace(/\.svg$/i, '')), id = 'custom:' + SW.uid();
    font.id = id; fontCache.set(id, font); customFonts[id] = font.name; store.set('customFonts', customFonts);
    try { localStorage.setItem('stiftwerk:fontsrc:' + id, txt); } catch (er) { }
    const it = fontTarget; fontTarget = null;
    if (it) { it.font = id; if (it.type === 'text') it.src = textSource(it); else if (fontTargetConvert) it.textMode = 'plot'; }
    fontTargetConvert = false; invalidate(true); renderProps(); toast(`Schrift „${font.name}“ geladen (${font.map.size} Zeichen)`);
  } catch (er) { fontTarget = null; showDialog(`<h3>Schrift konnte nicht geladen werden</h3><p class="hint">${esc(er.message)}</p><div class="row"><button class="btn primary" data-close>Schließen</button></div>`); }
};
$('#fileIn').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
$('#btnAddText').onclick = () => { const it = makeText('Hallo vom Plotter!'); it.x = page.margin + 5; it.y = page.margin + 5; addItem(it); showTab('layout'); setTimeout(() => { const t = $('#tStr'); if (t) { t.focus(); t.select(); } }, 30); };
$('#btnAddTest').onclick = () => addItem(makeTest());
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop').hidden = true; if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); });
window.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const t = e.clipboardData && e.clipboardData.getData('text'); if (!t || !/<svg[\s>]/i.test(t)) return;
  try { const { it } = importSVG(t, 'Eingefügt'); addItem(it); toast('SVG eingefügt'); } catch (er) { toast(er.message); }
});
