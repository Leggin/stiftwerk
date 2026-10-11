/* ===== Stiftwerk core: geometry, font, optimisation, G-code. No DOM access. ===== */
const SW = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ---------- SVG path data → subpaths of line/cubic segments ---------- */
  function parsePathD(d) {
    const toks = String(d).match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null;
    const subs = []; let cur = null;
    const isCmd = t => /^[a-zA-Z]$/.test(t);
    const num = () => { const v = parseFloat(toks[i++]); if (!isFinite(v)) throw new Error('bad'); return v; };
    const start = (x, y) => { cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); };
    const ensure = () => { if (!cur) start(cx, cy); };
    try {
      while (i < toks.length) {
        if (isCmd(toks[i])) cmd = toks[i++];
        else if (!cmd) { i++; continue; }
        const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
        const ox = rel ? cx : 0, oy = rel ? cy : 0;
        if (C !== 'Z' && (i >= toks.length || isCmd(toks[i]))) { if (C !== 'Z') continue; }
        switch (C) {
          case 'M': { const x = num() + ox, y = num() + oy; start(x, y); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lcx = lqx = null; break; }
          case 'L': { const x = num() + ox, y = num() + oy; ensure(); cur.segs.push(['L', x, y]); cx = x; cy = y; lcx = lqx = null; break; }
          case 'H': { const x = num() + ox; ensure(); cur.segs.push(['L', x, cy]); cx = x; lcx = lqx = null; break; }
          case 'V': { const y = num() + oy; ensure(); cur.segs.push(['L', cx, y]); cy = y; lcx = lqx = null; break; }
          case 'C': { const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
            ensure(); cur.segs.push(['C', x1, y1, x2, y2, x, y]); lcx = x2; lcy = y2; lqx = null; cx = x; cy = y; break; }
          case 'S': { const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
            const x1 = lcx === null ? cx : 2 * cx - lcx, y1 = lcx === null ? cy : 2 * cy - lcy;
            ensure(); cur.segs.push(['C', x1, y1, x2, y2, x, y]); lcx = x2; lcy = y2; lqx = null; cx = x; cy = y; break; }
          case 'Q': { const qx = num() + ox, qy = num() + oy, x = num() + ox, y = num() + oy;
            ensure(); cur.segs.push(quadToCubic(cx, cy, qx, qy, x, y)); lqx = qx; lqy = qy; lcx = null; cx = x; cy = y; break; }
          case 'T': { const x = num() + ox, y = num() + oy;
            const qx = lqx === null ? cx : 2 * cx - lqx, qy = lqx === null ? cy : 2 * cy - lqy;
            ensure(); cur.segs.push(quadToCubic(cx, cy, qx, qy, x, y)); lqx = qx; lqy = qy; lcx = null; cx = x; cy = y; break; }
          case 'A': { const rx = num(), ry = num(), rot = num();
            const la = numFlag(), sw = numFlag(); const x = num() + ox, y = num() + oy;
            ensure(); for (const s of arcToCubics(cx, cy, rx, ry, rot, la, sw, x, y)) cur.segs.push(s);
            cx = x; cy = y; lcx = lqx = null; break; }
          case 'Z': { if (cur) { cur.closed = true; if (Math.abs(cx - sx) > 1e-9 || Math.abs(cy - sy) > 1e-9) cur.segs.push(['L', sx, sy]); }
            cx = sx; cy = sy; cur = null; lcx = lqx = null; while (i < toks.length && !isCmd(toks[i])) i++; break; }
          default: i++;
        }
      }
    } catch (e) { /* malformed tail: keep what we have */ }
    return subs;
    // arc flags may be written without separators ("a5 5 0 0110 10"); handle single digit flags
    function numFlag() {
      const t = toks[i];
      if (t === undefined) throw new Error('bad');
      if (/^[01]$/.test(t)) { i++; return +t; }
      if (/^[01]/.test(t)) { toks[i] = t.slice(1); return +t[0]; }
      i++; return parseFloat(t) ? 1 : 0;
    }
  }
  function quadToCubic(x0, y0, qx, qy, x, y) {
    return ['C', x0 + 2 / 3 * (qx - x0), y0 + 2 / 3 * (qy - y0), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y];
  }
  function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if ((x1 === x2 && y1 === y2)) return [];
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return [['L', x2, y2]];
    const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), step = dt / n;
    const k = 4 / 3 * Math.tan(step / 4), out = [];
    const pt = t => [ccx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, ccy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
    const der = t => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
    for (let j = 0; j < n; j++) {
      const a = t1 + j * step, b = a + step, p0 = pt(a), p3 = pt(b), d0 = der(a), d3 = der(b);
      out.push(['C', p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
    }
    const last = out[out.length - 1]; last[5] = x2; last[6] = y2;
    return out;
  }
  /* flatten a subpath; T maps user units → mm (affine) */
  function flattenSub(sub, T, tol = 0.15) {
    let p = T(sub.start[0], sub.start[1]); const pts = [p];
    for (const s of sub.segs) {
      if (s[0] === 'L') { p = T(s[1], s[2]); pts.push(p); continue; }
      const p0 = pts[pts.length - 1], p1 = T(s[1], s[2]), p2 = T(s[3], s[4]), p3 = T(s[5], s[6]);
      const L = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
      const n = clamp(Math.ceil(Math.sqrt(L / tol) * 2), 2, 400);
      for (let j = 1; j <= n; j++) {
        const t = j / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
        pts.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]);
      }
    }
    return { pts, closed: sub.closed };
  }
  function shapeToD(tag, g) {
    const n = k => parseFloat(g(k)) || 0;
    switch (tag) {
      case 'path': return g('d') || '';
      case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
      case 'polyline': case 'polygon': {
        const v = (g('points') || '').trim().split(/[\s,]+/).map(parseFloat).filter(isFinite);
        if (v.length < 4) return '';
        let d = `M${v[0]} ${v[1]}`; for (let j = 2; j + 1 < v.length; j += 2) d += `L${v[j]} ${v[j + 1]}`;
        return tag === 'polygon' ? d + 'Z' : d;
      }
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height'); if (w <= 0 || h <= 0) return '';
        let rx = g('rx') != null ? n('rx') : NaN, ry = g('ry') != null ? n('ry') : NaN;
        if (isNaN(rx)) rx = isNaN(ry) ? 0 : ry; if (isNaN(ry)) ry = rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
        return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      }
      case 'circle': { const cx = n('cx'), cy = n('cy'), r = n('r'); if (r <= 0) return '';
        return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`; }
      case 'ellipse': { const cx = n('cx'), cy = n('cy'), rx = n('rx'), ry = n('ry'); if (rx <= 0 || ry <= 0) return '';
        return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; }
    }
    return '';
  }

  /* ---------- single-stroke font (cap height 10 units, y down, baseline y=10) ---------- */
  const G = {
    ' ': [4, ''],
    a: [6, 'A3 6.5 3 3.5 0 360;M6 3 L6 10'], b: [6, 'M0 0 L0 10;A3 6.5 3 3.5 0 360'], c: [6, 'A3 6.5 3 3.5 -45 -315'],
    d: [6, 'M6 0 L6 10;A3 6.5 3 3.5 0 360'], e: [6, 'M0 6.5 L6 6.5 A3 6.5 3 3.5 0 -315'],
    f: [4.5, 'A3.2 1.6 1.6 1.6 -20 -180 L1.6 10;M0 3 L4 3'], g: [6, 'A3 6.5 3 3.5 0 360;M6 3 L6 11.5 A3 11.5 3 1.5 0 160'],
    h: [6, 'M0 0 L0 10;M0 6.5 A3 6.5 3 3.5 -180 0 L6 10'], i: [1, 'M0.5 3 L0.5 10;M0.5 0.6 L0.5 1.2'],
    j: [2.5, 'M2 3 L2 11.5 A0.5 11.5 1.5 1.5 0 150;M2 0.6 L2 1.2'], k: [5.5, 'M0 0 L0 10;M5 3 L0 7.5;M1.8 6 L5.5 10'],
    l: [1, 'M0.5 0 L0.5 10'], m: [9, 'M0 3 L0 10;M0 5.8 A2.25 5.8 2.25 2.8 -180 0 L4.5 10;M4.5 5.8 A6.75 5.8 2.25 2.8 -180 0 L9 10'],
    n: [6, 'M0 3 L0 10;M0 6.5 A3 6.5 3 3.5 -180 0 L6 10'], o: [6, 'A3 6.5 3 3.5 0 360'],
    p: [6, 'M0 3 L0 13;A3 6.5 3 3.5 0 360'], q: [6, 'M6 3 L6 13;A3 6.5 3 3.5 0 360'],
    r: [4.5, 'M0 3 L0 10;M0 6.5 A3 6.5 3 3.5 -180 -60'], s: [5, 'A2.5 4.75 2.5 1.75 -20 -270 A2.5 8.25 2.5 1.75 -90 160'],
    t: [4, 'M1.5 0.5 L1.5 8.5 A3 8.5 1.5 1.5 180 30;M0 3 L4 3'], u: [6, 'M0 3 L0 6.5 A3 6.5 3 3.5 180 0;M6 3 L6 10'],
    v: [6, 'M0 3 L3 10 L6 3'], w: [9, 'M0 3 L2 10 L4.5 4 L7 10 L9 3'], x: [5.5, 'M0 3 L5.5 10;M5.5 3 L0 10'],
    y: [6, 'M0 3 L3 10;M6 3 L2 13 L0.8 13'], z: [5.5, 'M0 3 L5.5 3 L0 10 L5.5 10'],
    A: [7, 'M0 10 L3.5 0 L7 10;M1.3 6.5 L5.7 6.5'], B: [6.5, 'M0 10 L0 0 L3.5 0 A3.5 2.5 2.5 2.5 -90 90 L0 5;M0 5 L3.8 5 A3.8 7.5 2.7 2.5 -90 90 L0 10'],
    C: [7.5, 'A4 5 4 5 -40 -320'], D: [6.5, 'M0 0 L0 10 L2.5 10 A2.5 5 4 5 90 -90 L0 0'],
    E: [5.5, 'M5.5 0 L0 0 L0 10 L5.5 10;M0 5 L4.5 5'], F: [5.5, 'M5.5 0 L0 0 L0 10;M0 5 L4.5 5'],
    G: [8, 'A4 5 4 5 -35 -360 L4.5 5'], H: [6, 'M0 0 L0 10;M6 0 L6 10;M0 5 L6 5'], I: [1, 'M0.5 0 L0.5 10'],
    J: [4, 'M4 0 L4 7.5 A2 7.5 2 2.5 0 180'], K: [6, 'M0 0 L0 10;M6 0 L0 6;M2 4 L6 10'], L: [5, 'M0 0 L0 10 L5 10'],
    M: [8, 'M0 10 L0 0 L4 7 L8 0 L8 10'], N: [6.5, 'M0 10 L0 0 L6.5 10 L6.5 0'], O: [8, 'A4 5 4 5 0 360'],
    P: [6, 'M0 10 L0 0 L3.5 0 A3.5 2.75 2.5 2.75 -90 90 L0 5.5'], Q: [8, 'A4 5 4 5 0 360;M5 7.5 L8 10.5'],
    R: [6, 'M0 10 L0 0 L3.5 0 A3.5 2.75 2.5 2.75 -90 90 L0 5.5;M3 5.5 L6 10'], S: [6, 'A3 2.5 3 2.5 -20 -270 A3 7.5 3 2.5 -90 160'],
    T: [7, 'M0 0 L7 0;M3.5 0 L3.5 10'], U: [6, 'M0 0 L0 7 A3 7 3 3 180 0 L6 0'], V: [7, 'M0 0 L3.5 10 L7 0'],
    W: [10, 'M0 0 L2.5 10 L5 2 L7.5 10 L10 0'], X: [6.5, 'M0 0 L6.5 10;M6.5 0 L0 10'], Y: [7, 'M0 0 L3.5 5 L7 0;M3.5 5 L3.5 10'],
    Z: [6.5, 'M0 0 L6.5 0 L0 10 L6.5 10'],
    0: [6, 'A3 5 3 5 0 360'], 1: [4, 'M0.5 2 L2.5 0 L2.5 10'], 2: [6, 'A3 3 3 3 -165 25 L0 10 L6 10'],
    3: [6, 'A3 2.5 2.8 2.5 -160 90 A3 7.5 3 2.5 -90 160'], 4: [6.5, 'M5 10 L5 0 L0 7 L6.5 7'],
    5: [6, 'M5.5 0 L0.8 0 L0.3 4.5 A3 6.8 3 3.2 -135 150'], 6: [6, 'M5 0 L0.2 6;A3 7 3 3 0 360'],
    7: [6, 'M0 0 L6 0 L2 10'], 8: [6, 'A3 2.5 2.6 2.5 0 360;A3 7.5 3 2.5 0 360'], 9: [6, 'A3 3 3 3 0 360;M6 3 L1.5 10'],
    '.': [1, 'M0.5 9.4 L0.5 10'], ',': [1.2, 'M0.8 9.3 L0.8 10 L0 11.5'], ':': [1, 'M0.5 3.4 L0.5 4;M0.5 9.4 L0.5 10'],
    ';': [1.2, 'M0.8 3.4 L0.8 4;M0.8 9.3 L0.8 10 L0 11.5'], '!': [1, 'M0.5 0 L0.5 7;M0.5 9.4 L0.5 10'],
    '?': [5.5, 'A2.75 2.6 2.75 2.6 -170 60 L2.75 7;M2.75 9.4 L2.75 10'], '-': [4, 'M0 6 L4 6'], '–': [6, 'M0 6 L6 6'],
    '+': [5, 'M0 6.5 L5 6.5;M2.5 4 L2.5 9'], '=': [5, 'M0 5 L5 5;M0 8 L5 8'], '/': [4, 'M4 -0.5 L0 10.5'],
    '(': [2.5, 'A3.5 5 3 6 -120 -240'], ')': [2.5, 'A-1 5 3 6 -60 60'], "'": [1, 'M0.5 0 L0.5 2.5'],
    '"': [2.5, 'M0.5 0 L0.5 2.5;M2 0 L2 2.5'], '*': [5, 'M2.5 0 L2.5 5;M0 1.2 L5 3.8;M0 3.8 L5 1.2'],
    '_': [6, 'M0 11 L6 11'], '€': [7, 'A4.5 5 4.5 5 -45 -315;M0 4 L5 4;M0 6 L5 6'], '#': [6, 'M2 1 L1 9;M5 1 L4 9;M0 3.5 L6 3.5;M0 6.5 L6 6.5'],
    '%': [7, 'A1.5 2 1.5 2 0 360;A5.5 8 1.5 2 0 360;M6.5 0 L0.5 10'], '&': [7, 'M7 10 L1.2 3.2 A2.5 2.2 1.5 2 180 -40 L0.8 7.4 A3 7.6 2.3 2.4 180 40 L6.8 5'],
    '@': [9, 'A4.5 5.5 4.5 5 30 -330;A4.5 5.5 1.8 2 0 360;M6.3 4 L6.3 7 A7.4 7 1.1 1 180 -30'],
    'ß': [5.5, 'M0 10 L0 2.5 A2.5 2.5 2.5 2.5 -180 90 A2.5 7.5 3 2.5 -90 160'], '°': [3, 'A1.5 1.5 1.2 1.2 0 360'],
    '·': [1, 'M0.5 5.4 L0.5 6'], '•': [2, 'A1 6 0.9 0.9 0 360'], '—': [9, 'M0 6 L9 6'], '…': [5, 'M0.5 9.4 L0.5 10;M2.5 9.4 L2.5 10;M4.5 9.4 L4.5 10'],
    '„': [2.6, 'M0.8 9.3 L0.8 10 L0 11.5;M2.2 9.3 L2.2 10 L1.4 11.5'], '“': [2.6, 'M1.4 2.5 L1.4 1.8 L2.2 0.3;M0 2.5 L0 1.8 L0.8 0.3'],
    '”': [2.6, 'M0.8 0 L0.8 0.7 L0 2.2;M2.2 0 L2.2 0.7 L1.4 2.2'], '‚': [1.2, 'M0.8 9.3 L0.8 10 L0 11.5'], '‘': [1.2, 'M0 2.5 L0 1.8 L0.8 0.3'],
    '’': [1.2, 'M0.8 0 L0.8 0.7 L0 2.2'], '<': [5, 'M5 3 L0 6 L5 9'], '>': [5, 'M0 3 L5 6 L0 9'], '[': [2.5, 'M2.5 -0.5 L0.5 -0.5 L0.5 10.5 L2.5 10.5'],
    ']': [2.5, 'M0 -0.5 L2 -0.5 L2 10.5 L0 10.5'], '|': [1, 'M0.5 -0.5 L0.5 10.5'], '~': [6, 'M0 6.5 L1.5 5.3 L3 6 L4.5 6.7 L6 5.5'],
    '$': [6, 'A3 2.8 3 2.4 -20 -270 A3 7.2 3 2.4 -90 160;M3 -1 L3 11'], '§': [5, 'A2.5 2.3 2.4 1.9 -20 -200 A2.5 5 2.5 1.9 -90 90 A2.5 7.7 2.4 1.9 -20 160'],
    '♥': [8, 'M4 9.5 L0.6 5.2 A2.1 3.3 1.9 2 180 340 L4 3.3 L4.2 2.7 A5.9 3.3 1.9 2 200 360 L4 9.5'],
  };
  /* 5-point stars */
  (() => { const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.9 : 4.6; pts.push(`${(4.6 + r * Math.cos(a)).toFixed(3)} ${(5.2 + r * Math.sin(a)).toFixed(3)}`); }
    const inner = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.85 : 2.1; inner.push(`${(4.6 + r * Math.cos(a)).toFixed(3)} ${(5.4 + r * Math.sin(a)).toFixed(3)}`); }
    const d = 'M' + pts.join(' L'); G['☆'] = [9.2, d]; G['★'] = [9.2, d + ';M' + inner.join(' L')]; G['⭐'] = G['★']; })();

  /* ---------- Hangul: syllables are composed from jamo strokes ---------- */
  const JC = {
    'ㄱ': [[[0.05, 0.1], [0.9, 0.1], [0.9, 1]]], 'ㄴ': [[[0.1, 0], [0.1, 0.9], [1, 0.9]]],
    'ㄷ': [[[0.92, 0.08], [0.1, 0.08], [0.1, 0.92], [0.95, 0.92]]],
    'ㄹ': [[[0.1, 0.05], [0.9, 0.05], [0.9, 0.5], [0.1, 0.5], [0.1, 0.95], [0.95, 0.95]]],
    'ㅁ': [[[0.1, 0.08], [0.9, 0.08], [0.9, 0.92], [0.1, 0.92], [0.1, 0.08]]],
    'ㅂ': [[[0.1, 0], [0.1, 0.95], [0.9, 0.95], [0.9, 0]], [[0.1, 0.45], [0.9, 0.45]]],
    'ㅅ': [[[0.5, 0], [0.05, 1]], [[0.5, 0.35], [0.95, 1]]],
    'ㅇ': 'O', 'ㅈ': [[[0.1, 0.06], [0.9, 0.06]], [[0.5, 0.06], [0.05, 1]], [[0.5, 0.42], [0.95, 1]]],
    'ㅊ': [[[0.5, -0.06], [0.5, 0.14]], [[0.1, 0.24], [0.9, 0.24]], [[0.5, 0.24], [0.05, 1]], [[0.5, 0.55], [0.95, 1]]],
    'ㅋ': [[[0.05, 0.1], [0.9, 0.1], [0.9, 1]], [[0.1, 0.52], [0.9, 0.52]]],
    'ㅌ': [[[0.9, 0.06], [0.1, 0.06], [0.1, 0.94], [0.95, 0.94]], [[0.1, 0.5], [0.85, 0.5]]],
    'ㅍ': [[[0.05, 0.08], [0.95, 0.08]], [[0.3, 0.08], [0.3, 0.92]], [[0.7, 0.08], [0.7, 0.92]], [[0.05, 0.92], [0.95, 0.92]]],
    'ㅎ': 'H'
  };
  const DOUBLE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
  const CLUSTER = { 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };
  const ellipse = (cx, cy, rx, ry) => { const p = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; };
  function consonant(c) {
    if (DOUBLE[c]) { const b = consonant(DOUBLE[c]); return b.map(s => s.map(([u, v]) => [u * 0.47, v])).concat(b.map(s => s.map(([u, v]) => [0.53 + u * 0.47, v]))); }
    if (CLUSTER[c]) { const [a, b] = [...CLUSTER[c]].map(consonant); return a.map(s => s.map(([u, v]) => [u * 0.47, v])).concat(b.map(s => s.map(([u, v]) => [0.53 + u * 0.47, v]))); }
    const d = JC[c]; if (!d) return [];
    if (d === 'O') return [ellipse(0.5, 0.5, 0.44, 0.46)];
    if (d === 'H') return [[[0.5, -0.04], [0.5, 0.14]], [[0.1, 0.24], [0.9, 0.24]], ellipse(0.5, 0.66, 0.32, 0.3)];
    return d;
  }
  // vowels: [vertical part, horizontal part]; vertical drawn in a tall box, horizontal in a wide box
  const VV = { 'ㅣ': [[[0.4, 0], [0.4, 1]]], 'ㅏ': [[[0.4, 0], [0.4, 1]], [[0.4, 0.45], [0.9, 0.45]]],
    'ㅑ': [[[0.4, 0], [0.4, 1]], [[0.4, 0.33], [0.9, 0.33]], [[0.4, 0.58], [0.9, 0.58]]],
    'ㅓ': [[[0.65, 0], [0.65, 1]], [[0.1, 0.45], [0.65, 0.45]]], 'ㅕ': [[[0.65, 0], [0.65, 1]], [[0.1, 0.33], [0.65, 0.33]], [[0.1, 0.58], [0.65, 0.58]]],
    'ㅐ': [[[0.3, 0], [0.3, 1]], [[0.85, 0], [0.85, 1]], [[0.3, 0.45], [0.85, 0.45]]], 'ㅒ': [[[0.3, 0], [0.3, 1]], [[0.85, 0], [0.85, 1]], [[0.3, 0.33], [0.85, 0.33]], [[0.3, 0.58], [0.85, 0.58]]],
    'ㅔ': [[[0.45, 0], [0.45, 1]], [[0.9, 0], [0.9, 1]], [[0.05, 0.45], [0.45, 0.45]]], 'ㅖ': [[[0.45, 0], [0.45, 1]], [[0.9, 0], [0.9, 1]], [[0.05, 0.33], [0.45, 0.33]], [[0.05, 0.58], [0.45, 0.58]]] };
  const VH = { 'ㅡ': [[[0, 0.55], [1, 0.55]]], 'ㅗ': [[[0, 0.75], [1, 0.75]], [[0.5, 0.25], [0.5, 0.75]]], 'ㅛ': [[[0, 0.75], [1, 0.75]], [[0.33, 0.25], [0.33, 0.75]], [[0.67, 0.25], [0.67, 0.75]]],
    'ㅜ': [[[0, 0.3], [1, 0.3]], [[0.5, 0.3], [0.5, 0.9]]], 'ㅠ': [[[0, 0.3], [1, 0.3]], [[0.33, 0.3], [0.33, 0.9]], [[0.67, 0.3], [0.67, 0.9]]] };
  const VMIX = { 'ㅘ': ['ㅗ', 'ㅏ'], 'ㅙ': ['ㅗ', 'ㅐ'], 'ㅚ': ['ㅗ', 'ㅣ'], 'ㅝ': ['ㅜ', 'ㅓ'], 'ㅞ': ['ㅜ', 'ㅔ'], 'ㅟ': ['ㅜ', 'ㅣ'], 'ㅢ': ['ㅡ', 'ㅣ'] };
  const LJ = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', VJ = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', TJ = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  const put = (strokes, x0, y0, x1, y1) => strokes.map(s => s.map(([u, v]) => [x0 + u * (x1 - x0), y0 + v * (y1 - y0)]));
  function hangul(ch) {
    const code = ch.codePointAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const n = code - 0xAC00, L = LJ[Math.floor(n / 588)], V = VJ[Math.floor(n % 588 / 28)], T = TJ[n % 28].trim();
      const out = [], fin = !!T, Y0 = -0.6, Y1 = 10.4;
      const bot = fin ? 5.9 : Y1;
      if (VV[V]) {
        out.push(...put(consonant(L), 0.3, fin ? -0.3 : 1.2, 5.3, fin ? 4.9 : 8.8), ...put(VV[V], 5.4, Y0, 9.8, bot));
      } else if (VH[V]) {
        out.push(...put(consonant(L), 1.6, Y0 + 0.2, 8.4, fin ? 2.9 : 4.6), ...put(VH[V], 0.3, fin ? 2.6 : 4.3, 9.7, fin ? 5.9 : 10));
      } else if (VMIX[V]) {
        const [h, v] = VMIX[V];
        out.push(...put(consonant(L), 0.3, Y0 + 0.2, 5.8, fin ? 2.6 : 4.2), ...put(VH[h], 0.2, fin ? 2.3 : 3.9, 6.6, fin ? 5.6 : 9.4), ...put(VV[v], 6.2, Y0, 9.8, bot));
      }
      if (fin) out.push(...put(consonant(T), 1.4, 6.6, 8.6, Y1));
      return { w: 10, strokes: out };
    }
    if (code >= 0x3131 && code <= 0x3163) {
      if (VV[ch]) return { w: 6, strokes: put(VV[ch], 0.5, 0, 5.5, 10) };
      if (VH[ch]) return { w: 9, strokes: put(VH[ch], 0, 0, 9, 10) };
      if (VMIX[ch]) return { w: 10, strokes: put(VH[VMIX[ch][0]], 0, 1, 6.5, 9).concat(put(VV[VMIX[ch][1]], 6, 0, 10, 10)) };
      const c = consonant(ch); if (c.length) return { w: CLUSTER[ch] || DOUBLE[ch] ? 11 : 7, strokes: put(c, 0.3, 1, CLUSTER[ch] || DOUBLE[ch] ? 10.7 : 6.7, 10) };
    }
    return null;
  }
  const UML = { 'Ä': ['A', -1.8], 'Ö': ['O', -1.8], 'Ü': ['U', -1.8], 'ä': ['a', 1.2], 'ö': ['o', 1.2], 'ü': ['u', 1.2] };
  const glyphCache = new Map();
  function glyphStrokes(ch) {
    if (glyphCache.has(ch)) return glyphCache.get(ch);
    let w, strokes;
    if (UML[ch]) {
      const [base, y] = UML[ch]; const g = glyphStrokes(base); w = g.w;
      strokes = g.strokes.concat([[[w * 0.3, y], [w * 0.3, y + 0.6]], [[w * 0.7, y], [w * 0.7, y + 0.6]]]);
    } else if (hangul(ch)) {
      ({ w, strokes } = hangul(ch));
    } else {
      const g = G[ch] || G['?']; w = g[0]; strokes = [];
      for (const part of g[1].split(';')) {
        const t = part.trim().split(/\s+/).filter(Boolean); if (!t.length) continue;
        let s = []; let j = 0;
        while (j < t.length) {
          const tk = t[j];
          if (tk[0] === 'M' || tk[0] === 'L') { const x = tk.length > 1 ? parseFloat(tk.slice(1)) : parseFloat(t[++j]); j++; const y = parseFloat(t[j++]); if (tk[0] === 'M' && s.length) { strokes.push(s); s = []; } s.push([x, y]); }
          else if (tk[0] === 'A') {
            const cx = tk.length > 1 ? parseFloat(tk.slice(1)) : parseFloat(t[++j]); j++;
            const cy = parseFloat(t[j++]), rx = parseFloat(t[j++]), ry = parseFloat(t[j++]), a0 = parseFloat(t[j++]), a1 = parseFloat(t[j++]);
            const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 10));
            for (let q = 0; q <= n; q++) { const a = (a0 + (a1 - a0) * q / n) * Math.PI / 180; s.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
          } else j++;
        }
        if (s.length) strokes.push(s);
      }
    }
    const r = { w, strokes }; glyphCache.set(ch, r); return r;
  }
  /* fonts: the built-in one, or SVG fonts (Hershey/EMS) parsed by parseSvgFont. Glyph units: cap height 10, baseline y=10 */
  const BUILTIN = { id: 'builtin', name: 'Stiftwerk Linear', track: 1.6, map: null };
  function fontGlyph(font, ch) {
    if (!font || !font.map) return glyphStrokes(ch);
    const g = font.map.get(ch); if (g) return g;
    const b = glyphStrokes(ch); return { w: b.w + 1.6, strokes: b.strokes };
  }
  const hasGlyph = (ch, font) => !!((font && font.map && font.map.has(ch)) || G[ch] || UML[ch] || hangul(ch));
  const builtinHas = ch => !!(G[ch] || UML[ch] || hangul(ch));
  /* where a character's strokes come from with this font: 'font' (its own glyph), 'builtin' (fallback), or null (no glyph at all) */
  function glyphSource(ch, font) {
    if (/\s/.test(ch)) return 'font';
    if (font && font.map) return font.map.has(ch) ? 'font' : builtinHas(ch) ? 'builtin' : null;
    return builtinHas(ch) ? 'font' : null;
  }
  function textWidth(line, size, extra = 0, font = BUILTIN) {
    const tr = (font && font.track || 0) + extra; let w = 0;
    for (const ch of line) w += fontGlyph(font, ch).w + tr;
    return Math.max(0, w - tr) * size / 10;
  }
  /* returns polylines in mm, top of capital letters at y=0; extra = added letter spacing in glyph units */
  function renderText(str, size = 6, lineFactor = 1.7, align = 'left', slantDeg = 0, extra = 0, font = BUILTIN) {
    const s = size / 10, tan = Math.tan(slantDeg * Math.PI / 180), out = [], tr = (font && font.track || 0) + extra;
    const lines = String(str).replace(/\r/g, '').split('\n');
    const widths = lines.map(l => textWidth(l, 10, extra, font));
    const maxW = Math.max(0, ...widths);
    lines.forEach((line, li) => {
      let x = align === 'center' ? (maxW - widths[li]) / 2 : align === 'right' ? maxW - widths[li] : 0;
      const y0 = li * 10 * lineFactor;
      for (const ch of line) {
        const g = fontGlyph(font, ch);
        for (const st of g.strokes) out.push(st.map(([px, py]) => [(x + px + (10 - py) * tan) * s, (y0 + py) * s]));
        x += g.w + tr;
      }
    });
    return out;
  }
  /* SVG font (<font><glyph unicode d horiz-adv-x/>), as used by Hershey Text / EMS fonts */
  function parseSvgFont(txt, fallbackName) {
    const attr = (src, k) => { const m = src.match(new RegExp('(?:^|\\s)' + k + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')')); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; };
    const dec = v => v == null ? v : v.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const fontTag = (txt.match(/<font\b([^>]*)>/) || [])[1] || '', faceTag = (txt.match(/<font-face\b([^>]*?)\/?>/) || [])[1] || '';
    const defAdv = parseFloat(attr(fontTag, 'horiz-adv-x')) || 0, upm = parseFloat(attr(faceTag, 'units-per-em')) || 1000;
    const raw = new Map();
    for (const m of txt.matchAll(/<glyph\b([^>]*?)\/?>/g)) {
      const u = dec(attr(m[1], 'unicode')); if (!u || [...u].length !== 1) continue;
      const d = attr(m[1], 'd'), adv = parseFloat(attr(m[1], 'horiz-adv-x'));
      const strokes = d ? parsePathD(d).map(sub => flattenSub(sub, (x, y) => [x, -y], upm / 250).pts).filter(p => p.length > 1) : [];
      raw.set(u, { adv: isFinite(adv) ? adv : defAdv, strokes });
    }
    if (!raw.size) { const e = new Error('no glyphs found – not an SVG font (<font> with <glyph>)?'); e.code = 'NOGLYPHS'; throw e; }
    let cap = 0;
    for (const ch of ['H', 'E', 'I', 'T']) { const g = raw.get(ch); if (g && g.strokes.length) { cap = -Math.min(...g.strokes.flat().map(q => q[1])); if (cap > 0) break; } }
    if (!(cap > 0)) cap = parseFloat(attr(faceTag, 'cap-height')) || upm * 0.7;
    const f = 10 / cap, map = new Map();
    for (const [ch, g] of raw) map.set(ch, { w: g.adv * f, strokes: g.strokes.map(st => st.map(([x, y]) => [x * f, 10 + y * f])) });
    return { name: attr(faceTag, 'font-family') || fallbackName || 'SVG font', track: 0, map };
  }

  /* ---------- polyline helpers ---------- */
  function bbox(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polys) for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[0] > x1) x1 = q[0]; if (q[1] > y1) y1 = q[1]; }
    if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function polyLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; }
  function rdp(pts, tol) {
    if (pts.length < 3 || tol <= 0) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let md = 0, mi = -1;
      const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L2 = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        let d;
        if (!L2) d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        else { const t = clamp(((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2, 0, 1); d = Math.hypot(pts[i][0] - ax - t * dx, pts[i][1] - ay - t * dy); }
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function clean(paths, simplifyTol) {
    const out = [];
    for (const p of paths) {
      if (!p || !p.length) continue;
      const q = [p[0]];
      for (let i = 1; i < p.length; i++) if (dist(p[i], q[q.length - 1]) > 0.01) q.push(p[i]);
      if (q.length === 1) { out.push([q[0], q[0]]); continue; } // a dot
      out.push(rdp(q, simplifyTol));
    }
    return out;
  }
  /* clip polyline to rect, returns array of polylines (Liang–Barsky per segment) */
  function clipPoly(p, W, H) {
    const inside = q => q[0] >= -1e-9 && q[1] >= -1e-9 && q[0] <= W + 1e-9 && q[1] <= H + 1e-9;
    if (p.every(inside)) return { parts: [p], clipped: false };
    const parts = []; let cur = null;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dx = b[0] - a[0], dy = b[1] - a[1];
      let t0 = 0, t1 = 1, ok = true;
      for (const [pp, qq] of [[-dx, a[0]], [dx, W - a[0]], [-dy, a[1]], [dy, H - a[1]]]) {
        if (pp === 0) { if (qq < 0) { ok = false; break; } }
        else { const r = qq / pp; if (pp < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
      }
      if (!ok) { cur = null; continue; }
      const A = [a[0] + t0 * dx, a[1] + t0 * dy], B = [a[0] + t1 * dx, a[1] + t1 * dy];
      if (!cur || t0 > 0) { cur = [A]; parts.push(cur); }
      cur.push(B);
      if (t1 < 1) cur = null;
    }
    return { parts: parts.filter(x => x.length > 1), clipped: true };
  }
  /* scanline hatch for even-odd filled rings */
  function hatch(rings, spacing, angleDeg) {
    spacing = Math.max(0.2, spacing);
    const a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const R = rings.filter(r => r.length > 2).map(r => r.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca]));
    if (!R.length) return [];
    let y0 = Infinity, y1 = -Infinity;
    for (const r of R) for (const q of r) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const out = []; let flip = false;
    for (let y = y0 + spacing / 2; y < y1; y += spacing) {
      const xs = [];
      for (const r of R) for (let i = 0; i < r.length; i++) {
        const p = r[i], q = r[(i + 1) % r.length];
        if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
      }
      xs.sort((m, n) => m - n);
      const segs = [];
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) segs.push([xs[i], xs[i + 1]]);
      if (flip) segs.reverse();
      for (const [u, v] of segs) {
        const A = flip ? [v, y] : [u, y], B = flip ? [u, y] : [v, y];
        out.push([A, B].map(([x, yy]) => [x * ca - yy * sa, x * sa + yy * ca]));
      }
      flip = !flip;
    }
    return out;
  }
  /* greedy nearest-neighbour ordering with optional reversal; marks joins */
  function order(paths, opt) {
    const { optimize = true, reverse = true, joinTol = 0.1, start = [0, 0] } = opt || {};
    const n = paths.length, out = [];
    if (!optimize || n < 2) {
      let prev = start;
      for (const p of paths) { out.push({ pts: p, join: out.length > 0 && dist(prev, p[0]) < joinTol }); prev = p[p.length - 1]; }
      return out;
    }
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const p of paths) for (const q of [p[0], p[p.length - 1]]) { mnx = Math.min(mnx, q[0]); mny = Math.min(mny, q[1]); mxx = Math.max(mxx, q[0]); mxy = Math.max(mxy, q[1]); }
    const cell = Math.max(0.5, Math.max(mxx - mnx, mxy - mny) / Math.sqrt(n) * 1.5);
    const gw = Math.floor((mxx - mnx) / cell) + 1, gh = Math.floor((mxy - mny) / cell) + 1;
    const grid = new Map(), key = (i, j) => i * 100003 + j;
    const put = (q, idx) => { const i = Math.floor((q[0] - mnx) / cell), j = Math.floor((q[1] - mny) / cell), k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(idx); };
    paths.forEach((p, idx) => { put(p[0], idx); put(p[p.length - 1], idx); });
    const used = new Uint8Array(n); let cur = start;
    for (let c = 0; c < n; c++) {
      const ci = Math.floor((cur[0] - mnx) / cell), cj = Math.floor((cur[1] - mny) / cell);
      const maxR = Math.max(Math.abs(ci), Math.abs(cj), Math.abs(gw - ci), Math.abs(gh - cj)) + 1;
      let best = -1, bd = Infinity, brev = false;
      for (let r = 0; r <= maxR; r++) {
        for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
          if (r && i !== ci - r && i !== ci + r && j !== cj - r && j !== cj + r) continue;
          const arr = grid.get(key(i, j)); if (!arr) continue;
          for (const idx of arr) {
            if (used[idx]) continue; const p = paths[idx];
            let d = (p[0][0] - cur[0]) ** 2 + (p[0][1] - cur[1]) ** 2;
            if (d < bd) { bd = d; best = idx; brev = false; }
            if (reverse) { const e = p[p.length - 1]; d = (e[0] - cur[0]) ** 2 + (e[1] - cur[1]) ** 2; if (d < bd) { bd = d; best = idx; brev = true; } }
          }
        }
        if (best >= 0 && bd <= (r * cell) ** 2) break;
      }
      if (best < 0) break;
      used[best] = 1;
      const p = brev ? paths[best].slice().reverse() : paths[best];
      out.push({ pts: p, join: out.length > 0 && Math.sqrt(bd) < joinTol });
      cur = p[p.length - 1];
    }
    return out;
  }

  /* split a polyline into dashes; pattern in the same units as the points */
  function dash(pts, pattern, offset = 0) {
    const pat = pattern.filter(v => v >= 0); if (pat.length % 2) pat.push(...pat);
    const total = pat.reduce((a, b) => a + b, 0); if (!(total > 0)) return [pts];
    let idx = 0, left = pat[0], on = true;
    let o = ((offset % total) + total) % total;
    while (o > 0) { if (o >= left) { o -= left; idx = (idx + 1) % pat.length; left = pat[idx]; on = !on; } else { left -= o; o = 0; } }
    const out = []; let cur = on ? [pts[0]] : null;
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1]; const b = pts[i]; let seg = dist(a, b);
      while (seg > 1e-9) {
        if (left >= seg) { left -= seg; if (cur) cur.push(b); seg = 0; }
        else {
          const t = left / seg, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (cur) { cur.push(m); if (cur.length > 1) out.push(cur); cur = null; } else cur = [m];
          seg -= left; a = m; idx = (idx + 1) % pat.length; left = pat[idx]; on = !on;
          if (on && !cur) cur = [m];
        }
      }
    }
    if (cur && cur.length > 1) out.push(cur);
    return out;
  }

  /* ---------- G-code ---------- */
  const n3 = v => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };
  function mapper(S) {
    const M = (x, y) => { let a = S.swap ? y : x, b = S.swap ? x : y; if (S.invX) a = -a; if (S.invY) b = -b; return [a, b]; };
    const inv = (a, b) => { if (S.invX) a = -a; if (S.invY) b = -b; return S.swap ? [b, a] : [a, b]; };
    return { M, inv };
  }
  const penUpLine = S => `G1 G90 Z${n3(S.penUp)} F${S.zUpF}`;
  const penDownLine = S => `G1 G90 Z${n3(S.penDown)} F${S.zDownF}`;
  const codeLines = txt => String(txt || '').split('\n').map(l => l.trim()).filter(Boolean);
  /* G-code for pen up / down by pen type (machine profile, lib/05-machine.js):
   *  z (default) – the pen hangs on the Z axis;  servo – M3 S<value> / M5 + dwell;  gcode – the profile's own lines + dwell */
  function penLines(S, dir) {
    const up = dir === 'up', type = S.penType || 'z';
    if (type === 'z') return [up ? penUpLine(S) : penDownLine(S)];
    const dwell = S.penDwell > 0 ? [`G4 P${(S.penDwell / 1000).toFixed(2)}`] : [];
    if (type === 'servo') return [up ? (S.servoUpM5 ? 'M5' : `M3 S${n3(S.servoUp)}`) : `M3 S${n3(S.servoDown)}`].concat(dwell);
    return codeLines(up ? S.penUpCode : S.penDownCode).concat(dwell);
  }
  /* seconds a pen move takes (Z travel at its feed, or the servo dwell) */
  function penTime(S, dir) {
    if ((S.penType || 'z') !== 'z') return (S.penDwell || 0) / 1000;
    return Math.abs(S.penDown - S.penUp) / Math.min(dir === 'up' ? S.zUpF : S.zDownF, 15000) * 60;
  }
  /* G-code lines for one layer. base = global index of first path (for progress) */
  function layerLines(paths, S, base = 0) {
    const { M } = mapper(S), out = []; let down = false;
    paths.forEach((p, pi) => {
      const pts = p.pts; let first = true, k0 = 0;
      if (!(p.join && down)) {
        if (down) { for (const l of penLines(S, 'up')) out.push({ l }); down = false; }
        const [a, b] = M(pts[0][0], pts[0][1]);
        out.push({ l: `G1 X${n3(a)} Y${n3(b)} F${S.travelF}` });
        for (const l of penLines(S, 'down')) out.push({ l });
        if (S.penDelay > 0) out.push({ l: `G4 P${(S.penDelay / 1000).toFixed(2)}` });
        down = true; k0 = 1;
      }
      for (let k = k0; k < pts.length; k++) {
        const [a, b] = M(pts[k][0], pts[k][1]);
        out.push({ l: `G1 X${n3(a)} Y${n3(b)}${first ? ' F' + S.drawF : ''}`, m: [base + pi, k + 1] });
        first = false;
      }
      if (k0 === 1 && pts.length === 1) out.push({ l: 'G4 P0.1', m: [base + pi, 1] });
    });
    if (down) for (const l of penLines(S, 'up')) out.push({ l });
    return out;
  }
  function startLines(S) {
    const L = ['G21', 'G90', ...codeLines(S.headerCode), ...penLines(S, 'up')];
    if (S.startMode === 'home') {
      L.push('$H');
      if (S.homeOffX || S.homeOffY) L.push('G91', `G1 X${n3(S.homeOffX)} Y${n3(S.homeOffY)} F${S.travelF}`, 'G90');
      L.push('G92 X0 Y0');
    } else if (S.startMode === 'current') L.push('G92 X0 Y0');
    L.push(`G1 F${S.travelF}`);
    return L;
  }
  function endLines(S) {
    const L = [...penLines(S, 'up'), `G1 G90 X0 Y0 F${S.travelF}`, 'G4 P0', ...codeLines(S.footerCode)];
    if (S.sleepAfter && S.canSleep !== false) L.push('$SLP');
    return L;
  }
  /* G-code comments stay plain ASCII (some senders choke on UTF-8) */
  const ascii = s => String(s == null ? '' : s).replace(/[ÄäÖöÜü]/g, c => ({ Ä: 'Ae', ä: 'ae', Ö: 'Oe', ö: 'oe', Ü: 'Ue', ü: 'ue' }[c])).replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[;()]/g, ' ').trim();
  function programText(job, S) {
    const out = [`; Stiftwerk G-code for ${ascii(S.name || 'a GRBL pen plotter')}`, `; ${job.layers.length} pen(s), ${Math.round(job.stats.draw)} mm drawing`];
    out.push(...startLines(S));
    let base = 0;
    job.layers.forEach((L, i) => {
      out.push(`; --- pen ${i + 1}: ${ascii(L.name)} (${L.color}) ---`);
      if (i > 0) { out.push(...penLines(S, 'up')); if (S.park === 'origin') out.push(`G1 G90 X0 Y0 F${S.travelF}`); out.push('M0 ; change pen, then cycle start (~)'); }
      for (const x of layerLines(L.paths, S, base)) out.push(x.l);
      base += L.paths.length;
    });
    out.push(...endLines(S));
    return out.join('\n') + '\n';
  }
  function jobStats(layers, S) {
    let draw = 0, travel = 0, downs = 0, pts = 0, cur = [0, 0];
    for (const L of layers) for (const p of L.paths) {
      draw += polyLen(p.pts); pts += p.pts.length;
      if (!p.join) { downs++; travel += dist(cur, p.pts[0]); } else draw += dist(cur, p.pts[0]);
      cur = p.pts[p.pts.length - 1];
    }
    travel += dist(cur, [0, 0]);
    const penT = penTime(S, 'up') + penTime(S, 'down');
    const time = (draw / S.drawF * 60 + travel / S.travelF * 60) * 1.15 + downs * (penT + 0.12 + (S.penDelay || 0) / 1000);
    return { draw, travel, downs, pts, time };
  }

  return { clamp, dist, uid, parsePathD, flattenSub, shapeToD, renderText, glyphStrokes, hasGlyph, glyphSource, ascii, textWidth, dash, BUILTIN, parseSvgFont, bbox, polyLen, rdp, clean, clipPoly, hatch, order, mapper, n3, layerLines, startLines, endLines, programText, jobStats, penUpLine, penDownLine, penLines, penTime };
})();
if (typeof module !== 'undefined') module.exports = SW;
