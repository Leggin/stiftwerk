/* ---------------- patterns & templates: dialog and inspector section (lib/45-gen.js, app/32-gen.js) ----------------
 * Dialog (add menu → "Muster & Vorlagen"): the seven kinds as cards, the parameters of the chosen kind and a live preview.
 * "Aufs Blatt legen" → addGen(). Inspector section 'gen' for a selected pattern: the same form, every change → updateGen().
 * One form renderer (guFormHtml) for both places; element ids carry a prefix per place (gud- dialog, gui- inspector).
 * Inert while a plot runs. The dialog's content is only ever touched through #dialog .gu-dlg. */
const GU_MAX_PATHS = 60000;          // a dot grid with more dots than this would freeze the sheet and the preview: refused
let guState = null;                  // dialog state while it is open: { kind, params, font }
let guTimer = 0, guLastKind = 'border';

const guNumStr = v => String(+(+v).toFixed(3));
const guC = v => String(+(+v).toFixed(2));
const guDim = v => fmt(v, Math.abs(v - Math.round(v)) > 0.05 ? 1 : 0);   // 277.0000001 reads as 277
const guPen = () => doc.penMode === SWPens.SINGLE ? doc.single.color : '#1d2433';   // the colour makeGen() uses
const guRoot = () => $('#modal').hidden ? null : $('#dialog').querySelector('.gu-dlg');
/* drawn elements for the one case that explodes (a dot grid); 0 for everything else */
const guCount = (kind, p) => kind === 'grid' && p.style === 'dots' ? (Math.floor(p.w / p.spacing) + 1) * (Math.floor(p.h / p.spacing) + 1) : 0;
const guVal = el => el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value;
/* plotter fonts only: an upload would have to know about pattern items (90-files.js handles text items) */
const guFontOpts = cur => FONT_LIST.concat(Object.entries(customFonts)).map(([v, l]) => `<option value="${esc(v)}"${v === (cur || 'builtin') ? ' selected' : ''}>${esc(l)}</option>`).join('');

/* the form of one kind. p = params (cleaned here), font = font id; pre = id prefix of the place */
function guFormHtml(pre, kind, params, font) {
  const v = SWGen.clean(kind, params), dis = plotting ? ' disabled' : '';
  const id = k => pre + '-' + k;
  const num = (k, label, unit, step, hint) => `<div class="field gu-f"><label class="lbl" for="${id(k)}">${label}${hint ? `<small>${hint}</small>` : ''}</label><div class="inp"><input id="${id(k)}" type="number" data-gp="${k}" step="${step}" value="${guNumStr(v[k])}"${dis}><em>${unit}</em></div></div>`;
  const sel = (k, label, opts) => `<div class="field gu-f"><label class="lbl" for="${id(k)}">${label}</label><div class="inp"><select id="${id(k)}" data-gp="${k}"${dis}>${opts}</select></div></div>`;
  const chk = (k, label) => `<label class="check gu-f"><input type="checkbox" id="${id(k)}" data-gp="${k}"${v[k] ? ' checked' : ''}${dis}><span>${label}</span></label>`;
  const styleSel = () => sel('style', tHtml('gen.f.style'), SWGen.STYLES[kind].map(s => `<option value="${s}"${s === v.style ? ' selected' : ''}>${tHtml('gen.style.' + kind + '.' + s)}</option>`).join(''));
  const wh = () => num('w', tHtml('gen.f.w'), 'mm', 0.5) + num('h', tHtml('gen.f.h'), 'mm', 0.5);
  const fontSel = () => sel('font', tHtml('fonts.select.label'), guFontOpts(font));
  switch (kind) {
    case 'border': {
      let h = styleSel() + wh();
      if (v.style === 'double' || v.style === 'corners') h += num('gap', tHtml('gen.f.gap'), 'mm', 0.5);
      if (v.style === 'rounded') h += num('radius', tHtml('gen.f.radius'), 'mm', 0.5);
      if (v.style === 'corners') h += num('corner', tHtml('gen.f.corner'), 'mm', 0.5);
      if (v.style === 'wave') h += num('amp', tHtml('gen.f.amp'), 'mm', 0.1) + num('period', tHtml('gen.f.wave'), 'mm', 0.5);
      if (v.style === 'dashed') h += num('period', tHtml('gen.f.dash'), 'mm', 0.5, tHtml('gen.f.dash.hint'));
      if (v.style === 'dots') h += num('period', tHtml('gen.f.dot'), 'mm', 0.5);
      return h;
    }
    case 'grid':
      return styleSel() + wh() + num('spacing', tHtml('gen.f.spacing'), 'mm', 0.5)
        + (v.style === 'ruled' ? num('margin', tHtml('gen.f.margin'), 'mm', 0.5, tHtml('gen.f.margin.hint')) : '');
    case 'spiral':
      return styleSel() + num('r', tHtml('gen.f.r'), 'mm', 0.5) + num('turns', tHtml('gen.f.turns'), '', 1);
    case 'rosette':
      return num('R', tHtml('gen.f.R'), 'mm', 0.5) + num('r', tHtml('gen.f.rw'), 'mm', 0.5) + num('d', tHtml('gen.f.d'), 'mm', 0.5)
        + num('loops', tHtml('gen.f.loops'), '', 1, tHtml('gen.f.loops.hint'));
    case 'lissajous':
      return wh() + num('a', tHtml('gen.f.a'), '', 1) + num('b', tHtml('gen.f.b'), '', 1) + num('phase', tHtml('gen.f.phase'), '°', 1);
    case 'calendar': {
      const months = t('gen.months').split(',').map((m, i) => `<option value="${i + 1}"${i + 1 === v.month ? ' selected' : ''}>${esc(m)}</option>`).join('');
      const days = `<option value="1"${v.firstDay === 1 ? ' selected' : ''}>${tHtml('gen.opt.monday')}</option><option value="0"${v.firstDay === 0 ? ' selected' : ''}>${tHtml('gen.opt.sunday')}</option>`;
      return num('year', tHtml('gen.f.year'), '', 1) + sel('month', tHtml('gen.f.month'), months) + wh()
        + sel('firstDay', tHtml('gen.f.firstDay'), days) + chk('title', tHtml('gen.f.title')) + chk('frame', tHtml('gen.f.frame')) + fontSel();
    }
    case 'namecard':
      return `<div class="fgroup gu-f"><label class="cap" for="${id('names')}">${tHtml('gen.f.names')}</label><textarea id="${id('names')}" data-gp="names" rows="4" spellcheck="false"${dis}>${esc(v.names)}</textarea></div>`
        + num('cw', tHtml('gen.f.cw'), 'mm', 0.5) + num('ch', tHtml('gen.f.ch'), 'mm', 0.5) + num('cols', tHtml('gen.f.cols'), '', 1)
        + num('gap', tHtml('gen.f.gap'), 'mm', 0.5) + num('size', tHtml('gen.f.size'), 'mm', 0.5, tHtml('gen.f.size.hint'))
        + chk('frame', tHtml('gen.f.frame')) + fontSel();
    default: return '';
  }
}

/* the preview: all paths of one pattern as a single path (dots are tiny strokes with round caps) */
function guSvg(r) {
  const d = r.paths.map(pts => pts.length === 1
    ? `M${guC(pts[0][0])} ${guC(pts[0][1])}h.01`
    : 'M' + pts.map(([x, y]) => guC(x) + ' ' + guC(y)).join('L')).join('');
  const m = Math.max(r.w, r.h) * 0.05;   // a margin of paper, so lines on the pattern's edge (borders) stay visible
  return `<svg viewBox="${guC(-m)} ${guC(-m)} ${guC(r.w + 2 * m)} ${guC(r.h + 2 * m)}" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true"><path d="${d}" fill="none" stroke="${esc(guPen())}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---- dialog ---- */
const guKindBtn = k => `<button type="button" class="gu-kind" data-kind="${k}" aria-pressed="${k === guState.kind}"${k === guState.kind ? ' autofocus' : ''}>${swIcon(GEN_ICON[k], 'sm')}<span>${tHtml('gen.kind.' + k)}</span></button>`;
function guDialogHtml() {
  return `<div class="gu-dlg">
    <h3>${tHtml('gen.dlg.title')}</h3>
    <p class="hint">${tHtml('gen.dlg.hint')}</p>
    <div class="gu-kinds" role="group" aria-label="${tHtml('gen.dlg.kinds')}">${SWGen.KINDS.map(guKindBtn).join('')}</div>
    <div class="gu-body">
      <figure class="gu-prev"><div class="gu-sheet" role="img"></div><figcaption class="gu-size"></figcaption></figure>
      <div class="gu-form">${guFormHtml('gud', guState.kind, guState.params, guState.font)}</div>
    </div>
    <p class="note warn gu-warn" hidden></p>
    <div class="gu-foot"><button type="button" class="btn" data-close>${tHtml('common.cancel')}</button><button type="button" class="btn primary" id="guAdd">${tHtml('gen.dlg.add')}</button></div>
  </div>`;
}
function guOpenDialog() {
  if (plotting) return;
  guState = { kind: guLastKind, params: genDefaults(guLastKind), font: 'builtin' };
  showDialog(guDialogHtml(), null);
  guRender();
}
/* the form again (kind or style changed: the fields change); keyboard focus returns to the same field */
function guRefreshForm(focusKey) {
  const root = guRoot(); if (!root) return;
  root.querySelector('.gu-form').innerHTML = guFormHtml('gud', guState.kind, guState.params, guState.font);
  if (focusKey) { const el = root.querySelector(`.gu-form [data-gp="${focusKey}"]`); if (el) el.focus({ preventScroll: true }); }
}
function guPickKind(k) {
  const root = guRoot(); if (!root || !guState || k === guState.kind || !SWGen.KINDS.includes(k)) return;
  guState.kind = k; guLastKind = k; guState.params = genDefaults(k);
  root.querySelectorAll('.gu-kind').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
  guRefreshForm(null); guRender();
}
/* every field of the dialog: the state follows at once, the preview after a short pause */
function guField(e) {
  const root = guRoot(), el = e.target;
  if (!root || !guState || !el.dataset || !el.dataset.gp || !root.contains(el)) return;
  const k = el.dataset.gp;
  if (k === 'font') guState.font = el.value;
  else guState.params = SWGen.clean(guState.kind, Object.assign({}, guState.params, { [k]: guVal(el) }));
  if (e.type === 'change') {
    if (el.type === 'number') el.value = guNumStr(guState.params[k]);   // show the value as it is used, once the field is left
    if (k === 'style') guRefreshForm(k);                                  // the style decides which fields exist
  }
  guLater();
}
const guLater = () => { clearTimeout(guTimer); guTimer = setTimeout(guRender, 120); };
function guRender() {
  clearTimeout(guTimer); guTimer = 0;
  const root = guRoot(); if (!root || !guState) return;
  const kind = guState.kind, p = SWGen.clean(kind, guState.params), sheet = root.querySelector('.gu-sheet'), size = root.querySelector('.gu-size'), warn = root.querySelector('.gu-warn');
  const n = guCount(kind, p);
  let r = null, msg = '';
  if (n > GU_MAX_PATHS) msg = t('gen.warn.tooMany', { n: fmtInt(n) });
  else {
    try { r = SWGen.make(kind, p, genCtx({ font: guState.font })); }
    catch (err) { console.error(err); msg = t('gen.warn.failed'); }
  }
  if (r) {
    const w = Math.max(0.1, r.w), h = Math.max(0.1, r.h);
    const m = Math.max(w, h) * 0.1; sheet.style.setProperty('--gu-ar', String((w + m) / (h + m)));   // same margin as guSvg
    sheet.innerHTML = guSvg(r);
    sheet.setAttribute('aria-label', t('gen.preview.label', { kind: t('gen.kind.' + kind), w: guDim(w), h: guDim(h) }));
    size.textContent = t('gen.size', { w: guDim(w), h: guDim(h) });
  } else { sheet.innerHTML = ''; size.textContent = ''; }
  warn.hidden = !msg; warn.textContent = msg;
  root.querySelector('#guAdd').disabled = !r || plotting;
}
function guAdd() {
  const root = guRoot(); if (!root || !guState || plotting) return;
  const kind = guState.kind, p = SWGen.clean(kind, guState.params);
  if (guCount(kind, p) > GU_MAX_PATHS) return;
  if (addGen(kind, p, { font: guState.font })) { guState = null; closeDialog(true); }
}

$('#btnAddGen').onclick = guOpenDialog;
$('#dialog').addEventListener('click', e => {
  if (!guRoot()) return;
  const kb = e.target.closest('.gu-kind');
  if (kb) guPickKind(kb.dataset.kind);
  else if (e.target.closest('#guAdd')) guAdd();
});
$('#dialog').addEventListener('input', guField);
$('#dialog').addEventListener('change', guField);
SWUI.on('fonts', () => { if (guRoot()) guLater(); });   // a font finished loading: the preview shows it

/* ---- inspector section for a selected pattern ---- */
SWUI.inspector.register({
  id: 'gen', order: 20, applies: it => it.type === 'gen' && !!it.gen,
  render(it) {
    const g = it.gen;
    return `<div class="gu-ins">
      <div class="gu-head">${swIcon(GEN_ICON[g.kind] || 'sparkle', 'sm')}<h3 class="gu-title">${tHtml('gen.kind.' + g.kind)}</h3></div>
      <p class="hint">${tHtml('gen.ins.hint')}</p>
      ${guFormHtml('gui', g.kind, g.params, g.font)}
    </div>`;
  },
  bind(it, root) {
    const id = it.id;
    root.querySelectorAll('[data-gp]').forEach(el => el.addEventListener('change', () => guInsChange(id, el)));
  }
});
/* one field of the inspector changed: updateGen() with that value, then a light refresh (keeps keyboard focus) */
function guInsChange(id, el) {
  const it = items.find(i => i.id === id);
  if (!it || it.type !== 'gen' || !it.gen || plotting) { renderProps(); return; }
  const k = el.dataset.gp, kind = it.gen.kind;
  if (k === 'font') { updateGen(it, { font: el.value }); renderProps(true); return; }
  const v = guVal(el), next = SWGen.clean(kind, Object.assign({}, it.gen.params, { [k]: v })), n = guCount(kind, next);
  if (n > GU_MAX_PATHS) { toast(t('gen.warn.tooMany', { n: fmtInt(n) })); renderProps(); return; }
  updateGen(it, { params: { [k]: v } });
  if (k === 'style') {   // the style decides which fields exist: full re-render, focus back on the select
    renderProps();
    const f = $('#props').querySelector(`[data-gp="${k}"]`); if (f) f.focus({ preventScroll: true });
    return;
  }
  if (el.type === 'number') el.value = guNumStr(next[k]);
  renderProps(true);
}
