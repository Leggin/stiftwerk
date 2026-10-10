/* ---------------- canvas ---------------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let view = { k: 2, ox: 40, oy: 40 }, dpr = 1, fitted = false;
let progress = null; // {pi, k} global path index & point count during a plot
let simFrac = 1;
function resize() {
  const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  if (!fitted) fitView(); render();
}
function fitView() {
  const r = cv.getBoundingClientRect(); if (!r.width) return;
  const pad = r.width < 500 ? 34 : 56;
  view.k = Math.max(0.2, Math.min((r.width - pad * 2) / page.w, (r.height - pad * 2 - 40) / page.h));
  view.ox = (r.width - page.w * view.k) / 2; view.oy = (r.height - 40 - page.h * view.k) / 2 + 6;
  fitted = true;
}
const toScr = (x, y) => [view.ox + x * view.k, view.oy + y * view.k];
const toMm = (sx, sy) => [(sx - view.ox) / view.k, (sy - view.oy) / view.k];
let rq = 0; function render() { if (!rq) rq = requestAnimationFrame(draw); }
function tok(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
let pen = null; // last known pen position on page (mm)
function draw() {
  rq = 0;
  const W = cv.width / dpr, H = cv.height / dpr, k = view.k;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const C = { sheet: tok('--sheet'), edge: tok('--sheet-edge'), grid: tok('--grid'), rule: tok('--rule'), accent: tok('--accent'), bad: tok('--bad'), ink: tok('--ink'), muted: tok('--muted') };
  const [px, py] = toScr(0, 0), pw = page.w * k, ph = page.h * k;
  // machine area
  const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
  ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = C.muted; ctx.globalAlpha = .45; ctx.strokeRect(px + .5, py + .5, mw * k, mh * k); ctx.restore();
  // sheet
  ctx.save(); ctx.shadowColor = 'rgba(10,15,30,.18)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4; ctx.fillStyle = C.sheet; ctx.fillRect(px, py, pw, ph); ctx.restore();
  ctx.strokeStyle = C.edge; ctx.globalAlpha = .35; ctx.strokeRect(px + .5, py + .5, pw, ph); ctx.globalAlpha = 1;
  // grid every 10 mm
  ctx.beginPath(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let x = 10; x < page.w; x += 10) { const s = Math.round(px + x * k) + .5; ctx.moveTo(s, py); ctx.lineTo(s, py + ph); }
  for (let y = 10; y < page.h; y += 10) { const s = Math.round(py + y * k) + .5; ctx.moveTo(px, s); ctx.lineTo(px + pw, s); }
  ctx.stroke();
  // margin
  if (page.margin > 0) { ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = C.accent; ctx.globalAlpha = .35; ctx.strokeRect(px + page.margin * k, py + page.margin * k, (page.w - 2 * page.margin) * k, (page.h - 2 * page.margin) * k); ctx.restore(); }
  // rulers (mm)
  ctx.fillStyle = C.rule; ctx.strokeStyle = C.rule; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.lineWidth = 1;
  ctx.beginPath();
  const minor = k > 3 ? 1 : k > 1.2 ? 5 : 10;
  for (let x = 0; x <= page.w + 1e-6; x += minor) { const L = x % 10 === 0 ? 7 : x % 5 === 0 ? 4.5 : 2.5, s = Math.round(px + x * k) + .5; ctx.moveTo(s, py - 2); ctx.lineTo(s, py - 2 - L); }
  for (let y = 0; y <= page.h + 1e-6; y += minor) { const L = y % 10 === 0 ? 7 : y % 5 === 0 ? 4.5 : 2.5, s = Math.round(py + y * k) + .5; ctx.moveTo(px - 2, s); ctx.lineTo(px - 2 - L, s); }
  ctx.stroke();
  const lab = k > 2.2 ? 20 : k > 1 ? 50 : 100;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let x = lab; x < page.w; x += lab) ctx.fillText(x, px + x * k, py - 11);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = lab; y < page.h; y += lab) ctx.fillText(y, px - 12, py + y * k);
  // origin marker
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py + 16); ctx.lineTo(px, py); ctx.lineTo(px + 16, py); ctx.stroke();

  // content
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lw = Math.max(0.8, S.penWidth * k);
  if (dragging || !job || jobDirty) {
    for (const it of items) {
      if (!it.visible) continue;
      const own = it.src.texts && it.textMode === 'plot' ? it.src.paths.concat(textGeom(it)) : it.src.paths;
      for (const p of own) {
        const L = layerMeta[p.layer]; if (!L) continue;
        ctx.strokeStyle = L.color; ctx.globalAlpha = L.enabled ? 1 : .2; ctx.lineWidth = lw; ctx.beginPath();
        p.pts.forEach((q, i) => { const [a, b] = toScr(...xf(it, q)); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // progress cut: global path index + points done
    let cut = null;
    if (progress) cut = progress;
    else if (simFrac < 1) { const target = simFrac * job.cumTotal; let i = 0; while (i < job.total && job.cum[i + 1] <= target) i++; const p = flatPath(i); cut = { pi: i, k: p ? Math.max(1, Math.round((target - job.cum[i]) / Math.max(1e-6, job.cum[i + 1] - job.cum[i]) * p.pts.length)) : 0 }; }
    if (S.showTravel) {
      ctx.save(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = C.muted; ctx.globalAlpha = .55; ctx.beginPath();
      let cur = [0, 0];
      for (const L of job.layers) { if (!L.enabled) continue; for (const p of L.paths) { if (!p.join) { const a = toScr(...cur), b = toScr(...p.pts[0]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } cur = p.pts[p.pts.length - 1]; } }
      ctx.stroke(); ctx.restore();
    }
    for (const L of job.layers) {
      ctx.strokeStyle = L.color; ctx.lineWidth = lw;
      L.paths.forEach((p, i) => {
        const g = L.base + i;
        let alpha = L.enabled ? 1 : .15, upto = p.pts.length;
        if (cut && L.enabled) { if (g > cut.pi) alpha = .16; else if (g === cut.pi) upto = Math.min(p.pts.length, cut.k); }
        ctx.globalAlpha = alpha; ctx.beginPath();
        p.pts.forEach((q, j) => { const [a, b] = toScr(q[0], q[1]); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        if (upto < p.pts.length && upto >= 1) {
          ctx.globalAlpha = .16; ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath();
          p.pts.slice(0, Math.max(2, upto)).forEach((q, j) => { const [a, b] = toScr(q[0], q[1]); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        }
        if (p.pts.length === 2 && p.pts[0][0] === p.pts[1][0] && p.pts[0][1] === p.pts[1][1]) { const [a, b] = toScr(...p.pts[0]); ctx.moveTo(a, b); ctx.arc(a, b, lw / 2, 0, 7); }
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
    if (cut && !progress) { const p = flatPath(cut.pi); if (p) { const q = p.pts[Math.min(p.pts.length - 1, Math.max(0, cut.k - 1))]; const [a, b] = toScr(...q); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(a, b, 4, 0, 7); ctx.fill(); } }
  }
  drawSvgTexts();
  ctx.restore();
  // item frames
  for (const it of items) {
    if (!it.visible) continue;
    const [w, h] = itemSize(it), [a, b] = toScr(it.x, it.y);
    const out = it.x < -0.01 || it.y < -0.01 || it.x + w > page.w + 0.01 || it.y + h > page.h + 0.01;
    if (it.id !== selId && !out) continue;
    ctx.save(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = out ? C.bad : C.accent;
    ctx.strokeRect(Math.round(a) + .5, Math.round(b) + .5, w * k, h * k);
    if (it.id === selId) { ctx.setLineDash([]); ctx.fillStyle = C.sheet; ctx.lineWidth = 1.5; for (const [hx, hy] of [[a + w * k, b + h * k]]) { ctx.fillRect(hx - 5, hy - 5, 10, 10); ctx.strokeRect(hx - 5, hy - 5, 10, 10); } }
    ctx.restore();
  }
  // pen marker
  if (pen) {
    const [a, b] = toScr(pen[0], pen[1]);
    ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, b, 7, 0, 7);
    ctx.moveTo(a - 12, b); ctx.lineTo(a - 4, b); ctx.moveTo(a + 4, b); ctx.lineTo(a + 12, b); ctx.moveTo(a, b - 12); ctx.lineTo(a, b - 4); ctx.moveTo(a, b + 4); ctx.lineTo(a, b + 12); ctx.stroke();
    if (penDown) { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(a, b, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
/* texts not yet converted: drawn with the browser in their SVG font (they are not plotted) */
function drawSvgTexts() {
  const V = [view.k, 0, 0, view.k, view.ox, view.oy];
  for (const it of items) {
    if (!it.visible || !it.src.texts || !it.src.texts.length || it.textMode === 'plot') continue;
    const A = mul(V, itemAffine(it));
    for (const t of it.src.texts) {
      const L = layerMeta[t.layer], F = mul(A, t.M), col = L ? L.color : t.color;
      ctx.save(); ctx.setTransform(dpr * F[0], dpr * F[1], dpr * F[2], dpr * F[3], dpr * F[4], dpr * F[5]); ctx.scale(0.01, 0.01);
      const size = t.fs * 100;
      ctx.font = `${t.style === 'italic' ? 'italic ' : ''}${t.weight || 400} ${size}px ${t.family || 'sans-serif'}`;
      if (!ctx.font.includes(String(Math.round(size)).slice(0, 2))) ctx.font = `${size}px sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = (t.ls * 100) + 'px';
      ctx.textAlign = t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = L && !L.enabled ? 0.2 : 0.95;
      if (t.paint === 'stroke') {
        const sc = Math.sqrt(Math.abs(F[0] * F[3] - F[1] * F[2])) * 0.01;
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, S.penWidth * view.k * 0.6) / sc; ctx.strokeText(t.str, t.x * 100, t.y * 100);
      } else { ctx.fillStyle = col; ctx.fillText(t.str, t.x * 100, t.y * 100); }
      ctx.restore();
    }
  }
}
function flatPath(g) { if (!job) return null; for (const L of job.layers) if (g >= L.base && g < L.base + L.paths.length) return L.paths[g - L.base]; return null; }

