/* ---------------- copies on the sheet ("Kopien auf dem Blatt") ----------------
 * Opened from an object's ⋯ menu (60-objects.js → dcOpenCopies). The options are remembered (store 'copiesOpts').
 * The summary is computed with copiesPlan() (34-arrange.js). A plan with more than DC_COPIES_MAX copies is refused
 * before SWLayout.grid() builds the positions, so a tiny object with "fill" cannot freeze the page. */
const DC_COPIES_MAX = 500;
const DC_COPIES_DEFAULT = { cols: 2, rows: 1, gap: 5, fill: false, area: 'margin', marks: false };

/* any stored or typed value → a valid option set */
function dcCopiesClean(o) {
  const d = DC_COPIES_DEFAULT, s = o && typeof o === 'object' ? o : {};
  const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  return {
    cols: Math.round(num(s.cols, 1, 50, d.cols)), rows: Math.round(num(s.rows, 1, 50, d.rows)), gap: num(s.gap, 0, 100, d.gap),
    fill: !!s.fill, area: s.area === 'page' ? 'page' : 'margin', marks: !!s.marks
  };
}
/* the plan for these options: { big: true } when it would make too many copies (checked before grid() runs) */
function dcCopiesPlan(it, o) {
  const b = itemBox(it), area = pageBox(o.area !== 'page'), gap = Math.max(0, o.gap);
  const fitC = Math.floor((area.w + gap) / (b.w + gap) + 1e-9), fitR = Math.floor((area.h + gap) / (b.h + gap) + 1e-9);
  const cols = Math.max(1, o.fill ? fitC : o.cols), rows = Math.max(1, o.fill ? fitR : o.rows);
  if (!(cols * rows <= DC_COPIES_MAX)) return { big: true };
  const { g } = copiesPlan(it, o);
  return { big: false, cols: g.cols, rows: g.rows, n: g.positions.length, fits: g.fits };
}

function dcOpenCopies(id) {
  const it = items.find(i => i.id === id);
  if (!it || plotting) return;
  const o0 = dcCopiesClean(store.get('copiesOpts', null));
  let area = o0.area;
  showDialog(dcCopiesHtml(it, o0));
  const root = $('#dialog');
  const el = k => root.querySelector(`[data-f="${k}"]`);
  const colsIn = el('cols'), rowsIn = el('rows'), gapIn = el('gap'), fillIn = el('fill'), marksIn = el('marks');
  const sum = el('sum'), warn = el('warn'), go = root.querySelector('[data-ok]');
  const read = () => dcCopiesClean({ cols: colsIn.value, rows: rowsIn.value, gap: gapIn.value, fill: fillIn.checked, area, marks: marksIn.checked });
  const refresh = () => {
    const o = read(), p = dcCopiesPlan(it, o);
    colsIn.disabled = rowsIn.disabled = o.fill;
    for (const b of root.querySelectorAll('[data-area]')) b.setAttribute('aria-pressed', String(b.dataset.area === area));
    sum.hidden = p.big;
    if (!p.big) sum.textContent = tn('docs.copies.sum', p.n, { cols: fmtInt(p.cols), rows: fmtInt(p.rows) });
    warn.hidden = !p.big && p.fits !== false;
    warn.textContent = p.big ? t('docs.copies.tooMany', { max: fmtInt(DC_COPIES_MAX) }) : t('docs.copies.noFit');
    go.disabled = p.big || (p.n < 2 && !o.marks);
    go.textContent = p.big || p.n < 2 ? t('docs.copies.go') : tn('docs.copies.create', p.n);
  };
  for (const b of root.querySelectorAll('[data-area]')) b.addEventListener('click', () => { area = b.dataset.area; refresh(); });
  for (const f of root.querySelectorAll('input')) { f.addEventListener('input', refresh); f.addEventListener('change', refresh); }
  for (const f of [colsIn, rowsIn, gapIn]) f.addEventListener('keydown', e => { if (e.key === 'Enter' && !go.disabled) { e.preventDefault(); go.click(); } });
  go.addEventListener('click', () => {
    if (go.disabled || plotting) return;
    const o = read(); store.set('copiesOpts', o);
    const r = makeCopies(id, o);
    closeDialog();
    if (r) toast(tn('docs.copies.done', r.made), { action: { label: t('common.undo'), run: undo } });
  });
  refresh();
}
function dcCopiesHtml(it, o) {
  return `<h3>${esc(t('docs.copies.title'))}</h3>
    <p class="hint">${tHtml('docs.copies.hint', { name: itemName(it) })}</p>
    <div class="dc-cp">
      <div class="grid2">
        <label class="dc-stack"><span class="cap">${tHtml('docs.copies.cols')}</span><span class="inp"><input type="number" min="1" max="50" step="1" inputmode="numeric" value="${o.cols}" autofocus data-f="cols"></span></label>
        <label class="dc-stack"><span class="cap">${tHtml('docs.copies.rows')}</span><span class="inp"><input type="number" min="1" max="50" step="1" inputmode="numeric" value="${o.rows}" data-f="rows"></span></label>
      </div>
      <label class="check"><input type="checkbox" data-f="fill"${o.fill ? ' checked' : ''}><span>${tHtml('docs.copies.fill')}<small>${tHtml('docs.copies.fillHint')}</small></span></label>
      <label class="dc-stack"><span class="cap">${tHtml('docs.copies.gap')}</span><span class="inp"><input type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${o.gap}" data-f="gap"><b>${tHtml('unit.mm')}</b></span></label>
      <div class="dc-stack">
        <span class="cap">${tHtml('docs.copies.area')}</span>
        <div class="seg" role="group" aria-label="${tHtml('docs.copies.area')}"><button type="button" data-area="margin" aria-pressed="false">${tHtml('docs.copies.margin')}</button><button type="button" data-area="page" aria-pressed="false">${tHtml('docs.copies.page')}</button></div>
      </div>
      <label class="check"><input type="checkbox" data-f="marks"${o.marks ? ' checked' : ''}><span>${tHtml('copies.marks')}<small>${tHtml('docs.copies.marksHint')}</small></span></label>
      <p class="note" data-f="sum" role="status"></p>
      <p class="note warn" data-f="warn" hidden></p>
    </div>
    <div class="row"><button class="btn" data-close>${tHtml('common.cancel')}</button><button class="btn primary" data-ok>${tHtml('docs.copies.go')}</button></div>`;
}
