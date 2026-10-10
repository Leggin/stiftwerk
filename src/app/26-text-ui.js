/* "Texte & Schriften" inspector section for SVG items with <text> (interim – replaced by the per-text UI later) */
SWUI.inspector.register({
  id: 'svgTexts', order: 30, applies: it => it.type === 'svg' && !!(it.src.texts && it.src.texts.length),
  render(it) {
    const c = textCounts(it), els = textEls(it), font = textStyleOf(it, els[0].el).font;
    return `<div class="note ${c.unconverted ? 'warn' : ''}"><strong>${tHtml('texts.summary', { plotted: c.plotted, total: c.total })}</strong>${c.unconverted ? tHtml('texts.hint.svg') : ''}</div>
    ${fontSelect(font)}
    <div class="row">${c.unconverted ? `<button class="btn sm primary" id="pConv">${tHtml('texts.convertAll')}</button>` : ''}${c.plotted ? `<button class="btn sm" id="pRevert">${tHtml('texts.revertAll')}</button>` : ''}</div>`;
  },
  bind(it, root) {
    bindEl(root, 'pFont', 'change', e => applyFont(it, e.target.value));
    bindEl(root, 'pConv', 'click', () => convertTexts(it, true));
    bindEl(root, 'pRevert', 'click', () => convertTexts(it, false));
  }
});
