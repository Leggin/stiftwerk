/* ---------------- SVG texts on the canvas ----------------
 * Texts not yet converted are drawn by the browser in their SVG font (they are not plotted). The same painter serves the
 * "compare with original" overlay and the width measurement used for picking (27-text-pick.js). */
/* set a valid canvas font for a run at the given size (px); unknown families fall back to sans-serif */
function svgRunFont(c, t, size) {
  c.font = '7px sans-serif';
  c.font = `${t.style === 'italic' ? 'italic ' : ''}${t.weight || 400} ${size}px ${t.family || 'sans-serif'}`;
  if (c.font === '7px sans-serif') c.font = `${size}px sans-serif`;
}
/* paint one run in its original font. F = run units → screen px (css); opts: color, alpha, fill (force filled glyphs), composite */
function txPaintRun(c, t, F, opts = {}) {
  c.save(); c.setTransform(dpr * F[0], dpr * F[1], dpr * F[2], dpr * F[3], dpr * F[4], dpr * F[5]); c.scale(0.01, 0.01);
  svgRunFont(c, t, t.fs * 100);
  if ('letterSpacing' in c) c.letterSpacing = (t.ls * 100) + 'px';
  c.textAlign = t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left'; c.textBaseline = 'alphabetic';
  c.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  if (opts.composite) c.globalCompositeOperation = opts.composite;
  if (t.paint === 'stroke' && !opts.fill) {
    const sc = Math.sqrt(Math.abs(F[0] * F[3] - F[1] * F[2])) * 0.01;
    c.strokeStyle = opts.color; c.lineWidth = Math.max(0.6, S.penWidth * view.k * 0.6) / sc; c.strokeText(t.str, t.x * 100, t.y * 100);
  } else { c.fillStyle = opts.color; c.fillText(t.str, t.x * 100, t.y * 100); }
  c.restore();
}
function drawSvgTexts() {
  const V = [view.k, 0, 0, view.k, view.ox, view.oy];
  for (const it of items) {
    if (!it.visible || !it.src.texts || !it.src.texts.length) continue;
    const A = mul(V, itemAffine(it));
    for (const t of it.src.texts) {
      if (textStyleOf(it, t.el).mode === 'plot') continue;
      txPaintRun(ctx, t, mul(A, t.M), { color: penColorFor(t.layer), alpha: layerOn(t.layer) ? 0.95 : 0.2 });
    }
  }
}
SWUI.overlays.register({ id: 'svgTexts', order: 10, draw: drawSvgTexts });
