// clipping (hidden lines, clip paths) and the general item transform (free rotation, mirroring)
const assert = require('assert');
const G = require('../src/lib/15-geo.js');
const J = require('../src/lib/20-job.js');
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const sq = [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]];
// a horizontal line through a square: outside keeps the two ends, inside keeps the middle
const line = [[0, 15], [30, 15]];
const out = G.clipPolyline(line, sq, 'outside'), inn = G.clipPolyline(line, sq, 'inside');
assert.strictEqual(out.length, 2); assert.ok(near(out[0][1][0], 10) && near(out[1][0][0], 20));
assert.strictEqual(inn.length, 1); assert.ok(near(inn[0][0][0], 10) && near(inn[0][1][0], 20));
// even-odd: a square with a hole keeps the part in the hole
const holed = [sq[0], [[13, 13], [17, 13], [17, 17], [13, 17], [13, 13]]];
assert.strictEqual(G.clipPolyline(line, holed, 'outside').length, 3, 'ends + the bit inside the hole');
// occlusion only by shapes painted later (z greater)
const polys = [{ pts: line, z: 1, layer: 'a' }, { pts: [[0, 40], [30, 40]], z: 1, layer: 'b' }];
const occ = [{ z: 2, rings: sq }];
const r = G.occlude(polys, occ);
assert.strictEqual(r.length, 3, 'line split in two, the far line untouched');
assert.ok(r.every(p => p.layer));
assert.strictEqual(G.occlude(polys, [{ z: 0, rings: sq }]).length, 2, 'a shape painted earlier does not hide');
// a polyline entirely inside disappears
assert.strictEqual(G.occlude([{ pts: [[12, 12], [18, 18]], z: 0 }], occ).length, 0);
// clip-path keeps the inside
assert.strictEqual(G.clipTo(polys, sq).length, 1);

// item transform: 90° steps identical to the old switch, any angle keeps the box centred, mirror flips
const it = { x: 5, y: 7, scale: 2, rot: 90, src: { w: 10, h: 4 } };
const A = J.itemAffine(it); assert.deepStrictEqual(A.map(v => +v.toFixed(9)), [0, 2, -2, 0, 13, 7]);
assert.deepStrictEqual(J.xf(it, [0, 0]).map(v => +v.toFixed(9)), [13, 7]);
const r45 = Object.assign({}, it, { rot: 45 }), f = J.itemFrame(r45);
assert.ok(near(f.BW, (20 + 8) * Math.SQRT1_2) && near(f.BH, f.BW));
const c = J.xf(r45, [5, 2]); assert.ok(near(c[0], 5 + f.BW / 2) && near(c[1], 7 + f.BH / 2), 'centre stays in the middle of the box');
const m = Object.assign({}, it, { rot: 0, flipX: true }); assert.deepStrictEqual(J.xf(m, [0, 0]), [25, 7]); assert.deepStrictEqual(J.xf(m, [10, 0]), [5, 7]);

// itemPolys: occlusion only when the item asks for it; text polys carry z too; cached per src
const item = { x: 0, y: 0, scale: 1, rot: 0, visible: true, src: { w: 30, h: 40, paths: [{ layer: 'a', pts: line, z: 1 }], fills: [], occ, texts: [{}] }, hatch: { on: false } };
const tf = () => ({ polys: [{ layer: 't', pts: [[0, 12], [30, 12]], z: 3 }, { layer: 't', pts: [[0, 18], [30, 18]], z: 1 }], unconverted: 0 });
assert.strictEqual(J.itemPolys(item, tf).polys.length, 3, 'no occlusion unless it.occlude');
item.occlude = true;
const ip = J.itemPolys(item, tf).polys;
assert.strictEqual(ip.length, 5, 'path split in two, text above stays whole, text beneath split in two');
const col = J.collect([item], { w: 100, h: 100 }, tf);
assert.strictEqual(col.by.get('a').length, 2); assert.strictEqual(col.by.get('t').length, 3);
const cached = { polys: [], unconverted: 0 }, tf2 = () => cached;
assert.strictEqual(J.itemPolys(item, tf2), J.itemPolys(item, tf2), 'same text result + src → cached');

// bold doubles every stroke (shifted), italic slants: the top of a vertical stroke moves right
const SWc = require('../src/core.js');
const run = { str: 'I', x: 0, y: 10, fs: 10, ls: 0, anchor: 'start', M: [1, 0, 0, 1, 0, 0] };
const plain = J.textPolys(run, SWc.BUILTIN), bold = J.textPolys(run, SWc.BUILTIN, null, { bold: true }), ital = J.textPolys(run, SWc.BUILTIN, null, { italic: true });
assert.strictEqual(bold.length, plain.length * 2);
const top = ps => ps.flat().reduce((a, q) => q[1] < a[1] ? q : a), bot = ps => ps.flat().reduce((a, q) => q[1] > a[1] ? q : a);
assert.ok(top(ital)[0] - bot(ital)[0] > 1, 'italic leans right');
console.log('geo ok');
