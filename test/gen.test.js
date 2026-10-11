// pattern generators and layout helpers (align, distribute, snap, copies, cut marks)
const assert = require('assert');
const G = require('../src/lib/45-gen.js');
const Lo = require('../src/lib/35-layout.js');
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const box = r => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of r.paths) for (const q of p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return { x0, y0, x1, y1 }; };
// every generator: something to draw, inside its own size, starting at 0,0
for (const kind of G.KINDS) for (const style of (G.STYLES[kind] || [undefined])) {
  const r = G.make(kind, style ? { style } : {});
  assert.ok(r.paths.length > 0, kind + ' ' + style);
  const b = box(r);
  assert.ok(b.x0 >= -1e-6 && b.y0 >= -1e-6 && b.x1 <= r.w + 1e-6 && b.y1 <= r.h + 1e-6, `${kind}/${style} inside its box`);
  assert.ok(r.paths.every(p => p.every(q => isFinite(q[0]) && isFinite(q[1]))));
}
// a dot grid never gets more dots than MAX_DOTS (spacing grows instead)
assert.ok(G.make('grid', { style: 'dots', w: 190, h: 277, spacing: 0.2 }).paths.length <= G.MAX_DOTS * 1.02);
// clean: clamps, rounds, drops unknown keys, keeps known styles
const c = G.clean('grid', { spacing: -5, style: 'nope', evil: 1, w: '100' });
assert.strictEqual(c.spacing, 0.1); assert.strictEqual(c.style, 'lines'); assert.ok(!('evil' in c)); assert.strictEqual(c.w, 100);
assert.strictEqual(G.clean('calendar', { month: 14.4 }).month, 12);
assert.throws(() => G.make('nope', {}));
// a rosette closes on itself
const ro = G.make('rosette', { R: 40, r: 15, d: 22 }).paths[0];
assert.ok(Math.hypot(ro[0][0] - ro[ro.length - 1][0], ro[0][1] - ro[ro.length - 1][1]) < 1e-6, 'closed curve');
// calendar: February 2026 starts on a Sunday – 28 day numbers; the grid has 6 rows
const cal = G.make('calendar', { year: 2026, month: 2, title: false, frame: false });
assert.ok(cal.paths.length > 28);
// name cards: one card per line, laid out in cols
const nc = G.make('namecard', { names: 'A\nB\nC', cols: 2, cw: 50, ch: 30, gap: 5 });
assert.strictEqual(nc.w, 105); assert.strictEqual(nc.h, 65);

// align: to common bounds and to a reference box
const bs = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 20, h: 10 }];
assert.deepStrictEqual(Lo.align(bs, 'left'), [{ dx: 0, dy: 0 }, { dx: -20, dy: 0 }]);
assert.deepStrictEqual(Lo.align(bs, 'bottom'), [{ dx: 0, dy: 5 }, { dx: 0, dy: 0 }]);
assert.deepStrictEqual(Lo.align([bs[0]], 'hcenter', { x: 0, y: 0, w: 100, h: 100 }), [{ dx: 45, dy: 0 }]);
// distribute: equal gaps, outer boxes stay
const ds = Lo.distribute([{ x: 0, y: 0, w: 10, h: 1 }, { x: 12, y: 0, w: 10, h: 1 }, { x: 50, y: 0, w: 10, h: 1 }], 'x');
assert.deepStrictEqual(ds.map(d => d.dx), [0, 13, 0]);
// snap: the nearest of left / centre / right within tolerance, with a guide
const sn = Lo.snap({ x: 9, y: 50, w: 10, h: 10 }, [10, 105], [0], 2);
assert.strictEqual(sn.dx, 1); assert.strictEqual(sn.dy, 0); assert.deepStrictEqual(sn.guides, [{ axis: 'x', at: 10 }]);
const lines = Lo.snapLines({ w: 210, h: 297, margin: 10 }, [{ x: 50, y: 50, w: 20, h: 20 }]);
assert.ok(lines.xs.includes(105) && lines.xs.includes(200) && lines.xs.includes(60));
// grid of copies: fill a sheet, centred
const gr = Lo.grid(85, 55, { x: 10, y: 10, w: 190, h: 277 }, { fill: true, gap: 0 });
assert.strictEqual(gr.cols, 2); assert.strictEqual(gr.rows, 5); assert.strictEqual(gr.positions.length, 10); assert.ok(gr.fits);
assert.ok(near(gr.positions[0].x, 10 + (190 - 170) / 2));
assert.ok(!Lo.grid(100, 100, { x: 0, y: 0, w: 150, h: 150 }, { cols: 2, rows: 1 }).fits);
// cut marks: 8 per lone box, shared corners of touching boxes are not doubled and never inside a box
const cm = Lo.cutMarks([{ x: 10, y: 10, w: 20, h: 20 }]); assert.strictEqual(cm.length, 8);
const two = [{ x: 0, y: 0, w: 20, h: 20 }, { x: 20, y: 0, w: 20, h: 20 }];
const cm2 = Lo.cutMarks(two); assert.ok(cm2.length < 16);
assert.ok(cm2.every(m => !m.some(q => two.some(b => q[0] > b.x && q[0] < b.x + b.w && q[1] > b.y && q[1] < b.y + b.h))));
console.log('gen + layout ok');

// pen library: validation, overrides per pen type, per-layer settings in stats and timeline
const PL = require('../src/lib/55-penlib.js');
const SWc = require('../src/core.js'), TLc = require('../src/lib/60-timeline.js'), Jc = require('../src/lib/20-job.js');
const e = PL.validate({ name: ' Fineliner ', color: '#ABC', width: 99, drawF: '1200', penDown: '', servoDown: 300, junk: 1 });
assert.strictEqual(e.name, 'Fineliner'); assert.strictEqual(e.color, '#aabbcc'); assert.strictEqual(e.width, 5); assert.strictEqual(e.drawF, 1200); assert.strictEqual(e.penDown, null); assert.ok(!('junk' in e));
const Sz = { penType: 'z', penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, drawF: 2000, travelF: 8000, penDelay: 0 };
assert.deepStrictEqual(PL.overrides(e, Sz), { drawF: 1200 }, 'servo value ignored on a Z pen');
assert.deepStrictEqual(PL.overrides(e, Object.assign({}, Sz, { penType: 'servo' })), { drawF: 1200, servoDown: 300 });
assert.strictEqual(PL.withPen(Sz, PL.validate({})), Sz, 'no overrides → same settings object');
const lib = PL.load([{ id: 'x', name: 'a' }, { id: 'x', name: 'b' }, null]);
assert.strictEqual(lib.length, 3); assert.notStrictEqual(lib[0].id, lib[1].id);
const Lslow = { base: 0, paths: [{ pts: [[0, 0], [100, 0]] }] }, Lfast = Object.assign({}, Lslow, { S: Object.assign({}, Sz, { drawF: 4000 }) });
const t1 = SWc.jobStats([Lslow], Sz).time, t2 = SWc.jobStats([Lfast], Sz).time;
assert.ok(t2 < t1, 'faster pen → shorter estimate');
assert.ok(Math.abs(TLc.build([Lfast], Sz).total - TLc.build([Lslow], Sz).total) > 1, 'timeline uses the pen speed');
assert.ok(SWc.programText({ layers: [Object.assign({ name: 'x', color: '#000' }, Lfast)], stats: { draw: 100 } }, Sz).includes('F4000'), 'G-code uses the pen speed');

// project files
const PJ = require('../src/lib/70-project.js');
const txt = PJ.serialize({ name: 'Karte', page: { fmt: 'A6' }, items: [{ id: 'a', type: 'text', font: 'custom:1' }], layerMeta: {}, doc: { v: 2 }, fonts: { 'custom:1': { name: 'F', svg: '<svg/>' } } }, new Date(0));
const back = PJ.parse(txt);
assert.strictEqual(back.name, 'Karte'); assert.strictEqual(back.items.length, 1); assert.ok(back.fonts['custom:1']);
assert.throws(() => PJ.parse('nope'), e => e.code === 'NOTJSON');
assert.throws(() => PJ.parse('{"app":"other"}'), e => e.code === 'NOTPROJECT');
assert.throws(() => PJ.parse(JSON.stringify({ app: 'stiftwerk', kind: 'project', v: 99, items: [] })), e => e.code === 'NEWER');
assert.deepStrictEqual(PJ.fontIds([{ type: 'svg', textStyle: { 0: { font: 'custom:9' }, 1: { font: 'hershey:x' } } }]), ['custom:9']);
assert.strictEqual(PJ.fileName('Meine Karte!'), 'Meine-Karte.stiftwerk.json');
console.log('penlib + project ok');
