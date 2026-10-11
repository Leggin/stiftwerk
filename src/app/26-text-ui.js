/* ---------------- "Texte & Schriften" – inspector section for SVG items with <text> ----------------
 * A list of all texts of the file (state dot, string, font), a card for the selected text(s) with a mode switch and a font picker
 * whose options show the text itself in each font. Hovering/focusing a font previews it on the sheet (ghost, see 53-text-overlay.js);
 * click/Enter applies it. Everything goes through applyFont/convertTexts/resetTexts (22-fonts.js), so each change is one undo step. */
const TX_WARN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.3 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3.3M8 11.9v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const TX_TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6l3.3 3.2L13 4.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const txFail = new Set();     // fonts that could not be loaded (retry on click)
let txFocusKey = null;        // element to focus after the next refresh
const txPvCache = new Map();

/* ---- helpers ---- */
const txList = chars => chars.join(' ');
function txCovFor(r) { return r.mode === 'plot' ? textCoverage(r.str, r.font) : null; }
const txBad = cov => !!(cov && (cov.substituted.length || cov.missing.length));
function txBadTitle(cov) {
  const out = []; if (cov.substituted.length) out.push(t('texts.badge.sub', { chars: txList(cov.substituted) })); if (cov.missing.length) out.push(t('texts.badge.missing', { chars: txList(cov.missing) }));
  return out.join(' · ');
}
/* the text of an element as polylines in a given font, scaled into a fixed-height inline SVG */
function txFontPreview(str, id) {
  const f = id === 'builtin' ? SW.BUILTIN : fontCache.get(id); if (!f) return '';
  const s = [...String(str).replace(/\s+/g, ' ').trim()].slice(0, 26).join(''), key = id + '|' + s;
  if (txPvCache.has(key)) return txPvCache.get(key);
  const polys = SW.renderText(s, 10, 1.7, 'left', 0, 0, f).map(p => SW.rdp(p, 0.12));
  let html = '';
  if (polys.length) {
    const w = SW.textWidth(s, 10, 0, f), d = polys.map(p => 'M' + p.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')).join('');
    html = `<svg viewBox="-1 -3.5 ${Math.max(w + 3, 190).toFixed(1)} 21" preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  }
  if (txPvCache.size > 300) txPvCache.clear();
  txPvCache.set(key, html); return html;
}
function txFontGroups() {
  const g = [{ key: 'builtin', ids: ['builtin'] }, { key: 'hershey', ids: FONT_IDS.filter(i => /^Hershey/.test(i)) }, { key: 'ems', ids: FONT_IDS.filter(i => /^EMS/.test(i)) }];
  const custom = Object.keys(customFonts); if (custom.length) g.push({ key: 'custom', ids: custom });
  return g;
}

/* ---- list ---- */
function txRow(r, selected, tab) {
  const plot = r.mode === 'plot', cov = txCovFor(r), bad = txBad(cov);
  return `<div class="tx-row${selected ? ' is-sel' : ''}${txHover && txHover.el === r.el ? ' is-hover' : ''}" role="option" aria-selected="${selected}" data-el="${r.el}" data-fk="r${r.el}" tabindex="${tab ? 0 : -1}" title="${esc(r.str)}">
    <span class="tx-dot" data-mode="${r.mode}" aria-hidden="true"></span>
    <span class="tx-str">${esc(r.str)}</span>
    <span class="tx-fnt">${plot ? esc(fontName(r.font)) : tHtml('texts.font.original')}</span>
    ${bad ? `<span class="tx-warn" role="img" aria-label="${esc(txBadTitle(cov))}" title="${esc(txBadTitle(cov))}">${TX_WARN}</span>` : ''}
  </div>`;
}

/* ---- font picker ---- */
function txOptionInner(id, strs, mode, font) {
  const loaded = id === 'builtin' || fontCache.has(id), cur = mode === 'plot' && font === id, pend = mode !== 'plot' && font === id;
  const cov = loaded ? textCoverage(strs.join(' '), id) : null, bad = txBad(cov);
  const pv = loaded ? txFontPreview(strs[0], id) : txFail.has(id) ? `<span class="tx-fail">${tHtml('texts.font.failed')}</span>` : '<span class="tx-skel"></span>';
  return `<span class="tx-oname"><span class="tx-oname-t">${esc(fontName(id))}</span>${cur ? `<span class="tx-tick" role="img" aria-label="${tHtml('texts.font.current')}">${TX_TICK}</span>` : pend ? `<em class="tx-pend">${tHtml('texts.font.pending')}</em>` : ''}</span>
    <span class="tx-pv">${pv}</span>${bad ? `<span class="tx-obad" role="img" aria-label="${esc(txBadTitle(cov))}" title="${esc(txBadTitle(cov))}">${TX_WARN}</span>` : ''}`;
}
function txOption(id, strs, mode, font, tab) {
  const loaded = id === 'builtin' || fontCache.has(id), cur = mode === 'plot' && font === id, pend = mode !== 'plot' && font === id;
  return `<div class="tx-opt${cur ? ' is-cur' : ''}${pend ? ' is-pend' : ''}" role="option" aria-selected="${cur}" data-font="${esc(id)}" data-fk="o:${esc(id)}" tabindex="${tab ? 0 : -1}"${loaded ? '' : ' data-lazy="1"'}>${txOptionInner(id, strs, mode, font)}</div>`;
}

/* size & position of the plotted texts of the selection (25-text-model.js). Values are those of the first text. */
const txDec1 = v => (Math.round(v * 10) / 10 + 0).toFixed(1); // one decimal, never "-0.0"
function txAdjSection(it, els) {
  const a = textAdjInfo(it, els), pct = Math.round(a.k * 100);
  return `<section class="tx-adj" aria-labelledby="txAdjT">
      <div class="tx-flabel"><span id="txAdjT">${tHtml('texts.adj.title')}</span></div>
      <div class="tx-adj-row">
        <label class="tx-adj-cap" for="txAdjSize">${tHtml('texts.adj.size')}</label>
        <div class="tx-adj-ctl">
          <button type="button" class="btn sm tx-adj-step" id="txAdjSmaller" data-fk="a:smaller" aria-label="${tHtml('texts.adj.smaller')}" title="${tHtml('texts.adj.smaller')}">−</button>
          <div class="inp"><input id="txAdjSize" type="number" min="5" max="1000" step="1" value="${pct}" data-fk="a:size"><em>%</em></div>
          <button type="button" class="btn sm tx-adj-step" id="txAdjLarger" data-fk="a:larger" aria-label="${tHtml('texts.adj.larger')}" title="${tHtml('texts.adj.larger')}">+</button>
        </div>
      </div>
      <div class="tx-adj-row" role="group" aria-labelledby="txAdjP">
        <span class="tx-adj-cap" id="txAdjP">${tHtml('texts.adj.pos')}</span>
        <div class="grid2">
          <div class="inp"><label class="tx-adj-pre" for="txAdjX">X</label><input id="txAdjX" type="number" step="0.5" value="${txDec1(a.x)}" data-fk="a:x"><em>mm</em></div>
          <div class="inp"><label class="tx-adj-pre" for="txAdjY">Y</label><input id="txAdjY" type="number" step="0.5" value="${txDec1(a.y)}" data-fk="a:y"><em>mm</em></div>
        </div>
        <p class="hint">${tHtml('texts.adj.offset')}</p>
      </div>
      ${a.mixed ? `<p class="hint">${tHtml('texts.adj.mixed')}</p>` : ''}
      <div class="row tx-adj-btns">
        <button type="button" class="btn sm" id="txAdjFit" data-fk="a:fit" title="${tHtml('texts.adj.fit.title')}">${tHtml('texts.adj.fit')}</button>
        <button type="button" class="btn sm" id="txAdjReset" data-fk="a:reset" ${a.changed ? '' : 'disabled'}>${tHtml('texts.adj.reset')}</button>
      </div>
      <p class="hint">${tHtml('texts.adj.tip')}</p>
    </section>`;
}

/* ---- the card for the selected text(s) ---- */
function txCard(it, info) {
  const sel = info.filter(r => txSel.els.includes(r.el));
  if (!sel.length) return `<p class="tx-empty">${tHtml('texts.card.none')}</p>`;
  const first = sel[0], run = it.src.texts.find(r => r.el === first.el) || {};
  const modes = new Set(sel.map(r => r.mode)), fonts = new Set(sel.map(r => r.font));
  const mode = modes.size === 1 ? first.mode : 'mixed', font = fonts.size === 1 ? first.font : null, strs = sel.map(r => r.str);
  const head = sel.length === 1
    ? `<div class="tx-orig"><span class="tx-cap">${tHtml('texts.font.original')}</span><span class="tx-origtxt" style="font-family:${esc(run.family || 'sans-serif')};font-weight:${esc(run.weight || 400)};font-style:${esc(run.style || 'normal')}">${esc(first.str)}</span></div>`
    : `<div class="tx-orig"><span class="tx-cap">${tnHtml('texts.card.multi', sel.length)}</span><span class="tx-origtxt">${esc(first.str)}</span></div>`;
  // glyph notes (plotter font only)
  let notes = '';
  const plotSel = sel.filter(r => r.mode === 'plot'), subst = new Set(), miss = new Set();
  for (const r of plotSel) { const c = textCoverage(r.str, r.font); if (c) { c.substituted.forEach(x => subst.add(x)); c.missing.forEach(x => miss.add(x)); } }
  const builtinFix = font && font !== 'builtin' && subst.size;
  if (subst.size) notes += `<div class="note warn tx-note">${tHtml(font ? 'texts.note.sub' : 'texts.note.subMany', { chars: txList([...subst]), builtin: fontName('builtin') })}${builtinFix ? `<button type="button" class="btn sm" id="txBuiltin">${tHtml('texts.useBuiltin')}</button>` : ''}</div>`;
  if (miss.size) notes += `<div class="note bad tx-note">${tHtml('texts.note.missing', { chars: txList([...miss]) })}</div>`;
  const groups = txFontGroups(); let tabId = font || 'builtin';
  if (!groups.some(g => g.ids.includes(tabId))) tabId = 'builtin';
  const opts = groups.map(g => `<div class="tx-fgrp" role="presentation">${tHtml('texts.group.' + g.key)}</div>` + g.ids.map(id => txOption(id, strs, mode, font, id === tabId)).join('')).join('');
  const total = info.length;
  const adj = plotSel.length ? txAdjSection(it, plotSel.map(r => r.el)) : '';
  return `<div class="tx-card">
    ${head}
    <div class="seg tx-mode" role="group" aria-label="${tHtml('texts.mode.aria')}">
      <button type="button" data-mode="svg" data-fk="m:svg" aria-pressed="${mode === 'svg'}">${tHtml('texts.mode.original')}</button>
      <button type="button" data-mode="plot" data-fk="m:plot" aria-pressed="${mode === 'plot'}">${tHtml('texts.mode.plot')}</button>
    </div>
    ${mode === 'plot' ? '' : `<p class="hint tx-modehint">${tHtml(mode === 'svg' ? 'texts.hint.original' : 'texts.hint.mixed')}</p>`}
    <div class="tx-flabel"><span>${tHtml('texts.font.label')}</span><small>${tHtml('texts.font.sub')}</small></div>
    <div class="tx-fonts" role="listbox" aria-label="${tHtml('texts.font.aria')}">${opts}</div>
    <button type="button" class="btn sm tx-upload" id="txUpload" data-fk="b:upload">${tHtml('texts.font.upload')}</button>
    ${notes}
    <div class="row tx-actions">
      <button type="button" class="btn sm tx-toggle" id="txCompare" data-fk="b:compare" aria-pressed="${txCompare}" title="${tHtml('texts.compare.title')}"><i class="tx-rosedot" aria-hidden="true"></i>${tHtml('texts.compare')}</button>
      <button type="button" class="btn sm" id="txReset" data-fk="b:reset" title="${tHtml('texts.reset.title')}">${tHtml('texts.reset')}</button>
      ${total > sel.length && font ? `<button type="button" class="btn sm" id="txAll" data-fk="b:all">${tHtml('texts.applyAll', { n: total })}</button>` : ''}
    </div>
    ${adj}
  </div>`;
}

function txRender(it) {
  txCur();
  const info = textInfo(it), c = textCounts(it), tabEl = (txSel.els[0] != null && info.some(r => r.el === txSel.els[0])) ? txSel.els[0] : info[0].el;
  return `<div class="tx">
    <div class="tx-head"><h3 class="tx-h">${tHtml('texts.title')}</h3><span class="tx-sum">${tnHtml('texts.summary', c.total, { plotted: c.plotted })}</span></div>
    ${c.unconverted ? `<p class="hint">${tHtml('texts.hint.svg')}</p>` : ''}
    <div class="row tx-bulk">${c.unconverted ? `<button type="button" class="btn sm primary" id="pConv">${tHtml('texts.convertAll')}</button>` : ''}${c.plotted ? `<button type="button" class="btn sm" id="pRevert">${tHtml('texts.revertAll')}</button>` : ''}</div>
    <div class="tx-list" role="listbox" aria-multiselectable="true" aria-label="${tHtml('texts.list.aria')}">${info.map(r => txRow(r, txSel.els.includes(r.el), r.el === tabEl)).join('')}</div>
    ${txCard(it, info)}
  </div>`;
}

/* re-render only this section (keeps scroll positions and keyboard focus). Returns false when the section isn't on screen. */
function txRefresh() {
  const it = txCur(), box = document.querySelector('#props [data-sec="svgTexts"]');
  if (!it || !box) return false;
  const act = document.activeElement, own = act && box.contains(act) ? act.closest('[data-fk]') : null;
  const fk = txFocusKey || (own && own.dataset.fk); txFocusKey = null;
  const sc = [...box.querySelectorAll('.tx-list,.tx-fonts')].map(e => e.scrollTop);
  box.innerHTML = txSection.render(it); txSection.bind(it, box);
  box.querySelectorAll('.tx-list,.tx-fonts').forEach((e, i) => { if (sc[i]) e.scrollTop = sc[i]; });
  if (fk) { const n = box.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (n && !n.disabled) n.focus({ preventScroll: true }); }
  return true;
}

/* ---- actions ---- */
const txUndoable = (msg) => toast(msg, { action: { label: t('common.undo'), run: undo } });
async function txChooseFont(id, all) {
  const it = txCur(); if (!it || plotting || !txSel.els.length) return;
  txFail.delete(id); txPreview = null; render();
  const els = all ? allEls(it) : txSel.els.slice();
  const o = document.querySelector(`#props .tx-opt[data-font="${CSS.escape(id)}"]`); if (o) o.classList.add('is-busy');
  if (await applyFont(it, id, els, true)) txUndoable(tn('texts.toast.applied', els.length, { font: fontName(id) }));
  else { const o2 = document.querySelector('#props .tx-opt.is-busy'); if (o2) o2.classList.remove('is-busy'); }
}
async function txSetMode(it, plot) {
  if (plotting || !txSel.els.length) return;
  txPreview = null; render();
  await convertTexts(it, plot, txSel.els.slice());
}
function txReset(it, els) {
  if (plotting) return;
  txPreview = null; resetTexts(it, els);
  txUndoable(t('texts.toast.reset'));
}
function txSetPreview(id) {
  if ((!id && !txPreview) || (txPreview && txPreview.font === id)) return;
  txPreview = id ? { font: id } : null;
  if (id && id !== 'builtin' && !fontCache.has(id)) loadFont(id).then(() => render(), () => { txFail.add(id); render(); });
  render();
}
function txSetCompare(on) {
  txCompare = on; const b = document.querySelector('#props #txCompare'); if (b) b.setAttribute('aria-pressed', on);
  render();
}
/* re-render the panel after a size/position change; the control the user is in keeps the focus. A field committed by Tab
 * re-renders only once the focus has moved on (replacing it mid-change would drop the focus). */
function txAdjRender(later) {
  const go = () => {
    const a = document.activeElement, fk = a && a.closest && a.closest('#props .tx-adj') ? a.dataset.fk : null;
    renderProps();
    const n = fk ? document.querySelector(`#props .tx-adj [data-fk="${CSS.escape(fk)}"]`) : null; if (n && !n.disabled) n.focus({ preventScroll: true });
  };
  if (later) setTimeout(go, 0); else go();
}

/* ---- lazy font loading for the picker (IntersectionObserver, 3 at a time) ---- */
const txLoadQ = []; let txLoadBusy = 0, txIO = null;
function txQueueLoad(id) {
  if (!id || id === 'builtin' || fontCache.has(id) || txFail.has(id) || txLoadQ.includes(id)) return;
  txLoadQ.push(id); txPump();
}
function txPump() {
  while (txLoadBusy < 3 && txLoadQ.length) {
    const id = txLoadQ.shift(); txLoadBusy++;
    loadFont(id).catch(() => { txFail.add(id); }).then(() => { txLoadBusy--; txPaintFont(id); txPump(); });
  }
}
function txObserve(root) {
  const lazy = [...root.querySelectorAll('.tx-opt[data-lazy]')]; if (!lazy.length) return;
  if (!('IntersectionObserver' in window)) { lazy.forEach(o => txQueueLoad(o.dataset.font)); return; }
  if (!txIO) txIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { txIO.unobserve(e.target); txQueueLoad(e.target.dataset.font); } }, { rootMargin: '60px' });
  txIO.disconnect(); lazy.forEach(o => txIO.observe(o));
}
/* a font finished loading (or failed): fill in its option(s) */
function txPaintFont(id) {
  const it = txCur(); if (!it) return;
  const info = textInfo(it).filter(r => txSel.els.includes(r.el)); if (!info.length) return;
  const modes = new Set(info.map(r => r.mode)), fonts = new Set(info.map(r => r.font));
  const mode = modes.size === 1 ? info[0].mode : 'mixed', font = fonts.size === 1 ? info[0].font : null, strs = info.map(r => r.str);
  for (const o of document.querySelectorAll(`#props .tx-opt[data-font="${CSS.escape(id)}"]`)) { o.innerHTML = txOptionInner(id, strs, mode, font); if (fontCache.has(id)) o.removeAttribute('data-lazy'); }
  // glyph warnings of the list rows may have changed as well
  for (const r of textInfo(it)) if (r.mode === 'plot' && r.font === id) { const row = document.querySelector(`#props .tx-row[data-el="${r.el}"]`); if (row) row.outerHTML = txRow(r, txSel.els.includes(r.el), row.tabIndex === 0); }
}
SWUI.on('fonts', id => txPaintFont(id));

/* ---- the registered section ---- */
const txSection = {
  id: 'svgTexts', order: 30, applies: it => it.type === 'svg' && !!(it.src.texts && it.src.texts.length),
  render: txRender,
  bind(it, root) {
    const get = () => items.find(i => i.id === it.id) || it; // the item may have been replaced by undo
    const q = s => root.querySelector(s), info = () => textInfo(get());
    const list = q('.tx-list'), fonts = q('.tx-fonts');
    // bulk
    bindEl(root, 'pConv', 'click', () => { if (!plotting) convertTexts(get(), true); });
    bindEl(root, 'pRevert', 'click', () => txReset(get(), null));
    // list: click, keyboard, hover
    const rangeTo = el => { const ids = info().map(r => r.el), a = ids.indexOf(txAnchor != null ? txAnchor : txSel.els[0] != null ? txSel.els[0] : el), b = ids.indexOf(el); return ids.slice(Math.min(a, b), Math.max(a, b) + 1); };
    list.addEventListener('click', e => {
      const row = e.target.closest('.tx-row'); if (!row) return; const el = +row.dataset.el;
      if (e.shiftKey) txSetSel(rangeTo(el), { reveal: true, anchor: false });
      else if (e.metaKey || e.ctrlKey) { const s = new Set(txSel.els); s.has(el) ? s.delete(el) : s.add(el); txSetSel([...s], { reveal: true }); }
      else txSetSel([el], { reveal: true });
    });
    list.addEventListener('keydown', e => {
      const ids = info().map(r => r.el), row = e.target.closest('.tx-row'); if (!row) return;
      const el = +row.dataset.el, i = ids.indexOf(el); let to = null;
      if (e.key === 'ArrowDown') to = ids[Math.min(ids.length - 1, i + 1)]; else if (e.key === 'ArrowUp') to = ids[Math.max(0, i - 1)];
      else if (e.key === 'Home') to = ids[0]; else if (e.key === 'End') to = ids[ids.length - 1];
      if (to != null) {
        e.preventDefault(); e.stopPropagation(); txFocusKey = 'r' + to;
        if (e.shiftKey) txSetSel(rangeTo(to), { reveal: true, anchor: false }); else txSetSel([to], { reveal: true });
        if (txFocusKey) { const n = list.querySelector(`[data-fk="${txFocusKey}"]`); txFocusKey = null; if (n) n.focus({ preventScroll: true }); } // no refresh happened: move focus ourselves
        return;
      }
      if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); txSetSel(ids, { reveal: false }); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (e.metaKey || e.ctrlKey) { const s = new Set(txSel.els); s.has(el) ? s.delete(el) : s.add(el); txSetSel([...s]); } else txSetSel([el], { reveal: true }); return; }
      if (e.key === 'Escape' && txSel.els.length) { e.preventDefault(); e.stopPropagation(); txSetSel([]); return; }
      if (e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow')) e.stopPropagation(); // never move/delete the whole item from here
    });
    list.addEventListener('pointerover', e => { const row = e.target.closest('.tx-row'); if (row && e.pointerType !== 'touch') txSetHover({ id: it.id, el: +row.dataset.el }); });
    list.addEventListener('pointerleave', () => txSetHover(null));
    // card
    const mode = q('.tx-mode'); if (mode) mode.addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b && b.getAttribute('aria-pressed') !== 'true') txSetMode(get(), b.dataset.mode === 'plot'); });
    bindEl(root, 'txUpload', 'click', () => { if (plotting) return; fontTarget = { it: get(), els: txSel.els.slice() }; fontTargetConvert = true; $('#fontIn').click(); });
    bindEl(root, 'txBuiltin', 'click', () => txChooseFont('builtin'));
    bindEl(root, 'txAll', 'click', () => { const f = textStyleOf(get(), txSel.els[0]).font; txChooseFont(f, true); });
    bindEl(root, 'txReset', 'click', () => txReset(get(), txSel.els.slice()));
    // size & position of the plotted texts in the selection: one undo step per change, then the panel is re-rendered
    const adjEls = () => { const cur = get(); return txSel.els.filter(el => textStyleOf(cur, el).mode === 'plot'); };
    const adjCommit = (later, change) => { const cur = get(), els = adjEls(); if (els.length && !plotting && change(cur, els)) invalidate(true); txAdjRender(later); };
    bindEl(root, 'txAdjSmaller', 'click', () => adjCommit(false, (c, els) => { sizeTexts(c, els, { mul: 0.95 }); return true; }));
    bindEl(root, 'txAdjLarger', 'click', () => adjCommit(false, (c, els) => { sizeTexts(c, els, { mul: 1.05 }); return true; }));
    bindEl(root, 'txAdjSize', 'change', e => {   // typed value (Enter or leaving the field) sets the factor of every selected text
      const k = parseFloat(e.target.value) / 100;
      adjCommit(true, (c, els) => { if (!(k > 0) || Math.abs(k - textAdjInfo(c, els).k) < 1e-9) return false; sizeTexts(c, els, { k }); return true; });
    });
    for (const [id, axis] of [['txAdjX', 'x'], ['txAdjY', 'y']]) bindEl(root, id, 'change', e => { // only the edited axis moves
      const v = parseFloat(e.target.value);
      adjCommit(true, (c, els) => { const d = v - textAdjInfo(c, els)[axis]; if (!isFinite(d) || Math.abs(d) < 1e-6) return false; moveTexts(c, els, axis === 'x' ? d : 0, axis === 'y' ? d : 0); return true; });
    });
    bindEl(root, 'txAdjReset', 'click', () => adjCommit(false, (c, els) => { resetTextAdj(c, els); return true; }));
    bindEl(root, 'txAdjFit', 'click', () => { if (!plotting) fitTextsToOriginal(get(), adjEls()); }); // re-renders by itself when it changed something
    const adjBox = q('.tx-adj'); // keys in this section never reach the canvas shortcuts (Delete, arrows, Escape); Ctrl/Cmd combos (undo) still do
    if (adjBox) adjBox.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey) e.stopPropagation(); });
    const cmp = q('#txCompare');
    if (cmp) { // toggle; holding the button shows it only while pressed
      let t0 = 0;
      cmp.addEventListener('pointerdown', e => { if (e.button) return; t0 = Date.now(); txSetCompare(!txCompare); cmp.dataset.held = '1'; });
      const rel = () => { if (cmp.dataset.held) { delete cmp.dataset.held; if (Date.now() - t0 > 450 && txCompare) txSetCompare(false); } };
      cmp.addEventListener('pointerup', rel); cmp.addEventListener('pointerleave', rel); cmp.addEventListener('pointercancel', rel);
      cmp.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); txSetCompare(!txCompare); } });
    }
    // font picker: hover/focus = ghost on the sheet, click/Enter = apply
    if (fonts) {
      const opts = () => [...fonts.querySelectorAll('.tx-opt')];
      fonts.addEventListener('click', e => { const o = e.target.closest('.tx-opt'); if (o) txChooseFont(o.dataset.font); });
      fonts.addEventListener('pointerover', e => { const o = e.target.closest('.tx-opt'); if (o && e.pointerType !== 'touch') txSetPreview(o.dataset.font); });
      fonts.addEventListener('pointerleave', () => { const f = fonts.querySelector('.tx-opt:focus-visible'); txSetPreview(f ? f.dataset.font : null); });
      fonts.addEventListener('focusin', e => {
        const o = e.target.closest('.tx-opt'); if (!o) return;
        opts().forEach(x => x.tabIndex = x === o ? 0 : -1);
        if (o.matches(':focus-visible')) txSetPreview(o.dataset.font);
      });
      fonts.addEventListener('focusout', e => { if (!e.relatedTarget || !fonts.contains(e.relatedTarget)) txSetPreview(null); });
      fonts.addEventListener('keydown', e => {
        const o = e.target.closest('.tx-opt'); if (!o) return; const all = opts(), i = all.indexOf(o); let to = null;
        if (e.key === 'ArrowDown') to = all[Math.min(all.length - 1, i + 1)]; else if (e.key === 'ArrowUp') to = all[Math.max(0, i - 1)];
        else if (e.key === 'Home') to = all[0]; else if (e.key === 'End') to = all[all.length - 1];
        if (to) { e.preventDefault(); e.stopPropagation(); to.focus(); to.scrollIntoView({ block: 'nearest' }); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); txChooseFont(o.dataset.font); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); txSetPreview(null); return; }
        if (e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow')) e.stopPropagation();
      });
    }
    txObserve(root);
  }
};
SWUI.inspector.register(txSection);

/* ---- pre-flight (shown above "Plot starten") ---- */
SWUI.preflight.register({
  id: 'texts', order: 40, check() {
    const svgs = items.filter(i => i.visible && i.type === 'svg' && i.src.texts && i.src.texts.length);
    if (!svgs.length) return null;
    let total = 0, un = 0; const chars = new Set(); let firstBad = null;
    for (const it of svgs) for (const r of textInfo(it)) {
      total++;
      if (r.mode !== 'plot') { un++; continue; }
      const cov = textCoverage(r.str, r.font);
      if (txBad(cov)) { cov.substituted.concat(cov.missing).forEach(c => chars.add(c)); if (!firstBad) firstBad = { it, el: r.el }; }
    }
    if (un) {
      return { state: 'warn', confirm: true, label: tn('texts.pre.unconverted', un), detail: t('texts.pre.unconvertedDetail'),
        action: { label: t('texts.convertAll'), run: async () => { for (const it of svgs) await convertTexts(it, true, textInfo(it).filter(r => r.mode !== 'plot').map(r => r.el)); } } };
    }
    if (chars.size) {
      return { state: 'warn', label: t('texts.pre.glyphs'), detail: t('texts.pre.glyphsDetail', { chars: txList([...chars].slice(0, 12)) }),
        action: { label: t('texts.pre.review'), run: () => { select(firstBad.it.id); txSetSel([firstBad.el], { reveal: true }); } } };
    }
    return { state: 'ok', label: tn('texts.pre.ok', total) };
  }
});
