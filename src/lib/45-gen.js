/* Pattern generators, pure: borders, grids, spirals, rosettes, Lissajous figures, calendars, name cards.
 * make(kind, params, ctx) → { paths: [[[x, y], …]], w, h } in mm, top-left at 0,0.
 * ctx = { font (SW font object for text), months: [12 names], days: [7 short names, Monday first] } – the app passes
 * translated names and the chosen plotter font; without ctx the built-in font and English names are used.
 * DEFAULTS[kind] lists every parameter with its default; clean(kind, params) clamps user input. */
const SWGen = ((SW) => {
  const TAU = Math.PI * 2;
  const DEFAULTS = {
    border: { w: 190, h: 277, style: 'simple', gap: 2, radius: 6, amp: 1.2, period: 6, corner: 14 },
    grid: { w: 180, h: 260, style: 'lines', spacing: 5, margin: 0 },
    spiral: { r: 40, turns: 12, style: 'archimedes' },
    rosette: { R: 40, r: 15, d: 22, loops: 0 },
    lissajous: { w: 80, h: 80, a: 3, b: 4, phase: 90 },
    calendar: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, w: 150, h: 110, firstDay: 1, title: true, frame: true },
    namecard: { names: 'Anna\nBen', cw: 85, ch: 55, cols: 2, gap: 0, size: 9, frame: true }
  };
  const KINDS = Object.keys(DEFAULTS);
  const STYLES = { border: ['simple', 'double', 'rounded', 'dashed', 'wave', 'dots', 'corners'], grid: ['lines', 'squares', 'ruled', 'dots', 'iso'], spiral: ['archimedes', 'log', 'square'] };
  const num = (v, d, lo, hi) => { v = +v; if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
  /* allowed range per numeric parameter [min, max, integer?] (anything not listed: 0.1 … 2000 mm) */
  const RANGE = { year: [1900, 2200, 1], month: [1, 12, 1], firstDay: [0, 1, 1], turns: [1, 200, 1], loops: [0, 500, 1], a: [1, 20, 1], b: [1, 20, 1],
    cols: [1, 20, 1], phase: [-360, 360], gap: [0, 200], margin: [0, 500], amp: [0.1, 50], size: [1, 200] };
  /* clamp / fill params (bad input never breaks the generator) */
  function clean(kind, p) {
    const D = DEFAULTS[kind]; if (!D) throw new Error('unknown generator ' + kind);
    const o = Object.assign({}, D, p || {});
    for (const k of Object.keys(D)) {
      if (typeof D[k] === 'number') { const [lo, hi, int] = RANGE[k] || [0.1, 2000]; o[k] = num(o[k], D[k], lo, hi); if (int) o[k] = Math.round(o[k]); }
      else if (typeof D[k] === 'boolean') o[k] = !!o[k];
      else if (typeof D[k] === 'string' && k !== 'style') o[k] = String(o[k] == null ? '' : o[k]);
    }
    if (STYLES[kind] && !STYLES[kind].includes(o.style)) o.style = D.style;
    for (const k of Object.keys(o)) if (!(k in D)) delete o[k];
    return o;
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); if (r <= 0.01) return rect(x, y, w, h);
    const pts = [], arc = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + i / 8 * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
    pts.push(pts[0].slice()); return pts;
  }
  const circle = (cx, cy, r, n = 64) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; };
  /* a wave along a straight edge a→b (amplitude amp, roughly period long waves, whole number of them) */
  function waveEdge(a, b, amp, period) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / period)), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, out = [];
    const steps = n * 16;
    for (let i = 0; i <= steps; i++) { const t = i / steps, s = Math.sin(t * n * TAU) * amp; out.push([a[0] + ux * L * t - uy * s, a[1] + uy * L * t + ux * s]); }
    return out;
  }
  function border(p) {
    const { w, h } = p, out = [];
    switch (p.style) {
      case 'double': out.push(rect(0, 0, w, h), rect(p.gap, p.gap, w - 2 * p.gap, h - 2 * p.gap)); break;
      case 'rounded': out.push(roundRect(0, 0, w, h, p.radius)); break;
      case 'dashed': out.push(...SW.dash(rect(0, 0, w, h), [p.period * 0.6, p.period * 0.4], 0)); break;
      case 'wave': { const a = Math.min(p.amp, w / 4, h / 4), c = [[a, a], [w - a, a], [w - a, h - a], [a, h - a], [a, a]], o = [];   /* inset: the waves stay inside w × h */ for (let i = 0; i < 4; i++) { const e = waveEdge(c[i], c[i + 1], a, p.period); o.push(...(i ? e.slice(1) : e)); } out.push(o); break; }
      case 'dots': { const per = (w + h) * 2, n = Math.max(4, Math.round(per / p.period)), c = rect(0, 0, w, h); const L = SW.polyLen(c);
        for (let i = 0; i < n; i++) { let d = i / n * L; for (let k = 1; k < c.length; k++) { const s = Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]); if (d <= s) { const t = d / s; out.push([[c[k - 1][0] + (c[k][0] - c[k - 1][0]) * t, c[k - 1][1] + (c[k][1] - c[k - 1][1]) * t]]); break; } d -= s; } }
        break; }
      case 'corners': { const L = Math.min(p.corner, w / 2, h / 2); out.push([[0, L], [0, 0], [L, 0]], [[w - L, 0], [w, 0], [w, L]], [[w, h - L], [w, h], [w - L, h]], [[L, h], [0, h], [0, h - L]]);
        const g = Math.min(p.gap, L / 2); if (g > 0) out.push([[g, L - g], [g, g], [L - g, g]], [[w - L + g, g], [w - g, g], [w - g, L - g]], [[w - g, h - L + g], [w - g, h - g], [w - L + g, h - g]], [[L - g, h - g], [g, h - g], [g, h - L + g]]);
        break; }
      default: out.push(rect(0, 0, w, h));
    }
    return { paths: out, w, h };
  }
  const MAX_DOTS = 60000;   // a dot grid finer than this would take hours and stall the preview
  function grid(p) {
    const { w, h } = p, s = p.style === 'dots' ? Math.max(p.spacing, Math.sqrt(w * h / MAX_DOTS)) : p.spacing, m = Math.min(p.margin, w / 2, h / 2), out = [];
    const nx = Math.floor((w + 1e-6) / s), ny = Math.floor((h + 1e-6) / s);
    switch (p.style) {
      case 'ruled': for (let j = 0; j <= ny; j++) out.push([[0, j * s], [w, j * s]]); if (m > 0) out.push([[m, 0], [m, h]]); break;
      case 'dots': for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push([[i * s, j * s]]); break;
      case 'iso': {   // triangle grid: horizontal lines + two diagonal families (60°)
        const dy = s * Math.sqrt(3) / 2, rows = Math.floor(h / dy);
        for (let j = 0; j <= rows; j++) out.push([[0, j * dy], [w, j * dy]]);
        const tan = Math.tan(Math.PI / 3);
        for (const sgn of [1, -1]) for (let x0 = -h / tan; x0 <= w + h / tan; x0 += s) {
          const seg = SW.clipPoly([[x0, 0], [x0 + sgn * h / tan, h]], w, h).parts; out.push(...seg);
        }
        break;
      }
      default: { // lines / squares (squares: every 5th line again, slightly offset = bolder)
        for (let i = 0; i <= nx; i++) out.push([[i * s, 0], [i * s, ny * s]]);
        for (let j = 0; j <= ny; j++) out.push([[0, j * s], [nx * s, j * s]]);
        if (p.style === 'squares') { for (let i = 0; i <= nx; i += 5) out.push([[i * s + 0.25, 0], [i * s + 0.25, ny * s]]); for (let j = 0; j <= ny; j += 5) out.push([[0, j * s + 0.25], [nx * s, j * s + 0.25]]); }
      }
    }
    return { paths: out, w, h };
  }
  function spiral(p) {
    const R = p.r, n = p.turns, pts = [];
    if (p.style === 'square') {
      const step = R / n; let x = 0, y = 0, len = step, dir = 0; pts.push([0, 0]);
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      while (len <= 2 * R + 1e-6) { for (let k = 0; k < 2; k++) { x += D[dir][0] * len; y += D[dir][1] * len; pts.push([x, y]); dir = (dir + 1) % 4; } len += step; }
    } else {
      const N = Math.max(60, n * 120);
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = t * n * TAU, r = p.style === 'log' ? R * Math.pow(t, 2) : R * t;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
    }
    return shift([pts]);
  }
  const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a || 1; };
  /* spirograph (hypotrochoid): a circle of radius r rolls inside R, the pen sits d from its centre */
  function rosette(p) {
    const { R, r, d } = p, loops = p.loops || Math.min(200, Math.round(r * 10) / gcd(R * 10, r * 10)), N = Math.min(40000, Math.max(400, loops * 360)), pts = [];
    for (let i = 0; i <= N; i++) { const a = i / N * loops * TAU; pts.push([(R - r) * Math.cos(a) + d * Math.cos((R - r) / r * a), (R - r) * Math.sin(a) - d * Math.sin((R - r) / r * a)]); }
    return shift([pts]);
  }
  function lissajous(p) {
    const N = 2000, pts = [], ph = p.phase * Math.PI / 180;
    for (let i = 0; i <= N; i++) { const t = i / N * TAU; pts.push([p.w / 2 + p.w / 2 * Math.sin(p.a * t + ph), p.h / 2 + p.h / 2 * Math.sin(p.b * t)]); }
    return { paths: [pts], w: p.w, h: p.h };
  }
  /* text centred in a cell (cap height size) */
  function textIn(str, size, x, y, w, h, font, out) {
    const tw = SW.textWidth(str, size, 0, font);
    for (const g of SW.renderText(str, size, 1.7, 'left', 0, 0, font)) out.push(g.map(([px, py]) => [x + (w - tw) / 2 + px, y + (h - size) / 2 + py]));
  }
  const EN = { months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] };
  function calendar(p, ctx) {
    const font = (ctx && ctx.font) || SW.BUILTIN, months = (ctx && ctx.months) || EN.months, days = (ctx && ctx.days) || EN.days;
    const { w, h } = p, out = [], titleH = p.title ? h * 0.16 : 0, headH = (h - titleH) * 0.1, cellH = (h - titleH - headH) / 6, cellW = w / 7;
    if (p.frame) out.push(rect(0, 0, w, h));
    if (p.title) textIn(`${months[p.month - 1]} ${p.year}`, Math.min(titleH * 0.45, w / 14), 0, 0, w, titleH, font, out);
    const order = p.firstDay === 1 ? [0, 1, 2, 3, 4, 5, 6] : [6, 0, 1, 2, 3, 4, 5];   // days[] starts on Monday
    order.forEach((d, i) => textIn(days[d], Math.min(headH * 0.45, cellW * 0.25), i * cellW, titleH, cellW, headH, font, out));
    const first = new Date(Date.UTC(p.year, p.month - 1, 1)).getUTCDay(), n = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    const col0 = p.firstDay === 1 ? (first + 6) % 7 : first, y0 = titleH + headH;
    out.push([[0, y0], [w, y0]]);
    for (let r = 1; r < 6; r++) out.push([[0, y0 + r * cellH], [w, y0 + r * cellH]]);
    for (let c = 1; c < 7; c++) out.push([[c * cellW, y0], [c * cellW, h]]);
    const size = Math.min(cellH * 0.3, cellW * 0.22);
    for (let d = 1; d <= n; d++) {
      const k = col0 + d - 1, r = Math.floor(k / 7) % 6, c = k % 7;   // a 6th week wraps to the first row (rare months)
      const str = String(d), tw = SW.textWidth(str, size, 0, font);
      for (const g of SW.renderText(str, size, 1.7, 'left', 0, 0, font)) out.push(g.map(([px, py]) => [c * cellW + cellW - tw - size * 0.5 + px, y0 + r * cellH + size * 0.5 + py]));
    }
    return { paths: out, w, h };
  }
  function namecard(p, ctx) {
    const font = (ctx && ctx.font) || SW.BUILTIN, names = p.names.split('\n').map(s => s.trim()).filter(Boolean);
    const list = names.length ? names : [' '], cols = Math.max(1, Math.min(p.cols, list.length)), rows = Math.ceil(list.length / cols), out = [];
    list.forEach((name, i) => {
      const x = (i % cols) * (p.cw + p.gap), y = Math.floor(i / cols) * (p.ch + p.gap);
      if (p.frame) out.push(rect(x, y, p.cw, p.ch));
      const size = Math.min(p.size, (p.cw * 0.85) / Math.max(1, SW.textWidth(name, 1, 0, font)));
      textIn(name, size, x, y, p.cw, p.ch, font, out);
    });
    return { paths: out, w: cols * p.cw + (cols - 1) * p.gap, h: rows * p.ch + (rows - 1) * p.gap };
  }
  /* move polylines so the bounding box starts at 0,0 */
  function shift(paths) {
    const b = SW.bbox(paths); return { paths: paths.map(p => p.map(q => [q[0] - b.x, q[1] - b.y])), w: b.w, h: b.h };
  }
  const MAKERS = { border, grid, spiral, rosette, lissajous, calendar, namecard };
  function make(kind, params, ctx) {
    const p = clean(kind, params), r = MAKERS[kind](p, ctx);
    r.paths = r.paths.filter(q => q && q.length);
    return r;
  }
  return { KINDS, DEFAULTS, STYLES, MAX_DOTS, clean, make };
})(typeof module !== 'undefined' ? require('../core.js') : SW);
if (typeof module !== 'undefined') module.exports = SWGen;
