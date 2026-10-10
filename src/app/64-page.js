/* ---------------- page ("Blatt") controls ---------------- */
const pageFmtName = f => t('page.fmt.' + f);
function renderPage() {
  $('#pgFmt').value = page.fmt; $('#pgCustom').hidden = page.fmt !== 'custom'; $('#pgW').value = page.cw; $('#pgH').value = page.ch; $('#pgMargin').value = page.margin;
  $$('#pgOrient button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === page.orient));
  const dims = `${fmt(page.w, page.w % 1 ? 1 : 0)} × ${fmt(page.h, page.h % 1 ? 1 : 0)} mm`;
  $('#fmtChip').textContent = `${pageFmtName(page.fmt)} · ${dims}`;
  $('#pgSummary').textContent = `${pageFmtName(page.fmt)} · ${t('page.orient.' + page.orient)}`;
  const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
  $('#pgWarn').innerHTML = (page.w > mw + 0.01 || page.h > mh + 0.01) ? `<div class="note warn"><strong>${tHtml('page.warn.title')}</strong>${tHtml('page.warn.body', { w: fmt(mw, 0), h: fmt(mh, 0) })}</div>` : '';
}
const pageChanged = () => { pageDims(); renderPage(); fitView(); invalidate(true); };
$('#pgFmt').onchange = e => { page.fmt = e.target.value; pageChanged(); };
$('#pgW').onchange = e => { page.cw = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgH').onchange = e => { page.ch = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgMargin').onchange = e => { page.margin = Math.max(0, +e.target.value || 0); pageChanged(); };
$('#pgOrient').onclick = e => { const b = e.target.closest('button'); if (b) { page.orient = b.dataset.v; pageChanged(); } };
/* the format chip on the canvas leads to the Blatt card (also while something is selected) */
$('#fmtChip').onclick = () => {
  if (plotting) return;
  if (step !== 'motiv') showStep('motiv');
  const d = $('#pageSec'); d.open = true;
  d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  setTimeout(() => $('#pgFmt').focus({ preventScroll: true }), 250);
};
