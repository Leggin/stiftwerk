/* ---------------- ① Motiv: selection inspector ---------------- */
function numField(id, label, val, unit, step = 0.1, hint = '') {
  return `<div class="field"><label class="lbl" for="${id}">${label}${hint ? `<small>${hint}</small>` : ''}</label><div class="inp"><input id="${id}" type="number" step="${step}" value="${+(+val).toFixed(3)}"><em>${unit}</em></div></div>`;
}
const bindEl = (root, id, ev, fn) => { const el = root.querySelector('#' + id); if (el) el.addEventListener(ev, fn); };
const numIn = id => parseFloat($('#' + id).value);
/* import notes are [{ key, vars }] (translated here) or plain strings */
const swNoteText = n => typeof n === 'string' ? n : t(n.key, n.vars);
/* selection panel: a list of sections registered with SWUI.inspector (see 01-registry.js). Nothing selected → hint (the Blatt card leads) */
let propsFor = null; // selection the Blatt fold was last synced with
function renderProps(light) {
  const it = items.find(i => i.id === selId), box = $('#props');
  $('#propSec').classList.toggle('is-empty', !it);
  document.body.classList.toggle('has-sel', !!it);
  if (propsFor !== (it ? it.id : null)) { propsFor = it ? it.id : null; $('#pageSec').open = !it; }
  if (!it) { $('#selMeta').textContent = ''; box.innerHTML = `${swIcon('pointer')}<p class="hint">${tHtml('inspector.empty')}</p>`; return; }
  const secs = SWUI.inspector.sections.filter(s => s.applies(it));
  if (light) { for (const s of secs) if (s.light) s.light(it); return; }
  $('#selMeta').textContent = t('item.type.' + it.type);
  const fa = document.activeElement, fid = fa && fa.tagName === 'BUTTON' && box.contains(fa) ? fa.id : null;   // a clicked button keeps keyboard focus across the re-render
  const parts = secs.map(s => [s, s.render(it)]).filter(([, h]) => h && String(h).trim());
  box.innerHTML = parts.map(([s, h]) => `<div class="isec ${esc(s.id)}" data-sec="${esc(s.id)}">${h}</div>`).join('');
  for (const [s] of parts) if (s.bind) s.bind(it, box.querySelector(`[data-sec="${s.id}"]`));
  if (fid) { const el = document.getElementById(fid); if (el) el.focus({ preventScroll: true }); }
}
const setNum = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = +(+v).toFixed(2); };

/* name, position, size, rotation */
SWUI.inspector.register({
  id: 'basics', order: 10, applies: () => true,
  render(it) {
    const [w, h] = itemSize(it);
    const nf = (id, pre, label, v, step, min) => `<label class="inp"><b aria-hidden="true">${pre}</b><input id="${id}" type="number" step="${step}" ${min ? `min="${min}"` : ''} value="${+v.toFixed(2)}" aria-label="${label}"><em>mm</em></label>`;
    return `<div class="fgroup"><label class="cap" for="pName">${tHtml('inspector.name')}</label><div class="inp"><input id="pName" value="${esc(itemName(it))}" maxlength="60"></div></div>
  <div class="fgroup"><span class="cap">${tHtml('inspector.pos')}</span><div class="grid2">${nf('pX', 'X', tHtml('inspector.posX'), it.x, 0.5)}${nf('pY', 'Y', tHtml('inspector.posY'), it.y, 0.5)}</div></div>
  <div class="fgroup"><span class="cap">${tHtml('inspector.size')}</span><div class="grid2">${nf('pW', tHtml('inspector.w'), tHtml('inspector.width'), w, 0.5, 0.1)}${nf('pH', tHtml('inspector.h'), tHtml('inspector.height'), h, 0.5, 0.1)}</div></div>
  ${it.type === 'text' ? '' : numField('pS', tHtml('inspector.scale'), it.scale * 100, '%', 1)}
  <div class="row"><button class="btn sm" id="pRot">${swIcon('rotate', 'sm')}${tHtml('inspector.rotate')}</button><button class="btn sm" id="pCenter">${swIcon('center', 'sm')}${tHtml('inspector.center')}</button><button class="btn sm" id="pFit">${swIcon('maximize', 'sm')}${tHtml('inspector.fit')}</button></div>`;
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
    bindEl(root, 'pRot', 'click', () => { rotateItem(it, 90); invalidate(); renderProps(); renderObjects(); });
    bindEl(root, 'pCenter', 'click', () => { centerItem(it); invalidate(); renderProps(); });
    bindEl(root, 'pFit', 'click', () => { fitItem(it); invalidate(); renderProps(); renderObjects(); });
  }
});

/* Text items: content, size, spacing, slant, alignment, colour, font */
SWUI.inspector.register({
  id: 'textItem', order: 20, applies: it => it.type === 'text',
  render(it) {
    const tx = it.text, ai = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' };
    return `<div class="fgroup"><label class="cap" for="tStr">${tHtml('inspector.text.aria')}</label><textarea id="tStr" spellcheck="false">${esc(tx.str)}</textarea></div>
    ${numField('tSize', tHtml('inspector.text.size'), tx.size, 'mm', 0.5, tHtml('inspector.text.sizeHint'))}
    ${numField('tLine', tHtml('inspector.text.line'), tx.line, '×', 0.1)}
    ${numField('tSlant', tHtml('inspector.text.slant'), tx.slant, '°', 1)}
    <div class="field"><span id="tAlignLbl">${tHtml('inspector.text.align')}</span><div class="seg" id="tAlign" role="group" aria-labelledby="tAlignLbl">${['left', 'center', 'right'].map(v => `<button data-v="${v}" aria-pressed="${tx.align === v}" aria-label="${tHtml('inspector.text.' + v)}" title="${tHtml('inspector.text.' + v)}">${swIcon(ai[v], 'sm')}</button>`).join('')}</div></div>
    <div class="field"><label class="lbl" for="tColor">${tHtml('inspector.text.color')}</label><div class="inp"><input id="tColor" type="color" value="${esc(tx.color)}"><em id="tColorHex">${esc(tx.color)}</em></div></div>
    ${fontSelect(it.font)}`;
  },
  light(it) { setNum('tSize', it.text.size); },
  bind(it, root) {
    const retext = () => { it.src = textSource(it); invalidate(); renderProps(true); renderObjects(); };
    bindEl(root, 'tStr', 'input', e => { it.text.str = e.target.value; it.name = (e.target.value.split('\n')[0] || t('item.textDefault')).slice(0, 32); delete it.nameKey; const el = $('#pName'); if (el) el.value = it.name; retext(); });
    bindEl(root, 'tSize', 'change', () => { const v = numIn('tSize'); if (v > 0) { it.text.size = v; retext(); } });
    bindEl(root, 'tLine', 'change', () => { const v = numIn('tLine'); if (v > 0) { it.text.line = v; retext(); } });
    bindEl(root, 'tSlant', 'change', () => { const v = numIn('tSlant'); if (isFinite(v)) { it.text.slant = SW.clamp(v, -30, 30); retext(); } });
    bindEl(root, 'tColor', 'input', e => { const h = $('#tColorHex'); if (h) h.textContent = e.target.value; });
    bindEl(root, 'tColor', 'change', e => { it.text.color = e.target.value.toLowerCase(); retext(); });
    const al = root.querySelector('#tAlign'); if (al) al.onclick = e => { const b = e.target.closest('button'); if (!b) return; it.text.align = b.dataset.v; al.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); retext(); };
    bindEl(root, 'pFont', 'change', e => applyFont(it, e.target.value));
  }
});

/* import notes ("Hinweise"): dismissible */
SWUI.inspector.register({
  id: 'notes', order: 35, applies: it => !!(it.notes && it.notes.length),
  render: it => `<span class="cap">${tHtml('inspector.notes')}</span>` + it.notes.map((n, i) => `<div class="note-card">${swIcon('info')}<span>${esc(swNoteText(n))}</span><button class="ibtn sm" data-dismiss="${i}" aria-label="${tHtml('inspector.notes.dismiss')}" title="${tHtml('inspector.notes.dismiss')}">${swIcon('x', 'sm')}</button></div>`).join(''),
  bind(it, root) {
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-dismiss]'); if (!b) return;
      it.notes = it.notes.filter((_, j) => j !== +b.dataset.dismiss); if (!it.notes.length) delete it.notes;
      invalidate(); renderProps();
    });
  }
});

/* hatching of filled areas */
SWUI.inspector.register({
  id: 'hatch', order: 40, applies: it => !!((it.src.fills && it.src.fills.length) || (it.src.occ && it.src.occ.length)),
  render: it => (it.src.occ && it.src.occ.length ? `<label class="check"><input type="checkbox" id="hOcc" ${it.occlude ? 'checked' : ''}><span>${tHtml('inspector.occlude')}</span></label><p class="hint">${tHtml('inspector.occludeHint')}</p>` : '')
    + (it.src.fills && it.src.fills.length ? `<label class="check"><input type="checkbox" id="hOn" ${it.hatch.on ? 'checked' : ''}><span>${tHtml('inspector.hatch.on')}</span></label>
    <div class="isec-sub" ${it.hatch.on ? '' : 'hidden'} id="hBox">${numField('hSp', tHtml('inspector.hatch.spacing'), it.hatch.spacing, 'mm', 0.1)}${numField('hAng', tHtml('inspector.hatch.angle'), it.hatch.angle, '°', 5)}</div>` : ''),
  bind(it, root) {
    bindEl(root, 'hOcc', 'change', e => { it.occlude = e.target.checked; invalidate(); });
    bindEl(root, 'hOn', 'change', e => { it.hatch.on = e.target.checked; root.querySelector('#hBox').hidden = !it.hatch.on; invalidate(); });
    bindEl(root, 'hSp', 'change', () => { const v = numIn('hSp'); if (v >= 0.2) { it.hatch.spacing = v; invalidate(); } });
    bindEl(root, 'hAng', 'change', () => { const v = numIn('hAng'); if (isFinite(v)) { it.hatch.angle = v; invalidate(); } });
  }
});

/* duplicate / remove */
SWUI.inspector.register({
  id: 'actions', order: 90, applies: () => true,
  render: () => `<div class="row"><button class="btn sm" id="pDup">${swIcon('copy', 'sm')}${tHtml('inspector.duplicate')}</button><button class="btn sm danger" id="pDel">${swIcon('trash', 'sm')}${tHtml('inspector.remove')}</button></div>`,
  bind(it, root) {
    bindEl(root, 'pDup', 'click', () => duplicateItem(it.id));
    bindEl(root, 'pDel', 'click', () => removeItem(it.id));
  }
});
SWUI.on('select', () => renderProps());
