/* stats + plot controls */
function renderStats() {
  if (!job) return;
  const s = job.stats;
  $('#stats').innerHTML = `<div class="wide"><dt>Geschätzte Dauer</dt><dd>${fmtTime(s.time)}</dd></div>
    <div><dt>Zeichenweg</dt><dd>${fmt(s.draw / 1000, 2)} m</dd></div><div><dt>Leerfahrt</dt><dd>${fmt(s.travel / 1000, 2)} m</dd></div>
    <div><dt>Stift absetzen</dt><dd>${s.downs.toLocaleString('de-DE')}×</dd></div><div><dt>Stiftwechsel</dt><dd>${Math.max(0, job.plotLayers.length - 1)}</dd></div>`;
  const notes = [];
  if (!job.plotLayers.length) notes.push('<div class="note">Nichts zu plotten. Füge ein Objekt hinzu oder aktiviere einen Stift.</div>');
  if (job.unconverted) notes.push(`<div class="note warn"><strong>${job.unconverted} Text${job.unconverted > 1 ? 'e' : ''} noch in SVG-Schrift</strong>Diese Texte plottet der Stift erst nach dem Umwandeln in eine Plotter-Schrift.<div class="row" style="margin-top:6px"><button class="btn sm" id="convAll">Alle umwandeln</button></div></div>`);
  if (job.clipped) notes.push(`<div class="note warn"><strong>${job.clipped} Linie(n) ragen übers Blatt</strong>Sie werden an der Blattkante abgeschnitten.</div>`);
  const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
  let over = false; for (const L of job.plotLayers) for (const p of L.paths) for (const q of p.pts) if (q[0] > mw + 0.01 || q[1] > mh + 0.01) { over = true; break; }
  if (over) notes.push('<div class="note bad"><strong>Außerhalb des Arbeitsbereichs</strong>Ein Teil liegt jenseits dessen, was der Plotter erreicht. Verkleinere oder verschiebe das Motiv.</div>');
  $('#plotNotes').innerHTML = notes.join('');
  const ca = $('#convAll'); if (ca) ca.onclick = async () => { for (const it of items) if (it.src.texts && it.src.texts.length && it.textMode !== 'plot') { if (!(await convertTexts(it, true))) break; } };
  renderPlotBtns();
}
function renderPlotBtns() {
  const b = $('#plotBtns'); const can = job && job.plotLayers.length;
  if (!plotting) b.innerHTML = `<button class="btn primary big fill" id="pStart" ${can ? '' : 'disabled'}>${serial.connected ? 'Plot starten' : 'Verbinden & plotten'}</button>`;
  else b.innerHTML = `<button class="btn big fill" id="pPause">${plotState.paused ? 'Fortsetzen' : 'Pause'}</button><button class="btn danger big" id="pStop">Abbrechen</button>`;
  const st = $('#pStart'); if (st) st.onclick = startPlot;
  const pa = $('#pPause'); if (pa) pa.onclick = togglePause;
  const so = $('#pStop'); if (so) so.onclick = () => stopPlot(true);
}

