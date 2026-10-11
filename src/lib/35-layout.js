/* Layout helpers, pure: align / distribute boxes, snapping with guides, copies in a grid, cut marks.
 * A box is { x, y, w, h } in page mm. Functions return moves ({ dx, dy } per box) instead of changing anything. */
const SWLayout = (() => {
  const cx = b => b.x + b.w / 2, cy = b => b.y + b.h / 2;
  const union = bs => { const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  /* mode: left | hcenter | right | top | vcenter | bottom. ref: a box to align to (the sheet or its margin box);
   * without ref, several boxes align to their common bounds. → [{ dx, dy }] */
  function align(boxes, mode, ref) {
    const r = ref || union(boxes);
    return boxes.map(b => {
      switch (mode) {
        case 'left': return { dx: r.x - b.x, dy: 0 };
        case 'right': return { dx: r.x + r.w - (b.x + b.w), dy: 0 };
        case 'hcenter': return { dx: cx(r) - cx(b), dy: 0 };
        case 'top': return { dx: 0, dy: r.y - b.y };
        case 'bottom': return { dx: 0, dy: r.y + r.h - (b.y + b.h) };
        case 'vcenter': return { dx: 0, dy: cy(r) - cy(b) };
        default: return { dx: 0, dy: 0 };
      }
    });
  }
  /* equal gaps between boxes along axis 'x' | 'y' (the outer two stay); fewer than 3 boxes: no change */
  function distribute(boxes, axis) {
    const out = boxes.map(() => ({ dx: 0, dy: 0 }));
    if (boxes.length < 3) return out;
    const p = axis === 'y' ? 'y' : 'x', s = axis === 'y' ? 'h' : 'w';
    const order = boxes.map((b, i) => i).sort((a, b) => boxes[a][p] - boxes[b][p]);
    const first = boxes[order[0]], lastEnd = Math.max(...boxes.map(b => b[p] + b[s]));
    const total = boxes.reduce((a, b) => a + b[s], 0), gap = (lastEnd - first[p] - total) / (boxes.length - 1);
    let at = first[p];
    for (const i of order) { const d = at - boxes[i][p]; out[i] = p === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d }; at += boxes[i][s] + gap; }
    return out;
  }
  /* snapping a moving box to lines: xs / ys = candidate positions (page edges, margins, centre, other boxes' edges and
   * centres). The box's left/centre/right (top/middle/bottom) snap to the nearest line within tol.
   * → { dx, dy, guides: [{ axis: 'x'|'y', at }] } */
  function snap(box, xs, ys, tol) {
    const pick = (vals, lines) => {
      let best = null;
      for (const v of vals) for (const l of lines) { const d = l - v; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: l }; }
      return best;
    };
    const bx = pick([box.x, cx(box), box.x + box.w], xs), by = pick([box.y, cy(box), box.y + box.h], ys);
    const guides = []; if (bx) guides.push({ axis: 'x', at: bx.at }); if (by) guides.push({ axis: 'y', at: by.at });
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides };
  }
  /* snap lines of the sheet and of other boxes */
  function snapLines(page, others) {
    const m = page.margin || 0, xs = [0, page.w, page.w / 2], ys = [0, page.h, page.h / 2];
    if (m > 0) { xs.push(m, page.w - m); ys.push(m, page.h - m); }
    for (const b of others) { xs.push(b.x, cx(b), b.x + b.w); ys.push(b.y, cy(b), b.y + b.h); }
    return { xs, ys };
  }
  /* copies in a grid inside area { x, y, w, h }: cols × rows (or as many as fit with fill), gap in mm.
   * → { cols, rows, positions: [{ x, y }] (top-left of each copy, row by row), fits } */
  function grid(w, h, area, opts) {
    const gap = Math.max(0, opts.gap || 0);
    const fitC = Math.max(1, Math.floor((area.w + gap) / (w + gap) + 1e-9)), fitR = Math.max(1, Math.floor((area.h + gap) / (h + gap) + 1e-9));
    const cols = opts.fill ? fitC : Math.max(1, opts.cols | 0), rows = opts.fill ? fitR : Math.max(1, opts.rows | 0);
    const tw = cols * w + (cols - 1) * gap, th = rows * h + (rows - 1) * gap;
    // centred in the area (when it fits)
    const x0 = area.x + Math.max(0, (area.w - tw) / 2), y0 = area.y + Math.max(0, (area.h - th) / 2);
    const positions = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) positions.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap) });
    return { cols, rows, positions, fits: tw <= area.w + 1e-6 && th <= area.h + 1e-6 };
  }
  /* crop marks at the corners of boxes: short lines outside each corner, len long, off away from the corner.
   * Marks that would fall inside another box are left out. → polylines [[x, y], …] in page mm */
  function cutMarks(boxes, len = 4, off = 1.5) {
    const out = [], inside = (x, y) => boxes.some(b => x > b.x + 1e-6 && x < b.x + b.w - 1e-6 && y > b.y + 1e-6 && y < b.y + b.h - 1e-6);
    const seen = new Set(), add = (a, b) => {
      const k = [a, b].map(p => p.map(v => v.toFixed(3)).join(',')).sort().join('|'); if (seen.has(k)) return;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (inside(a[0], a[1]) || inside(b[0], b[1]) || inside(mx, my)) return;
      seen.add(k); out.push([a, b]);
    };
    for (const b of boxes) {
      const xs = [b.x, b.x + b.w], ys = [b.y, b.y + b.h];
      for (const [i, x] of xs.entries()) for (const [j, y] of ys.entries()) {
        const sx = i ? 1 : -1, sy = j ? 1 : -1;
        add([x + sx * off, y], [x + sx * (off + len), y]);   // horizontal mark, outside the corner
        add([x, y + sy * off], [x, y + sy * (off + len)]);   // vertical mark
      }
    }
    return out;
  }
  return { align, distribute, snap, snapLines, grid, cutMarks, union };
})();
if (typeof module !== 'undefined') module.exports = SWLayout;
