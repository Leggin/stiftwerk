
function numField(id, label, val, unit, step = 0.1, hint = '') {
  return `<div class="field"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><label class="inp"><input id="${id}" type="number" step="${step}" value="${+(+val).toFixed(3)}"><em>${unit}</em></label></div>`;
}
function renderProps(light) {
  const it = items.find(i => i.id === selId), box = $('#props');
  if (!it) { $('#selMeta').textContent = ''; box.innerHTML = '<p class="hint">Klicke ein Objekt auf dem Blatt oder in der Liste an, um es zu verschieben, zu skalieren oder zu drehen.</p>'; return; }
  const [w, h] = itemSize(it);
  if (light) { const set = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = +(+v).toFixed(2); }; set('pX', it.x); set('pY', it.y); set('pW', w); set('pH', h); if (it.type === 'text') set('tSize', it.text.size); else set('pS', it.scale * 100); return; }
  $('#selMeta').textContent = it.type === 'svg' ? 'SVG' : it.type === 'text' ? 'Text' : 'Testmuster';
  let html = `<div class="field"><span>Name</span><label class="inp"><input id="pName" value="${esc(it.name)}"></label></div>
  <div class="grid2"><label class="inp"><b>X</b><input id="pX" type="number" step="0.5" value="${+it.x.toFixed(2)}"><em>mm</em></label><label class="inp"><b>Y</b><input id="pY" type="number" step="0.5" value="${+it.y.toFixed(2)}"><em>mm</em></label>
  <label class="inp"><b>B</b><input id="pW" type="number" step="0.5" min="0.1" value="${+w.toFixed(2)}"><em>mm</em></label><label class="inp"><b>H</b><input id="pH" type="number" step="0.5" min="0.1" value="${+h.toFixed(2)}"><em>mm</em></label></div>`;
  if (it.type === 'text') {
    const t = it.text;
    html += `<textarea id="tStr" aria-label="Text" spellcheck="false">${esc(t.str)}</textarea>
    ${numField('tSize', 'Schriftgröße<small>Höhe der Großbuchstaben</small>', t.size, 'mm', 0.5)}
    ${numField('tLine', 'Zeilenabstand', t.line, '×', 0.1)}
    ${numField('tSlant', 'Neigung', t.slant, '°', 1)}
    <div class="field"><span>Ausrichtung</span><div class="seg" id="tAlign">${[['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${t.align === v}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Stiftfarbe</span><label class="inp"><input id="tColor" type="color" value="${esc(t.color)}" style="height:30px;padding:2px"></label></div>
    ${fontSelect(it.font)}`;
  } else html += numField('pS', 'Skalierung', it.scale * 100, '%', 1);
  html += `<div class="row"><button class="btn sm" id="pRot">Drehen 90°</button><button class="btn sm" id="pCenter">Zentrieren</button><button class="btn sm" id="pFit">Auf Rand einpassen</button></div>`;
  if (it.src.texts && it.src.texts.length) {
    const n = it.src.texts.length, conv = it.textMode === 'plot';
    html += `<div class="note ${conv ? '' : 'warn'}"><strong>${n} Text${n > 1 ? 'e' : ''} ${conv ? 'in Plotter-Schrift' : 'in SVG-Schrift'}</strong>${conv ? `Wird mit „${esc(fontName(it.font))}“ geplottet.` : 'So sieht die Vorlage aus. Geplottet werden die Texte erst nach dem Umwandeln.'}</div>
    ${fontSelect(it.font)}
    <div class="row"><button class="btn sm ${conv ? '' : 'primary'}" id="pConv">${conv ? 'Zurück zur SVG-Schrift' : 'In Plotter-Schrift umwandeln'}</button></div>`;
  }
  if (it.src.fills && it.src.fills.length) {
    html += `<label class="check"><input type="checkbox" id="hOn" ${it.hatch.on ? 'checked' : ''}> Flächen schraffieren</label>
    <div class="grid2" ${it.hatch.on ? '' : 'hidden'} id="hBox"><label class="inp"><b>↕</b><input id="hSp" type="number" step="0.1" min="0.2" value="${it.hatch.spacing}"><em>mm</em></label><label class="inp"><b>∠</b><input id="hAng" type="number" step="5" value="${it.hatch.angle}"><em>°</em></label></div>`;
  }
  html += `<div class="row"><button class="btn sm" id="pDup">Duplizieren</button><button class="btn sm danger" id="pDel">Entfernen</button></div>`;
  box.innerHTML = html;
  const on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
  const numv = id => parseFloat($('#' + id).value);
  on('pName', 'input', e => { it.name = e.target.value || 'Objekt'; renderObjects(); persist(); });
  on('pX', 'change', () => { if (isFinite(numv('pX'))) { it.x = numv('pX'); invalidate(); } });
  on('pY', 'change', () => { if (isFinite(numv('pY'))) { it.y = numv('pY'); invalidate(); } });
  const resizeTo = f => { if (!(f > 0) || !isFinite(f)) return; if (it.type === 'text') { it.text.size *= f; it.src = textSource(it); } else it.scale *= f; invalidate(); renderProps(); renderObjects(); };
  on('pW', 'change', () => resizeTo(numv('pW') / itemSize(it)[0]));
  on('pH', 'change', () => resizeTo(numv('pH') / itemSize(it)[1]));
  on('pS', 'change', () => resizeTo(numv('pS') / 100 / it.scale));
  on('pRot', 'click', () => { const [w0, h0] = itemSize(it), cx = it.x + w0 / 2, cy = it.y + h0 / 2; it.rot = (it.rot + 90) % 360; const [w1, h1] = itemSize(it); it.x = cx - w1 / 2; it.y = cy - h1 / 2; invalidate(); renderProps(); renderObjects(); });
  on('pCenter', 'click', () => { centerItem(it); invalidate(); renderProps(); });
  on('pFit', 'click', () => { fitItem(it); invalidate(); renderProps(); renderObjects(); });
  on('pDup', 'click', () => { const c = JSON.parse(JSON.stringify(it)); c.id = SW.uid(); c.name = it.name + ' Kopie'; c.x += 5; c.y += 5; items.push(c); invalidate(); select(c.id); });
  on('pDel', 'click', () => removeItem(it.id));
  const retext = () => { it.src = textSource(it); invalidate(); renderProps(true); renderObjects(); };
  on('tStr', 'input', e => { it.text.str = e.target.value; it.name = (e.target.value.split('\n')[0] || 'Text').slice(0, 32); const el = $('#pName'); if (el) el.value = it.name; retext(); });
  on('tSize', 'change', () => { const v = numv('tSize'); if (v > 0) { it.text.size = v; retext(); } });
  on('tLine', 'change', () => { const v = numv('tLine'); if (v > 0) { it.text.line = v; retext(); } });
  on('tSlant', 'change', () => { const v = numv('tSlant'); if (isFinite(v)) { it.text.slant = SW.clamp(v, -30, 30); retext(); } });
  on('tColor', 'change', e => { it.text.color = e.target.value.toLowerCase(); retext(); });
  const al = $('#tAlign'); if (al) al.onclick = e => { const b = e.target.closest('button'); if (!b) return; it.text.align = b.dataset.v; al.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); retext(); };
  on('pFont', 'change', e => applyFont(it, e.target.value));
  on('pConv', 'click', () => convertTexts(it, it.textMode !== 'plot'));
  on('hOn', 'change', e => { it.hatch.on = e.target.checked; $('#hBox').hidden = !it.hatch.on; invalidate(); });
  on('hSp', 'change', () => { const v = numv('hSp'); if (v >= 0.2) { it.hatch.spacing = v; invalidate(); } });
  on('hAng', 'change', () => { const v = numv('hAng'); if (isFinite(v)) { it.hatch.angle = v; invalidate(); } });
}
