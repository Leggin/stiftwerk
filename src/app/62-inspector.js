function numField(id, label, val, unit, step = 0.1, hint = '') {
  return `<div class="field"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><label class="inp"><input id="${id}" type="number" step="${step}" value="${+(+val).toFixed(3)}"><em>${unit}</em></label></div>`;
}
const bindEl = (root, id, ev, fn) => { const el = root.querySelector('#' + id); if (el) el.addEventListener(ev, fn); };
const numIn = id => parseFloat($('#' + id).value);
/* selection panel: a list of sections registered with SWUI.inspector (see 01-registry.js) */
function renderProps(light) {
  const it = items.find(i => i.id === selId), box = $('#props');
  if (!it) { $('#selMeta').textContent = ''; box.innerHTML = `<p class="hint">${tHtml('inspector.empty')}</p>`; return; }
  const secs = SWUI.inspector.sections.filter(s => s.applies(it));
  if (light) { for (const s of secs) if (s.light) s.light(it); return; }
  $('#selMeta').textContent = t('item.type.' + it.type);
  box.innerHTML = secs.map(s => `<div class="isec" data-sec="${s.id}">${s.render(it)}</div>`).join('');
  for (const s of secs) if (s.bind) s.bind(it, box.querySelector(`[data-sec="${s.id}"]`));
}
const setNum = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = +(+v).toFixed(2); };

/* name, position, size, rotation */
SWUI.inspector.register({
  id: 'basics', order: 10, applies: () => true,
  render(it) {
    const [w, h] = itemSize(it);
    return `<div class="field"><span>${tHtml('inspector.name')}</span><label class="inp"><input id="pName" value="${esc(itemName(it))}"></label></div>
  <div class="grid2"><label class="inp"><b>X</b><input id="pX" type="number" step="0.5" value="${+it.x.toFixed(2)}"><em>mm</em></label><label class="inp"><b>Y</b><input id="pY" type="number" step="0.5" value="${+it.y.toFixed(2)}"><em>mm</em></label>
  <label class="inp"><b>${tHtml('inspector.w')}</b><input id="pW" type="number" step="0.5" min="0.1" value="${+w.toFixed(2)}"><em>mm</em></label><label class="inp"><b>${tHtml('inspector.h')}</b><input id="pH" type="number" step="0.5" min="0.1" value="${+h.toFixed(2)}"><em>mm</em></label></div>
  ${it.type === 'text' ? '' : numField('pS', tHtml('inspector.scale'), it.scale * 100, '%', 1)}
  <div class="row"><button class="btn sm" id="pRot">${tHtml('inspector.rotate')}</button><button class="btn sm" id="pCenter">${tHtml('inspector.center')}</button><button class="btn sm" id="pFit">${tHtml('inspector.fit')}</button></div>`;
  },
  light(it) { const [w, h] = itemSize(it); setNum('pX', it.x); setNum('pY', it.y); setNum('pW', w); setNum('pH', h); if (it.type !== 'text') setNum('pS', it.scale * 100); },
  bind(it, root) {
    bindEl(root, 'pName', 'input', e => { it.name = e.target.value || t('item.defaultName'); delete it.nameKey; renderObjects(); persist(); });
    bindEl(root, 'pX', 'change', () => { if (isFinite(numIn('pX'))) { it.x = numIn('pX'); invalidate(); } });
    bindEl(root, 'pY', 'change', () => { if (isFinite(numIn('pY'))) { it.y = numIn('pY'); invalidate(); } });
    const resizeTo = f => { if (!(f > 0) || !isFinite(f)) return; if (it.type === 'text') { it.text.size *= f; it.src = textSource(it); } else it.scale *= f; invalidate(); renderProps(); renderObjects(); };
    bindEl(root, 'pW', 'change', () => resizeTo(numIn('pW') / itemSize(it)[0]));
    bindEl(root, 'pH', 'change', () => resizeTo(numIn('pH') / itemSize(it)[1]));
    bindEl(root, 'pS', 'change', () => resizeTo(numIn('pS') / 100 / it.scale));
    bindEl(root, 'pRot', 'click', () => { const [w0, h0] = itemSize(it), cx = it.x + w0 / 2, cy = it.y + h0 / 2; it.rot = (it.rot + 90) % 360; const [w1, h1] = itemSize(it); it.x = cx - w1 / 2; it.y = cy - h1 / 2; invalidate(); renderProps(); renderObjects(); });
    bindEl(root, 'pCenter', 'click', () => { centerItem(it); invalidate(); renderProps(); });
    bindEl(root, 'pFit', 'click', () => { fitItem(it); invalidate(); renderProps(); renderObjects(); });
  }
});

/* Text items: content, size, spacing, slant, alignment, colour, font */
SWUI.inspector.register({
  id: 'textItem', order: 20, applies: it => it.type === 'text',
  render(it) {
    const tx = it.text;
    return `<textarea id="tStr" aria-label="${tHtml('inspector.text.aria')}" spellcheck="false">${esc(tx.str)}</textarea>
    ${numField('tSize', tHtml('inspector.text.size'), tx.size, 'mm', 0.5, tHtml('inspector.text.sizeHint'))}
    ${numField('tLine', tHtml('inspector.text.line'), tx.line, '×', 0.1)}
    ${numField('tSlant', tHtml('inspector.text.slant'), tx.slant, '°', 1)}
    <div class="field"><span>${tHtml('inspector.text.align')}</span><div class="seg" id="tAlign">${['left', 'center', 'right'].map(v => `<button data-v="${v}" aria-pressed="${tx.align === v}">${tHtml('inspector.text.' + v)}</button>`).join('')}</div></div>
    <div class="field"><span>${tHtml('inspector.text.color')}</span><label class="inp"><input id="tColor" type="color" value="${esc(tx.color)}" style="height:30px;padding:2px"></label></div>
    ${fontSelect(it.font)}`;
  },
  light(it) { setNum('tSize', it.text.size); },
  bind(it, root) {
    const retext = () => { it.src = textSource(it); invalidate(); renderProps(true); renderObjects(); };
    bindEl(root, 'tStr', 'input', e => { it.text.str = e.target.value; it.name = (e.target.value.split('\n')[0] || t('item.textDefault')).slice(0, 32); delete it.nameKey; const el = $('#pName'); if (el) el.value = it.name; retext(); });
    bindEl(root, 'tSize', 'change', () => { const v = numIn('tSize'); if (v > 0) { it.text.size = v; retext(); } });
    bindEl(root, 'tLine', 'change', () => { const v = numIn('tLine'); if (v > 0) { it.text.line = v; retext(); } });
    bindEl(root, 'tSlant', 'change', () => { const v = numIn('tSlant'); if (isFinite(v)) { it.text.slant = SW.clamp(v, -30, 30); retext(); } });
    bindEl(root, 'tColor', 'change', e => { it.text.color = e.target.value.toLowerCase(); retext(); });
    const al = root.querySelector('#tAlign'); if (al) al.onclick = e => { const b = e.target.closest('button'); if (!b) return; it.text.align = b.dataset.v; al.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); retext(); };
    bindEl(root, 'pFont', 'change', e => applyFont(it, e.target.value));
  }
});

/* hatching of filled areas */
SWUI.inspector.register({
  id: 'hatch', order: 40, applies: it => !!(it.src.fills && it.src.fills.length),
  render: it => `<label class="check"><input type="checkbox" id="hOn" ${it.hatch.on ? 'checked' : ''}> ${tHtml('inspector.hatch.on')}</label>
    <div class="grid2" ${it.hatch.on ? '' : 'hidden'} id="hBox"><label class="inp" title="${tHtml('inspector.hatch.spacing')}"><b>↕</b><input id="hSp" type="number" step="0.1" min="0.2" value="${it.hatch.spacing}" aria-label="${tHtml('inspector.hatch.spacing')}"><em>mm</em></label><label class="inp" title="${tHtml('inspector.hatch.angle')}"><b>∠</b><input id="hAng" type="number" step="5" value="${it.hatch.angle}" aria-label="${tHtml('inspector.hatch.angle')}"><em>°</em></label></div>`,
  bind(it, root) {
    bindEl(root, 'hOn', 'change', e => { it.hatch.on = e.target.checked; root.querySelector('#hBox').hidden = !it.hatch.on; invalidate(); });
    bindEl(root, 'hSp', 'change', () => { const v = numIn('hSp'); if (v >= 0.2) { it.hatch.spacing = v; invalidate(); } });
    bindEl(root, 'hAng', 'change', () => { const v = numIn('hAng'); if (isFinite(v)) { it.hatch.angle = v; invalidate(); } });
  }
});

/* duplicate / remove */
SWUI.inspector.register({
  id: 'actions', order: 90, applies: () => true,
  render: () => `<div class="row"><button class="btn sm" id="pDup">${tHtml('inspector.duplicate')}</button><button class="btn sm danger" id="pDel">${tHtml('inspector.remove')}</button></div>`,
  bind(it, root) {
    bindEl(root, 'pDup', 'click', () => { const c = JSON.parse(JSON.stringify(it)); c.id = SW.uid(); c.name = t('inspector.copyName', { name: itemName(it) }); delete c.nameKey; delete c.sample; c.x += 5; c.y += 5; items.push(c); invalidate(); select(c.id); });
    bindEl(root, 'pDel', 'click', () => removeItem(it.id));
  }
});
SWUI.on('select', () => renderProps());
