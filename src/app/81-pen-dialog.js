/* pen change dialog: shown before every pen when a plot uses more than one pen. Resolves true = go on, false = stop */
function penDialog(L, i, n) {
  return new Promise(res => {
    showDialog(`<div class="row" style="gap:14px;flex-wrap:nowrap"><span class="swatch" style="background:${esc(L.color)}"></span><div><h3>${tHtml('plot.pen.title', { i: i + 1, n, name: L.name })}</h3><p class="hint" style="margin:4px 0 0">${i ? tHtml('plot.pen.hintChange') : tHtml('plot.pen.hintInsert')}</p></div></div>
      <div class="row"><button class="btn" id="dTest">${tHtml('plot.pen.test')}</button><span class="fill"></span><button class="btn danger" data-close>${tHtml('common.cancel')}</button><button class="btn primary" id="dGo">${i ? tHtml('plot.pen.goNext') : tHtml('plot.pen.go')}</button></div>`, res);
    $('#dGo').onclick = () => closeDialog(true);
    $('#dTest').onclick = () => serial.send([SW.penDownLine(S), 'G4 P0.4', SW.penUpLine(S)]).catch(() => { });
  });
}

