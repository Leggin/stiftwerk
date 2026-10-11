/* display name: samples are named in the current language */
const itemName = it => it.nameKey ? t(it.nameKey) : (it.name || '');
/* size of the item's (rotated) bounding box on the sheet */
function itemSize(it) { const f = SWJob.itemFrame(it); return [f.BW, f.BH]; }
/* rotate / mirror around the item's centre (the bounding box is re-centred) */
function rotateItem(it, deg, absolute) {
  const [w0, h0] = itemSize(it), cx = it.x + w0 / 2, cy = it.y + h0 / 2;
  it.rot = ((((absolute ? deg : (it.rot || 0) + deg) % 360) + 360) % 360);
  if (Math.abs(it.rot - Math.round(it.rot)) < 1e-9) it.rot = Math.round(it.rot);
  const [w1, h1] = itemSize(it); it.x = cx - w1 / 2; it.y = cy - h1 / 2;
}
function flipItem(it, axis) { if (axis === 'x') it.flipX = !it.flipX; else it.flipY = !it.flipY; }
function textSource(it) {
  const t = it.text; const key = t.color;
  ensureLayer(key, t.color);
  const polys = SW.renderText(t.str || ' ', t.size, t.line, t.align, t.slant, 0, fontFor(it.font));
  const n = normalise(polys.map(p => ({ layer: key, pts: p })), []);
  return n.src;
}
function makeText(str, opts = {}) {
  const it = { id: SW.uid(), type: 'text', name: 'Text', visible: true, scale: 1, rot: 0, x: 0, y: 0, font: 'builtin', hatch: { on: false, spacing: 1, angle: 45 },
    text: Object.assign({ str, size: 7, line: 1.7, align: 'left', slant: 0, color: '#1d2433' }, opts) };
  it.src = textSource(it); return it;
}
function makeTest() {
  const key = '#1d2433'; ensureLayer(key);
  const P = [];
  P.push([[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]);
  const c = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2; c.push([25 + 20 * Math.cos(a), 25 + 20 * Math.sin(a)]); } P.push(c);
  P.push([[25, 2], [25, 48]], [[2, 25], [48, 25]]);
  for (let i = 1; i < 10; i++) { const L = i % 5 ? 2 : 4; P.push([[i * 5, 50], [i * 5, 50 - L]]); P.push([[0, i * 5], [L, i * 5]]); }
  for (const t of SW.renderText('50 mm', 3.5)) P.push(t.map(([x, y]) => [x + 16, y + 54]));
  const n = normalise(P.map(p => ({ layer: key, pts: p })), []);
  return { id: SW.uid(), type: 'test', name: t('item.calibration'), nameKey: 'item.calibration', visible: true, scale: 1, rot: 0, x: 20, y: 20, src: n.src, hatch: { on: false, spacing: 1, angle: 45 } };
}

