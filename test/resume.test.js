// resume a plot from any point (after an abort or from the scrubbed preview) and the frame trace box
const assert = require('assert');
const SW = require('../src/core.js');
const TL = require('../src/lib/60-timeline.js');
const J = require('../src/lib/20-job.js');
const S = { penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, penDelay: 0, drawF: 2000, travelF: 8000, park: 'origin', invX: false, invY: false, swap: false, startMode: 'current' };
const L1 = { base: 0, paths: [{ pts: [[0, 0], [10, 0]] }, { pts: [[10, 0], [10, 10], [20, 10], [20, 20]], join: true }, { pts: [[30, 30], [40, 30]] }] };
const L2 = { base: 3, paths: [{ pts: [[5, 5], [6, 6]] }] };
// from the middle of path 1, point 2: layer 1 keeps paths 1 (sliced) and 2; layer 2 untouched
const r = J.resumeLayers([L1, L2], 1, 2);
assert.strictEqual(r.length, 2);
assert.strictEqual(r[0].base, 1); assert.strictEqual(r[0].paths.length, 2);
const p = r[0].paths[0];
assert.deepStrictEqual(p.pts, [[20, 10], [20, 20]]); assert.strictEqual(p.k0, 2); assert.strictEqual(p.join, false, 'never joins: the pen comes from elsewhere');
assert.strictEqual(r[1], L2);
assert.strictEqual(L1.paths[1].pts.length, 4, 'source not mutated');
// G-code marks keep the point numbers of the whole path → live progress / canvas cut stay right
const lines = SW.layerLines(r[0].paths, S, r[0].base);
const marks = lines.filter(x => x.m).map(x => x.m);
assert.deepStrictEqual(marks[0], [1, 4], 'first drawn point is point 4 of path 1');
assert.ok(lines[0].l.startsWith('G1 X20 Y10 '), 'travel to the resume point first');
// the timeline uses the same numbers (indexOf finds acknowledged lines)
const tl = TL.build(r, S);
assert.ok(TL.indexOf(tl, 1, 4) >= 0);
assert.strictEqual(TL.at(tl, 0).g, 1);
// a point index past the end keeps the last segment; from the next layer = whole layers only
assert.deepStrictEqual(J.resumeLayers([L1, L2], 1, 99)[0].paths[0].pts, [[20, 10], [20, 20]]);
assert.deepStrictEqual(J.resumeLayers([L1, L2], 3, 0), [L2]);
assert.deepStrictEqual(J.resumeLayers([L1, L2], 4, 0), []);
// start lines: resuming keeps the zero point
assert.ok(SW.startLines(S).includes('G92 X0 Y0'));
assert.ok(!SW.startLines(S, { zero: false }).includes('G92 X0 Y0'));
assert.ok(SW.startLines(Object.assign({}, S, { startMode: 'home', canHome: true }), { zero: false }).includes('G92 X0 Y0'), 'homing always sets the zero point');
// frame box
assert.deepStrictEqual(J.frameBox([L1, L2]), { x0: 0, y0: 0, x1: 40, y1: 30 });
assert.strictEqual(J.frameBox([]), null);
console.log('resume ok');
