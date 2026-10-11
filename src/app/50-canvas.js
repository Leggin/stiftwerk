/* ---------------- canvas ---------------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let view = { k: 2, ox: 40, oy: 40 }, dpr = 1, fitted = false, userView = false; // userView: panned/zoomed by hand → don't refit on resize
let progress = null; // {pi, k} global path index & point count during a plot
let simFrac = 1;
function resize() {
  const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  if (!userView) fitView(); render();
}
function fitView() {
  const r = cv.getBoundingClientRect(); if (!r.width) return;
  const mobile = r.width < 500, padX = mobile ? 30 : 56, top = 62, bottom = mobile ? 64 : 92;   // room for the chips on top, zoom / step-③ dock below
  view.k = Math.max(0.2, Math.min((r.width - padX * 2) / page.w, (r.height - top - bottom) / page.h));
  view.ox = (r.width - page.w * view.k) / 2; view.oy = top + (r.height - top - bottom - page.h * view.k) / 2;
  fitted = true; userView = false;
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
  const C = { sheet: tok('--sheet'), edge: tok('--sheet-edge'), grid: tok('--grid'), rule: tok('--rule'), accent: tok('--accent'), bad: tok('--bad'), ink: tok('--ink'), muted: tok('--muted'), rose: tok('--rose'), shadow: tok('--sheet-shadow') };
  const [px, py] = toScr(0, 0), pw = page.w * k, ph = page.h * k;
  // machine area
  const mw = S.swap ? S.machH : S.machW, mh = S.swap ? S.machW : S.machH;
  ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = C.muted; ctx.globalAlpha = .4; ctx.strokeRect(px + .5, py + .5, mw * k, mh * k); ctx.restore();
  // sheet
  ctx.save(); ctx.shadowColor = C.shadow; ctx.shadowBlur = 26; ctx.shadowOffsetY = 7; ctx.fillStyle = C.sheet; ctx.fillRect(px, py, pw, ph); ctx.restore();
  ctx.save(); ctx.shadowColor = C.shadow; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1; ctx.fillStyle = C.sheet; ctx.fillRect(px, py, pw, ph); ctx.restore();
  ctx.strokeStyle = C.edge; ctx.globalAlpha = .3; ctx.strokeRect(px + .5, py + .5, pw, ph); ctx.globalAlpha = 1;
  // grid every 10 mm
  ctx.beginPath(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let x = 10; x < page.w; x += 10) { const s = Math.round(px + x * k) + .5; ctx.moveTo(s, py); ctx.lineTo(s, py + ph); }
  for (let y = 10; y < page.h; y += 10) { const s = Math.round(py + y * k) + .5; ctx.moveTo(px, s); ctx.lineTo(px + pw, s); }
  ctx.stroke();
  // margin
  if (page.margin > 0) { ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = C.accent; ctx.globalAlpha = .35; ctx.strokeRect(px + page.margin * k, py + page.margin * k, (page.w - 2 * page.margin) * k, (page.h - 2 * page.margin) * k); ctx.restore(); }
  // rulers (mm)
  ctx.fillStyle = C.rule; ctx.strokeStyle = C.rule; ctx.font = '10px "DM Mono", ui-monospace, monospace'; ctx.lineWidth = 1;
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
      const own = it.src.texts && it.src.texts.length ? it.src.paths.concat(plottedTextPolys(it).polys) : it.src.paths;
      for (const p of own) {
        ctx.strokeStyle = penColorFor(p.layer); ctx.globalAlpha = layerOn(p.layer) ? 1 : .2; ctx.lineWidth = lw; ctx.beginPath();
        p.pts.forEach((q, i) => { const [a, b] = toScr(...xf(it, q)); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // playhead (55-playback.js): paths before cut.pi are done, path cut.pi up to cut.k points + the line to the pen (cut.tip)
    const cut = pbCut();
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
        const current = cut && L.enabled && g === cut.pi;
        if (cut && L.enabled) { if (g > cut.pi) alpha = .16; else if (current) upto = Math.min(p.pts.length, cut.k); }
        if (current && plotting) {                       // the line the plotter is drawing right now: a soft glow
          ctx.save(); ctx.globalAlpha = .28; ctx.strokeStyle = C.accent; ctx.lineWidth = lw + 7; ctx.beginPath();
          p.pts.forEach((q, j) => { const [a, b] = toScr(q[0], q[1]); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.restore();
        }
        ctx.globalAlpha = alpha; ctx.beginPath();
        p.pts.forEach((q, j) => { const [a, b] = toScr(q[0], q[1]); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        if (current && upto < p.pts.length) {
          ctx.globalAlpha = .16; ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath();
          const part = p.pts.slice(0, upto).concat(cut.tip && upto >= 1 ? [cut.tip] : []);
          if (part.length >= 2) part.forEach((q, j) => { const [a, b] = toScr(q[0], q[1]); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        }
        if (p.pts.length === 2 && p.pts[0][0] === p.pts[1][0] && p.pts[0][1] === p.pts[1][1]) { const [a, b] = toScr(...p.pts[0]); ctx.moveTo(a, b); ctx.arc(a, b, lw / 2, 0, 7); }
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  }
  for (const o of SWUI.overlays.list) if (o.clip !== false) o.draw(ctx);
  ctx.restore();
  // item frames (itemBox includes plotted SVG text, which can be wider than the source box)
  for (const it of items) {
    if (!it.visible) continue;
    const bx = itemBox(it), [a, b] = toScr(bx.x, bx.y), w = bx.w, h = bx.h;
    const out = bx.x < -0.01 || bx.y < -0.01 || bx.x + w > page.w + 0.01 || bx.y + h > page.h + 0.01;
    const sel = it.id === selId && step === 'motiv';
    if (!sel && !out) continue;
    const fx = Math.round(a) + .5, fy = Math.round(b) + .5;
    ctx.save();
    if (sel && !out) { ctx.fillStyle = C.rose; ctx.globalAlpha = .14; ctx.fillRect(fx, fy, w * k, h * k); ctx.globalAlpha = 1; }
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.25; ctx.strokeStyle = out ? C.bad : C.accent;
    ctx.strokeRect(fx, fy, w * k, h * k);
    if (sel) {
      const hx = a + w * k, hy = b + h * k;
      ctx.setLineDash([]); ctx.fillStyle = C.sheet; ctx.strokeStyle = out ? C.bad : C.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 2.2, hy + 2.2); ctx.lineTo(hx + 2.2, hy - 2.2); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }
  for (const o of SWUI.overlays.list) if (o.clip === false) o.draw(ctx);
  // pen marker: the playhead while previewing / plotting (smooth), otherwise the last reported position
  const pm = pbPen() || (pen ? { pos: pen, down: penDown } : null);
  if (pm) {
    const [a, b] = toScr(pm.pos[0], pm.pos[1]), penDown = pm.down;
    ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, b, 7, 0, 7);
    ctx.moveTo(a - 12, b); ctx.lineTo(a - 4, b); ctx.moveTo(a + 4, b); ctx.lineTo(a + 12, b); ctx.moveTo(a, b - 12); ctx.lineTo(a, b - 4); ctx.moveTo(a, b + 4); ctx.lineTo(a, b + 12); ctx.stroke();
    if (penDown) { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(a, b, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
function flatPath(g) { if (!job) return null; for (const L of job.layers) if (g >= L.base && g < L.base + L.paths.length) return L.paths[g - L.base]; return null; }

