/* ---------------- step ② Stifte ----------------
 * One pen / several pens switch, colour assignment, canvas highlight on hover, merge suggestion, pre-flight check.
 * Everything is rendered into #penList; DOM is morphed (not replaced) so focus and open colour pickers survive updates. */
const PN_PRESETS = ['#2e2e2c', '#2a44d4', '#d22b2b', '#2f8f4e', '#7a4b2a', '#e07a1f', '#7b3fb0', '#d8478f'];   // typical fineliner inks
const pnBox = $('#penList');
let pnHl = null, pnHlSig = '', pnHlTimer = 0;            // hovered/focused pen or colour → highlighted on the canvas
const pnDismissed = new Set(), pnAnnounced = new Set();  // declined merge suggestions, already announced groupings (this session)
const pnSingle = () => doc.penMode === SWPens.SINGLE;
const pnHex = c => /^#[0-9a-f]{6}$/i.test(c) ? String(c).toLowerCase() : '#000000';
const pnByOrder = (a, b) => ((layerMeta[a] && layerMeta[a].order) || 0) - ((layerMeta[b] && layerMeta[b].order) || 0);
const pnOnColor = hex => { const [r, g, b] = SWColor.hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#262421' : '#ffffff'; };
const pnIco = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const PN_NIB = 'M12 22 6 12l3-9h6l3 9z';
const PN_ICON = {
  up: pnIco('<path d="m6 15 6-6 6 6"/>'), down: pnIco('<path d="m6 9 6 6 6-6"/>'),
  trash: pnIco('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  plus: pnIco('<path d="M12 5v14M5 12h14"/>'), check: pnIco('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  merge: pnIco('<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>'),
  one: pnIco(`<path d="${PN_NIB}"/><path d="M12 22v-8"/>`),
  many: pnIco(`<g stroke-width="3.3" transform="translate(-2.2 5.5) scale(.6)"><path d="${PN_NIB}"/></g><g stroke-width="3.3" transform="translate(4.8 2.5) scale(.6)"><path d="${PN_NIB}"/></g><g stroke-width="3.3" transform="translate(11.8 5.5) scale(.6)"><path d="${PN_NIB}"/></g>`)
};

/* ---- tiny DOM morph: sync `root` to the markup `html`, keeping focus, typed text and open pickers ---- */
function pnMorph(root, html) { const tpl = document.createElement('template'); tpl.innerHTML = html; pnKids(root, tpl.content); }
function pnKids(a, b) {
  const A = a.childNodes, B = b.childNodes;
  for (let i = 0; i < B.length; i++) {
    const nb = B[i], na = A[i];
    if (!na) { a.appendChild(nb.cloneNode(true)); continue; }
    if (na.nodeType !== nb.nodeType || (na.nodeType === 1 && (na.nodeName !== nb.nodeName || na.getAttribute('data-mk') !== nb.getAttribute('data-mk')))) { a.replaceChild(nb.cloneNode(true), na); continue; }
    if (na.nodeType === 3) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; }
    else if (na.nodeType === 1) pnSyncEl(na, nb);
  }
  while (A.length > B.length) a.removeChild(a.lastChild);
}
function pnSyncEl(a, b) {
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  if (a.nodeName === 'INPUT') {
    if (a.type === 'checkbox') a.checked = b.hasAttribute('checked');
    else { const v = b.getAttribute('value') || ''; if (a !== document.activeElement && a.value !== v) a.value = v; }
  }
  pnKids(a, b);
  if (a.nodeName === 'SELECT' && a.dataset.sel != null) a.value = a.dataset.sel;
}

/* ---- markup ---- */
function pnSwitchHtml(single) {
  return `<div class="pn-switch" role="group" aria-label="${tHtml('pens.mode.label')}" data-mode="${single ? 'single' : 'multi'}">
    <button type="button" data-set="single" aria-pressed="${single}">${PN_ICON.one}<span>${tHtml('pens.mode.single')}</span></button>
    <button type="button" data-set="multi" aria-pressed="${!single}">${PN_ICON.many}<span>${tHtml('pens.mode.multi')}</span></button></div>
    <p class="pn-line">${tHtml(single ? 'pens.mode.single.line' : 'pens.mode.multi.line')}</p>`;
}
/* a nice swatch with the native colour input hidden on top of it */
function pnColorBtn(id, color, label, big) {
  const c = pnHex(color);
  return `<span class="pn-sw${big ? ' big' : ''}" title="${esc(label)}"><input type="color" class="pn-colorin" data-pen="${esc(id)}" value="${c}" aria-label="${esc(label)}"><span class="pn-dot" style="--c:${c}"></span></span>`;
}
/* the library chip (or "Aus Bibliothek") under the note: plLibControl, 64-penlib-ui.js */
function pnOwnCard() {
  const c = pnHex(doc.single.color);
  const presets = PN_PRESETS.map(h => { const sel = h === c, n = colorWord(h); return `<button type="button" class="pn-preset" data-c="${h}" style="--c:${h};--on:${pnOnColor(h)}" aria-pressed="${sel}" title="${esc(n)}" aria-label="${esc(n)}">${sel ? PN_ICON.check : ''}</button>`; }).join('');
  return `<div class="pn-card pn-own">
    <h3 class="pn-h">${tHtml('pens.single.title')}</h3>
    <div class="pn-own-top">
      ${pnColorBtn('single', c, t('pens.single.pick'), true)}
      <label class="pn-namefield"><span class="pn-cap">${tHtml('pens.name')}</span><input type="text" class="pn-name" data-pen="single" value="${esc(doc.single.name || '')}" placeholder="${esc(penLabel(doc.single))}" maxlength="40" autocomplete="off"></label>
    </div>
    <div class="pn-presets" role="group" aria-label="${tHtml('pens.presets')}">${presets}</div>
    <p class="pn-note">${tHtml('pens.single.hint')}</p>
    <div class="pl-own">${plLibControl(SWPens.SINGLE)}</div>
  </div>`;
}
/* one row per design colour: include checkbox, original colour, name, share of line length – and in multi mode its pen */
function pnRowsHtml(keys, lens, total, multi, pens) {
  return `<ul class="pn-rows${multi ? ' multi' : ''}">${keys.map(k => {
    const m = layerMeta[k], on = layerOn(k), name = colorLabel(k), pct = total ? Math.round((lens.get(k) || 0) / total * 100) : 0;
    const tail = multi
      ? `<label class="pn-pensel"><span class="pn-cap">${tHtml('pens.colors.pen')}</span><span class="pn-selwrap"><span class="pn-dot xs" style="--c:${pnHex(penColorFor(k))}"></span><select class="pn-sel" data-key="${esc(k)}" data-sel="${esc(m.pen)}" aria-label="${esc(t('pens.colors.penFor', { name }))}">${pens.map(p => `<option value="${esc(p.id)}"${p.id === m.pen ? ' selected' : ''}>${esc(penLabel(p))}</option>`).join('')}</select></span></label>`
      : '';
    return `<li class="pn-row${on ? '' : ' off'}" data-mk="key:${esc(k)}" data-hl="key:${esc(k)}">
      <label class="pn-inc"><input type="checkbox" class="pn-en" data-key="${esc(k)}"${on ? ' checked' : ''}><span class="pn-dot sm" style="--c:${pnHex(m.color)}"></span><span class="pn-lbl">${esc(name)}</span></label>
      <span class="pn-share" title="${esc(t('pens.colors.share', { pct }))}"><i style="width:${pct}%"></i></span><span class="meta pn-pct">${tHtml('pens.colors.pct', { pct })}</span>${tail}
    </li>`;
  }).join('')}</ul>`;
}
function pnColorsSection(used, lens, multi, pens) {
  const total = used.reduce((s, k) => s + (lens.get(k) || 0), 0);
  if (used.length < 2) return `<p class="pn-one"><span class="pn-dot sm" style="--c:${pnHex(layerMeta[used[0]].color)}"></span>${tHtml('pens.colors.one', { name: colorLabel(used[0]) })}</p>`;
  return `<div class="pn-sec2"><h3 class="pn-h">${tHtml('pens.colors.title')}</h3><p class="pn-sub">${tHtml('pens.colors.sub')}</p>${pnRowsHtml(used, lens, total, multi, pens)}</div>`;
}
/* the pen's library chip (plLibControl, 64-penlib-ui.js) sits at the end of the foot line */
function pnPenCard(p, i, n, num, used, lens) {
  const keys = used.filter(k => layerMeta[k].pen === p.id), onKeys = keys.filter(layerOn);
  const len = onKeys.reduce((s, k) => s + (lens.get(k) || 0), 0), name = penLabel(p), only = n < 2 && keys.length;
  const chips = keys.map(k => `<span class="pn-chip${layerOn(k) ? '' : ' off'}"><span class="pn-dot xs" style="--c:${pnHex(layerMeta[k].color)}"></span>${esc(colorLabel(k))}</span>`).join('');
  const foot = !keys.length ? `<span class="pn-empty">${tHtml('pens.pen.empty')}</span>`
    : `<span class="pn-chips">${chips}</span>` + (onKeys.length ? `<span class="meta">${tHtml('pens.pen.length', { v: fmt(len / 1000, 2) })}</span>` : `<span class="pn-tag">${tHtml('pens.pen.unused')}</span>`);
  const btn = (act, ico, key, dis) => `<button type="button" class="pn-ibtn" data-act="${act}" data-pen="${esc(p.id)}" aria-label="${esc(t(key, { name }))}" title="${esc(t(key, { name }))}"${dis ? ' disabled' : ''}>${ico}</button>`;
  return `<li class="pn-card pn-pen${onKeys.length ? '' : ' idle'}" data-mk="pen:${esc(p.id)}" data-hl="pen:${esc(p.id)}">
    <div class="pn-pen-head">
      <span class="pn-num" aria-hidden="true">${num || '–'}</span>
      ${pnColorBtn(p.id, p.color, t('pens.color.of', { name }))}
      <label class="pn-namefield"><span class="pn-sr">${tHtml('pens.name.of', { i: i + 1 })}</span><input type="text" class="pn-name" data-pen="${esc(p.id)}" value="${esc(p.name || '')}" placeholder="${esc(name)}" maxlength="40" autocomplete="off"></label>
      <span class="pn-tools">${btn('up', PN_ICON.up, 'pens.pen.up', i === 0)}${btn('down', PN_ICON.down, 'pens.pen.down', i === n - 1)}${btn('remove', PN_ICON.trash, 'pens.pen.remove', only)}</span>
    </div>
    <div class="pn-pen-foot">${foot}${plLibControl(p.id)}</div>
  </li>`;
}
function pnMergeBanner(used, lens) {
  const sug = SWPens.suggestions(doc, layerMeta, used).find(([a, b]) => !pnDismissed.has(a + '+' + b)); if (!sug) return '';
  const len = id => used.filter(k => layerMeta[k].pen === id && layerOn(k)).reduce((s, k) => s + (lens.get(k) || 0), 0);
  const [keep, drop] = len(sug[0]) >= len(sug[1]) ? sug : [sug[1], sug[0]];
  const A = SWPens.penById(doc, keep), B = SWPens.penById(doc, drop);
  return `<div class="pn-banner" role="status" data-mk="merge">${PN_ICON.merge}<p>${tHtml('pens.merge.text', { a: penLabel(A), b: penLabel(B) })}</p>
    <div class="pn-banner-btns"><button type="button" class="btn sm primary" data-act="merge" data-keep="${esc(keep)}" data-drop="${esc(drop)}">${tHtml('pens.merge.do')}</button><button type="button" class="btn sm ghost" data-act="nomerge" data-pair="${esc(sug[0] + '+' + sug[1])}">${tHtml('pens.merge.no')}</button></div></div>`;
}
function pnHtml() {
  const single = pnSingle(), used = job ? job.usedKeys.slice().sort(pnByOrder) : [], lens = job ? job.colorLengths : new Map();
  let h = pnSwitchHtml(single);
  if (single) h += pnOwnCard();
  if (!used.length) return h + `<p class="empty">${tHtml(single ? 'pens.empty.colors' : 'pens.empty')}</p>`;
  if (single) {
    h += pnColorsSection(used, lens, false, []);
    if (used.length > 1) h += `<div class="pn-tip" data-mk="tip"><p>${tHtml('pens.multi.hint', { n: used.length })}</p><button type="button" class="btn sm" data-act="multi">${tHtml('pens.multi.use')}</button></div>`;
  } else {
    const pens = SWPens.visiblePens(doc, layerMeta, used), plotted = job.plotLayers, changes = Math.max(0, plotted.length - 1);
    h += pnMergeBanner(used, lens);
    h += `<div class="pn-sec2"><div class="pn-headrow"><h3 class="pn-h">${tHtml('pens.multi.title')}</h3><span class="meta">${tnHtml('pens.count', plotted.length)} · ${tnHtml('pens.changes', changes)}</span></div>
      <p class="pn-sub">${tHtml('pens.multi.order')}</p>
      <ol class="pn-pens">${pens.map((p, i) => pnPenCard(p, i, pens.length, plotted.findIndex(L => L.pen === p.id) + 1, used, lens)).join('')}</ol>
      ${used.length > 1 ? `<button type="button" class="pn-add" data-act="add">${PN_ICON.plus}<span>${tHtml('pens.pen.add')}</span></button>` : ''}</div>`;
    h += pnColorsSection(used, lens, true, pens);
  }
  if (!used.some(layerOn)) h += `<div class="note warn pn-warn" role="status">${tHtml('pens.colors.allOff')}</div>`;
  return h;
}
function renderPens() {
  const pane = $('[data-step-pane="pens"]'); if (!pane || pane.hidden) return;   // rendered when the step opens ('step' event)
  $('#penCount').textContent = '';   // the summary lives next to the pen cards
  pnMorph(pnBox, pnHtml());
}

/* ---- actions ---- */
function pnSetMode(mode) {
  if ((mode === 'single') === pnSingle()) return;
  SWPens.setMode(doc, mode); invalidate(true);
  if (!pnSingle() && job) {   // colours that were grouped with similar ones while the doc was in single mode
    const by = new Map(); for (const k of job.usedKeys) { const id = layerMeta[k] && layerMeta[k].pen; if (id) by.set(id, (by.get(id) || []).concat(k)); }
    pnAnnounceGroups([...by].map(([pen, keys]) => ({ pen, keys })).filter(g => new Set(g.keys.map(k => pnHex(layerMeta[k].color))).size > 1));
  }
}
function pnSetColor(id, color, final) {
  const p = id === 'single' ? doc.single : SWPens.penById(doc, id); if (!p) return;
  p.color = pnHex(color); invalidate(final);
}
function pnMove(id, dir) {
  if (!SWPens.movePen(doc, id, dir)) return;
  invalidate(true);
  const card = pnBox.querySelector(`[data-mk="pen:${CSS.escape(id)}"]`); if (!card) return;
  const b = card.querySelector(`[data-act="${dir < 0 ? 'up' : 'down'}"]:not(:disabled)`) || card.querySelector('[data-act]:not(:disabled)'); if (b) b.focus();
}
function pnAddPen() {
  const taken = doc.pens.map(p => p.color), color = PN_PRESETS.find(h => !taken.some(c => SWColor.similar(c, h))) || PN_PRESETS[0];
  const p = SWPens.newPen(doc, color, null, true); invalidate(true);
  const el = pnBox.querySelector(`[data-mk="pen:${CSS.escape(p.id)}"] .pn-name`); if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
}
function pnRemovePen(id) {
  const p = SWPens.penById(doc, id); if (!p || !job) return;
  const members = job.usedKeys.filter(k => layerMeta[k] && layerMeta[k].pen === id);
  const others = SWPens.visiblePens(doc, layerMeta, job.usedKeys).filter(x => x.id !== id);
  const into = others.slice().sort((a, b) => SWColor.dist(p.color, a.color) - SWColor.dist(p.color, b.color))[0] || null;
  const name = penLabel(p), intoName = into ? penLabel(into) : '';
  if (!SWPens.removePen(doc, layerMeta, id, into && into.id)) return;
  invalidate(true);
  if (members.length && into) toast(t('pens.pen.removed', { name, into: intoName }), { action: { label: t('common.undo'), run: undo } });
}
function pnMerge(keep, drop) {
  if (!SWPens.mergePens(doc, layerMeta, keep, drop)) return;
  invalidate(true); toast(t('pens.merge.done'), { action: { label: t('common.undo'), run: undo } });
}

pnBox.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !pnBox.contains(b) || plotting) return;
  if (b.dataset.set) return pnSetMode(b.dataset.set);
  if (b.classList.contains('pn-preset')) return pnSetColor('single', b.dataset.c, true);
  switch (b.dataset.act) {
    case 'up': return pnMove(b.dataset.pen, -1);
    case 'down': return pnMove(b.dataset.pen, 1);
    case 'remove': return pnRemovePen(b.dataset.pen);
    case 'add': return pnAddPen();
    case 'merge': return pnMerge(b.dataset.keep, b.dataset.drop);
    case 'nomerge': pnDismissed.add(b.dataset.pair); return renderPens();
    case 'multi': return pnSetMode('multi');
  }
});
pnBox.addEventListener('input', e => { if (!plotting && e.target.classList.contains('pn-colorin')) pnSetColor(e.target.dataset.pen, e.target.value, false); });
pnBox.addEventListener('change', e => {
  if (plotting) return renderPens();
  const el = e.target;
  if (el.classList.contains('pn-colorin')) return pnSetColor(el.dataset.pen, el.value, true);
  if (el.classList.contains('pn-name')) { const p = el.dataset.pen === 'single' ? doc.single : SWPens.penById(doc, el.dataset.pen); if (p) { p.name = el.value.trim() || null; invalidate(true); } return; }
  if (el.classList.contains('pn-en') && layerMeta[el.dataset.key]) { layerMeta[el.dataset.key].enabled = el.checked; invalidate(true); return; }
  if (el.classList.contains('pn-sel') && layerMeta[el.dataset.key]) { SWPens.assign(layerMeta, el.dataset.key, el.value); invalidate(true); }
});

/* ---- grouping notice: "2 ähnliche Farben → ein Stift (Schwarz)" ---- */
function pnToastLater(text, opts, tries = 0) {   // after the import toast (there is only one toast element)
  setTimeout(() => { const el = $('#toast'); if (el && !el.hidden && tries < 10) pnToastLater(text, opts, tries + 1); else toast(text, opts); }, tries ? 400 : 250);
}
function pnAnnounceGroups(groups) {
  groups = groups.filter(g => g.keys.length > 1);
  const sig = groups.map(g => g.pen + ':' + g.keys.slice().sort().join(',')).sort().join('|');
  if (!groups.length || pnAnnounced.has(sig)) return; pnAnnounced.add(sig);
  const n = groups.reduce((s, g) => s + g.keys.length, 0);
  const text = groups.length === 1 ? t('pens.toast.joined', { n, pen: penLabel(SWPens.penById(doc, groups[0].pen)) }) : t('pens.toast.joinedMany', { n, m: groups.length });
  pnToastLater(text, document.body.dataset.step === 'pens' ? undefined : { action: { label: t('pens.toast.look'), run: () => showStep('pens') } });
}
function pnAnnounceJoined(res) {   // called by rebuild() with the result of SWPens.assignNew
  const ids = new Set(res.filter(r => r.joined).map(r => r.pen));
  pnAnnounceGroups([...ids].map(pen => ({ pen, keys: job.usedKeys.filter(k => layerMeta[k] && layerMeta[k].pen === pen) })));
}

/* ---- canvas highlight: hover/focus a pen or colour → everything else is veiled ---- */
function pnSetHl(v) {
  const sig = v ? v.k + ':' + v.id : ''; if (sig === pnHlSig) return;
  pnHl = v; pnHlSig = sig; render();
}
const pnParseHl = s => { const i = s.indexOf(':'); return { k: s.slice(0, i), id: s.slice(i + 1) }; };
pnBox.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const h = e.target.closest('[data-hl]'); pnSetHl(h ? pnParseHl(h.dataset.hl) : null); });
pnBox.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') pnSetHl(null); });
pnBox.addEventListener('pointerdown', e => {   // touch has no hover: show it while the finger is down and a moment longer
  if (e.pointerType !== 'touch') return; const h = e.target.closest('[data-hl]'); if (!h) return;
  pnSetHl(pnParseHl(h.dataset.hl)); clearTimeout(pnHlTimer); pnHlTimer = setTimeout(() => pnSetHl(null), 1600);
});
pnBox.addEventListener('focusin', e => { const h = e.target.closest('[data-hl]'); if (h && e.target.matches(':focus-visible')) pnSetHl(pnParseHl(h.dataset.hl)); });
pnBox.addEventListener('focusout', e => { if (!e.relatedTarget || !pnBox.contains(e.relatedTarget)) pnSetHl(null); });
function pnHlKeys() {
  if (!pnHl || plotting || !job || !job.byKey) return [];
  if (pnHl.k === 'key') return job.byKey.has(pnHl.id) ? [pnHl.id] : [];
  return job.usedKeys.filter(k => layerMeta[k] && layerMeta[k].pen === pnHl.id);
}
SWUI.overlays.register({ id: 'pnHighlight', order: 20, draw(c) {
  const keys = pnHlKeys(); if (!keys.length) return;
  const css = getComputedStyle(document.documentElement), [px, py] = toScr(0, 0);
  c.save();
  c.globalAlpha = .72; c.fillStyle = css.getPropertyValue('--sheet').trim() || '#fffdf9'; c.fillRect(px, py, page.w * view.k, page.h * view.k);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const lw = Math.max(1.2, S.penWidth * view.k * 1.3), halo = css.getPropertyValue('--accent').trim() || '#4f6b57';
  for (const [pass, w, col, a] of [[0, lw + 5, halo, .26], [1, lw, null, 1]]) {   // soft halo first so pale inks stay visible
    for (const k of keys) {
      c.strokeStyle = col || pnHex(penColorFor(k)); c.lineWidth = w; c.globalAlpha = a; c.beginPath();
      for (const pts of job.byKey.get(k) || []) { pts.forEach((q, i) => { const [x, y] = toScr(q[0], q[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); if (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1]) { const [x, y] = toScr(pts[0][0], pts[0][1]); c.moveTo(x, y); c.arc(x, y, w / 2, 0, 7); } }
      c.stroke();
    }
  }
  c.restore();
} });

/* ---- pre-flight (checklist above "Plot starten") ---- */
SWUI.preflight.register({ id: 'pens', order: 30, check() {
  const j = getJob();
  if (!j.usedKeys.length) return { state: 'info', label: t('pens.pf.empty') };
  if (!j.plotLayers.length) return { state: 'block', label: t('pens.pf.none'), action: { label: t('pens.pf.fix'), run: () => showStep('pens') } };
  const off = j.usedKeys.filter(k => !layerOn(k)).length, detail = off ? tn('pens.pf.off', off) : undefined;
  if (j.plotLayers.length < 2) return { state: 'ok', label: t('pens.pf.single', { name: j.plotLayers[0].name }), detail };
  const n = j.plotLayers.length;
  return { state: 'info', label: t('pens.pf.multi', { pens: tn('pens.count', n), changes: tn('pens.changes', n - 1) }), detail: [t('pens.pf.order', { names: j.plotLayers.map(L => L.name).join(' → ') }), detail].filter(Boolean).join(' ') };
} });

SWUI.on('job', () => {
  if (pnHl && !pnHlKeys().length) { pnHl = null; pnHlSig = ''; }
  renderPens();
});
SWUI.on('step', s => { pnSetHl(null); if (s === 'pens') renderPens(); });
SWUI.on('plot', ph => { if (ph === 'start') pnSetHl(null); if (ph === 'done' || ph === 'abort') renderPens(); });
SWUI.onRender(renderPens);
