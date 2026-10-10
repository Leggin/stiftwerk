/* texts not yet converted: drawn with the browser in their SVG font (they are not plotted) */
function drawSvgTexts() {
  const V = [view.k, 0, 0, view.k, view.ox, view.oy];
  for (const it of items) {
    if (!it.visible || !it.src.texts || !it.src.texts.length) continue;
    const A = mul(V, itemAffine(it));
    for (const t of it.src.texts) {
      if (textStyleOf(it, t.el).mode === 'plot') continue;
      const F = mul(A, t.M), col = penColorFor(t.layer);
      ctx.save(); ctx.setTransform(dpr * F[0], dpr * F[1], dpr * F[2], dpr * F[3], dpr * F[4], dpr * F[5]); ctx.scale(0.01, 0.01);
      const size = t.fs * 100;
      ctx.font = `${t.style === 'italic' ? 'italic ' : ''}${t.weight || 400} ${size}px ${t.family || 'sans-serif'}`;
      if (!ctx.font.includes(String(Math.round(size)).slice(0, 2))) ctx.font = `${size}px sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = (t.ls * 100) + 'px';
      ctx.textAlign = t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = layerOn(t.layer) ? 0.95 : 0.2;
      if (t.paint === 'stroke') {
        const sc = Math.sqrt(Math.abs(F[0] * F[3] - F[1] * F[2])) * 0.01;
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, S.penWidth * view.k * 0.6) / sc; ctx.strokeText(t.str, t.x * 100, t.y * 100);
      } else { ctx.fillStyle = col; ctx.fillText(t.str, t.x * 100, t.y * 100); }
      ctx.restore();
    }
  }
}
SWUI.overlays.register({ id: 'svgTexts', order: 10, draw: drawSvgTexts });

