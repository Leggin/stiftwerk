/* ---------------- page ("Blatt") controls ---------------- */
const pageFmtName = f => t('page.fmt.' + f);
function renderPage() {
  $('#pgFmt').value = page.fmt; $('#pgCustom').hidden = page.fmt !== 'custom'; $('#pgW').value = page.cw; $('#pgH').value = page.ch; $('#pgMargin').value = page.margin;
  const machineFmt = page.fmt === 'machine';   // the sheet is the work area: its orientation and size are fixed
  $$('#pgOrient button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.v === page.orient); b.disabled = machineFmt; });
  const dims = `${fmt(page.w, page.w % 1 ? 1 : 0)} × ${fmt(page.h, page.h % 1 ? 1 : 0)} mm`;
  $('#fmtChip').textContent = `${pageFmtName(page.fmt)} · ${dims}`;
  const [mw, mh] = workArea(), tooBig = page.w > mw + 0.01 || page.h > mh + 0.01;
  $('#pgSummary').innerHTML = (tooBig ? swIcon('alert', 'sm') : '') + esc(machineFmt ? pageFmtName(page.fmt) : `${pageFmtName(page.fmt)} · ${t('page.orient.' + page.orient)}`);
  $('#pgWarn').innerHTML = tooBig ? `<div class="note warn"><strong>${tHtml('page.warn.title')}</strong>${tHtml('page.warn.body', { w: fmt(mw, 0), h: fmt(mh, 0) })}</div>` : '';
}
const pageChanged = () => { pageDims(); renderPage(); fitView(); invalidate(true); };
$('#pgFmt').onchange = e => { page.fmt = e.target.value; pageChanged(); };
$('#pgW').onchange = e => { page.cw = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgH').onchange = e => { page.ch = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgMargin').onchange = e => { page.margin = Math.max(0, +e.target.value || 0); pageChanged(); };
$('#pgOrient').onclick = e => { const b = e.target.closest('button'); if (b && page.fmt !== 'machine') { page.orient = b.dataset.v; pageChanged(); } };
/* the work area belongs to the active profile: switching profiles (or editing its size) moves a "Wie Arbeitsbereich" sheet along */
SWUI.on('profile', () => {
  const w = page.w, h = page.h;
  pageDims(); renderPage();
  if (page.w !== w || page.h !== h) invalidate(true, { sys: true });
});
/* the format chip on the canvas leads to the Blatt card (also while something is selected) */
$('#fmtChip').onclick = () => {
  if (plotting) return;
  if (step !== 'motiv') showStep('motiv');
  const d = $('#pageSec'); d.open = true;
  d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  setTimeout(() => $('#pgFmt').focus({ preventScroll: true }), 250);
};
