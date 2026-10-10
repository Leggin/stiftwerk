/* page controls */
function renderPage() {
  $('#pgFmt').value = page.fmt; $('#pgCustom').hidden = page.fmt !== 'custom'; $('#pgW').value = page.cw; $('#pgH').value = page.ch; $('#pgMargin').value = page.margin;
  $$('#pgOrient button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === page.orient));
  $('#fmtChip').textContent = `${page.fmt === 'custom' ? 'Eigenes Maß' : FORMATS[page.fmt][2]} · ${fmt(page.w, page.w % 1 ? 1 : 0)} × ${fmt(page.h, page.h % 1 ? 1 : 0)} mm`;
  const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
  $('#pgWarn').innerHTML = (page.w > mw + 0.01 || page.h > mh + 0.01) ? `<div class="note warn"><strong>Größer als der Arbeitsbereich</strong>Der Plotter erreicht ${fmt(mw, 0)} × ${fmt(mh, 0)} mm. Alles außerhalb des gestrichelten Rahmens kann er nicht zeichnen.</div>` : '';
}
const pageChanged = () => { pageDims(); renderPage(); fitted = false; fitView(); invalidate(true); };
$('#pgFmt').onchange = e => { page.fmt = e.target.value; pageChanged(); };
$('#pgW').onchange = e => { page.cw = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgH').onchange = e => { page.ch = Math.max(10, +e.target.value || 10); pageChanged(); };
$('#pgMargin').onchange = e => { page.margin = Math.max(0, +e.target.value || 0); pageChanged(); };
$('#pgOrient').onclick = e => { const b = e.target.closest('button'); if (b) { page.orient = b.dataset.v; pageChanged(); } };

