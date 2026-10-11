// motion timeline (smooth playback, live tracking) and size/offset adjustment of plotted texts
const assert = require('assert');
const SW = require('../src/core.js');
const TL = require('../src/lib/60-timeline.js');
const SWJob = require('../src/lib/20-job.js');
const SWText = require('../src/lib/30-textbox.js');
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const S = { penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, penDelay: 0, drawF: 2000, travelF: 8000, park: 'origin', invX: false, invY: true, swap: false };

/* one straight line from (10,10) to (50,10), then a dot */
const layer = { base: 0, paths: [{ pts: [[10, 10], [50, 10]] }, { pts: [[60, 20]] }] };
const tl = TL.build([layer], S);
assert.deepStrictEqual(tl.kind.slice(0, 4), [TL.TRAVEL, TL.DOWN, TL.DRAW, TL.UP], 'travel, pen down, draw, pen up');
assert.ok(tl.total > 0);
// halfway through the drawing segment the pen is in the middle of the line (no jumping from nothing to the whole line)
const i = tl.kind.indexOf(TL.DRAW), mid = tl.t0[i] + tl.dur[i] / 2, s = TL.at(tl, mid);
assert.ok(near(s.pos[0], 30, 1e-9) && near(s.pos[1], 10), 'interpolated position');
assert.strictEqual(s.g, 0); assert.strictEqual(s.k, 1, 'first point complete'); assert.ok(s.down && s.tip);
const quarter = TL.at(tl, tl.t0[i] + tl.dur[i] / 4); assert.ok(near(quarter.pos[0], 20));
// draw speed: 40 mm at 2000 mm/min = 1.2 s (×1.15 for acceleration)
assert.ok(near(tl.dur[i], 40 / (2000 / 60) * 1.15, 1e-9));
// monotonic progress, end state
let lastG = 0; for (let tt = 0; tt <= tl.total; tt += tl.total / 200) { const a = TL.at(tl, tt); assert.ok(a.g >= lastG); lastG = a.g; }
assert.ok(TL.at(tl, tl.total + 1).end);
// acknowledged G-code line → timeline segment
assert.strictEqual(TL.indexOf(tl, 0, 2), i);
// a measured position is placed on the right segment; the pen state disambiguates
const loc = TL.locate(tl, 25, 10.2, 0, tl.n - 1, true);
assert.strictEqual(loc.i, i); assert.ok(near(loc.f, 15 / 40, 1e-6));

/* the timeline follows exactly what SW.layerLines sends: same number of drawing moves per path */
const job = [{ base: 0, paths: SW.order(SW.clean(SW.renderText('Hello', 8), 0.02), {}) }, { base: 0, paths: SW.order(SW.clean(SW.renderText('ok', 8), 0.02), {}) }];
job[1].base = job[0].paths.length;
const tl2 = TL.build(job, S);
const sent = job.flatMap(L => SW.layerLines(L.paths, S, L.base)).filter(x => x.m);
const draws = tl2.kind.filter(k => k === TL.DRAW).length;
assert.strictEqual(draws, sent.length, 'one DRAW segment per acknowledged drawing line');
for (const x of sent) assert.ok(TL.indexOf(tl2, x.m[0], x.m[1]) >= 0, 'every line maps to a segment');
assert.ok(tl2.kind.includes(TL.PAUSE), 'two pens → pen-change pause');

/* size/offset adjustment of a plotted text: scale around the anchor, then shift */
const run = { str: 'AB', x: 10, y: 20, M: [1, 0, 0, 1, 0, 0], fs: 10, ls: 0, anchor: 'start', el: 0 };
const plain = SWJob.textPolys(run, SW.BUILTIN), big = SWJob.textPolys(run, SW.BUILTIN, { k: 2, ax: 10, ay: 20, dx: 3, dy: -1 });
assert.strictEqual(plain.length, big.length);
const p0 = plain[0][0], b0 = big[0][0];
assert.ok(near(b0[0], 10 + (p0[0] - 10) * 2 + 3) && near(b0[1], 20 + (p0[1] - 20) * 2 - 1), 'scaled around anchor and shifted');
assert.deepStrictEqual(SWJob.textPolys(run, SW.BUILTIN, null), plain, 'no adjustment = unchanged');
const adj = { k: 1.5, ax: 10, ay: 20, dx: 2, dy: 4 }, rot = Object.assign({}, run, { M: [0, 1, -1, 0, 5, 7] });
const q = SWText.toItem(rot, 12, 18, adj), back = SWText.toRun(rot, q[0], q[1], adj);
assert.ok(near(back[0], 12) && near(back[1], 18), 'toRun inverts toItem');
const quad = SWText.runQuad(run, 20, adj);
assert.ok(SWText.pointInQuad(SWText.toItem(run, 20, 17, adj), quad), 'hit box follows the adjustment');
console.log('timeline ok');
