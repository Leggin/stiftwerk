/* pen change dialog: shown before every pen when a plot uses more than one pen (80-plot.js). Resolves true = go on, false = stop.
 * L = job layer { name, color, keys }, i = index (0 = first pen), n = number of pens.
 * Not dismissible: Esc or a click outside must never abort a running plot – only the confirmed "Plot beenden …" does. */
function penDialog(L, i, n) {
  return new Promise(res => {
    const layers = job && job.plotLayers && job.plotLayers[i] === L ? job.plotLayers : null;
    const steps = (layers || Array.from({ length: n }, () => ({ color: '' }))).map((l, j) => `<li class="pn-step${j < i ? ' done' : j === i ? ' now' : ''}" style="--c:${pnHex(l.color)};--on:${pnOnColor(pnHex(l.color))}"${j === i ? ' aria-current="step"' : ''}>${j < i ? PN_ICON.check : ''}</li>`).join('');
    const draws = (L.keys || []).filter(k => layerMeta[k]).map(k => `<span class="pn-chip"><span class="pn-dot xs" style="--c:${esc(pnHex(layerMeta[k].color))}"></span>${esc(colorLabel(k))}</span>`).join('');
    const hint = tHtml(i ? 'pens.dlg.next' : 'pens.dlg.first') + (S.park === 'origin' ? ' ' + tHtml('pens.dlg.parked') : '');
    const guard = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); } };   // belt and braces next to { dismissible: false }
    window.addEventListener('keydown', guard, true);
    const done = v => { window.removeEventListener('keydown', guard, true); res(v); };
    showDialog(`<div class="pn-dlg">
      <div class="pn-dlg-hero"><span class="pn-dlg-sw" style="--c:${esc(pnHex(L.color))}" aria-hidden="true"></span>
        <div><div class="pn-kicker">${tHtml('pens.dlg.kicker', { i: i + 1, n })}</div><h3>${esc(L.name)}</h3></div></div>
      <p class="pn-dlg-hint">${hint}</p>
      ${draws ? `<div class="pn-dlg-draws"><span class="pn-cap">${tHtml('pens.dlg.draws')}</span><span class="pn-chips">${draws}</span></div>` : ''}
      <ol class="pn-steps" role="img" aria-label="${tHtml('pens.dlg.progress', { i: i + 1, n })}">${steps}</ol>
      <div class="pn-dlg-actions">
        <button type="button" class="btn" id="pnTest">${tHtml('pens.dlg.test')}</button>
        <button type="button" class="btn ghost danger" id="pnStop" aria-live="polite">${tHtml('pens.dlg.stop')}</button>
        <button type="button" class="btn primary big" id="pnGo">${tHtml(i ? 'pens.dlg.goNext' : 'pens.dlg.go')}</button>
      </div></div>`, done, { dismissible: false });
    const go = $('#pnGo'); go.focus();
    go.onclick = () => closeDialog(true);
    $('#pnTest').onclick = async () => {
      const b = $('#pnTest'); b.disabled = true;
      try { await serial.send([...SW.penLines(S, 'down'), 'G4 P0.4', ...SW.penLines(S, 'up')]); } catch (e) { }
      if (b.isConnected) { b.disabled = false; go.focus(); }
    };
    // ending the plot needs a second click (a double click by accident does not count)
    const stop = $('#pnStop'); let armed = 0, timer = 0;
    stop.onclick = () => {
      if (!armed) { armed = Date.now(); stop.textContent = t('pens.dlg.stopSure'); stop.classList.add('armed'); timer = setTimeout(() => { armed = 0; stop.textContent = t('pens.dlg.stop'); stop.classList.remove('armed'); }, 4000); return; }
      if (Date.now() - armed < 500) return;
      clearTimeout(timer); closeDialog(false);
    };
  });
}
