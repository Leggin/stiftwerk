// text boxes, undo history, migration, pen operations
const assert = require('assert');
const { readFileSync } = require('fs');
const { join } = require('path');
const SW = require('../src/core.js');
const T = require('../src/lib/30-textbox.js');
const U = require('../src/lib/40-undo.js');
const M = require('../src/lib/50-migrate.js');
const P = require('../src/lib/10-pens.js');
const near = (a, b) => Math.abs(a - b) < 1e-6;

/* ---- text boxes ---- */
const run = (anchor, M6) => ({ str: 'HELLO', x: 10, y: 20, M: M6, fs: 10, ls: 0, anchor, el: 0 });
const I = [1, 0, 0, 1, 0, 0];
{
  const t = run('start', I), w = T.runWidth(t, SW.BUILTIN), q = T.runQuad(t, w);
  assert.ok(w > 20 && w < 60, 'plausible width');
  assert.ok(near(q[0][0], 10) && near(q[1][0], 10 + w), 'start anchor begins at x');
  assert.ok(q[0][1] < 20 - 6.9 && q[2][1] > 20, 'from above the caps to below the baseline');
  assert.ok(T.pointInQuad([10 + w / 2, 17], q) && !T.pointInQuad([5, 17], q));
  const m = T.runQuad(run('middle', I), w), e = T.runQuad(run('end', I), w);
  assert.ok(near(m[0][0], 10 - w / 2) && near(e[1][0], 10));
  // rotated 90° (e.g. transform="rotate(90)"): x axis → y axis
  const r = T.runQuad(run('start', [0, 1, -1, 0, 0, 0]), w);
  assert.ok(T.pointInQuad([-17, 10 + w / 2], r), 'hit test follows rotation');
  for (const deg of [0, 90, 180, 270]) {
    const a = deg * Math.PI / 180, R = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 50, 50];
    const qq = T.runQuad(run('start', R), w), c = [(qq[0][0] + qq[2][0]) / 2, (qq[0][1] + qq[2][1]) / 2];
    assert.ok(T.pointInQuad(c, qq), 'centre inside at ' + deg);
  }
}
assert.deepStrictEqual(T.elements([{ str: 'A', el: 0 }, { str: 'B', el: 0 }, { str: 'C', el: 1 }]).map(e => [e.el, e.runs, e.str]), [[0, [0, 1], 'A B'], [1, [2], 'C']]);
{
  const font = SW.parseSvgFont('<font horiz-adv-x="500"><font-face units-per-em="1000"/><glyph unicode="H" d="M100 0 L100 700"/></font>');
  const c = T.coverage('H★Ü\u{1F600}', font);
  assert.deepStrictEqual(c.substituted, ['★', 'Ü']);
  assert.deepStrictEqual(c.missing, ['\u{1F600}']);
  assert.deepStrictEqual(T.coverage('Hallo', SW.BUILTIN), { substituted: [], missing: [] });
}

/* ---- undo ---- */
{
  let clock = 0; const h = U.create({ now: () => clock, limit: 4 });
  h.reset('s0', '0');
  assert.ok(!h.commit('same', '0'), 'identical state is not recorded');
  h.commit('s1', '1', { kind: 'move' }); clock += 100; h.commit('s2', '2', { kind: 'move' });
  assert.strictEqual(h.size, 2, 'same kind within the window coalesces');
  clock += 2000; h.commit('s3', '3', { kind: 'move' });
  assert.strictEqual(h.size, 3);
  assert.strictEqual(h.undo(), 's2'); assert.strictEqual(h.undo(), 's0'); assert.strictEqual(h.undo(), null);
  assert.strictEqual(h.redo(), 's2');
  h.commit('s4', '4', { kind: 'font' });
  assert.ok(!h.canRedo, 'a new change cuts the redo branch');
  h.amend('s4b', '4b'); assert.strictEqual(h.undo(), 's2'); assert.strictEqual(h.redo(), 's4b');
  for (let k = 5; k < 10; k++) { clock += 2000; h.commit('s' + k, String(k)); }
  assert.strictEqual(h.size, 4, 'limit');
}

/* ---- migration ---- */
{
  const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ticket.v1.json'), 'utf8'));
  const st = M.migrate({ items: fx.items, layerMeta: fx.layers, doc: null });
  assert.deepStrictEqual(Object.keys(st.layerMeta).sort(), ['#000000', '#1d2433', '#d22b2b'], 'unused colours pruned');
  assert.ok(Object.values(st.layerMeta).every(m => m.name === null), 'German auto names become null');
  assert.strictEqual(st.doc.pens.length, 3);
  const svg = st.items.find(i => i.type === 'svg');
  assert.ok(svg.src.texts.every((t, i) => t.el === i), 'legacy runs: one element per run');
  assert.ok(Object.values(svg.textStyle).every(s => s.mode === 'plot' && s.font === 'builtin'));
  assert.ok(!('textMode' in svg) && !('font' in svg));
  const again = JSON.stringify(M.migrate(JSON.parse(JSON.stringify(st))));
  assert.strictEqual(again, JSON.stringify(st), 'idempotent');
  const sm = M.migrate({ items: JSON.parse(readFileSync(join(__dirname, 'fixtures', 'sample.v1.json'), 'utf8')).items, layerMeta: {}, doc: null });
  assert.deepStrictEqual(sm.items.map(i => i.nameKey), ['sample.lake', 'sample.title', 'sample.footer']);
  const fresh = M.migrate({ items: [], layerMeta: {}, doc: null });
  assert.strictEqual(fresh.doc.penMode, 'single', 'fresh install starts with one pen');
  assert.deepStrictEqual(M.migrate({ items: [null, { src: {} }], layerMeta: null, doc: null }).items, [], 'tolerates broken data');
}

/* ---- pens ---- */
{
  const doc = P.defaultDoc(); doc.penMode = 'multi';
  const lm = { '#000000': { color: '#000000', enabled: true, order: 0 }, '#1d2433': { color: '#1d2433', enabled: true, order: 1 }, '#d22b2b': { color: '#d22b2b', enabled: true, order: 2 } };
  const r = P.assignNew(doc, lm, [{ key: '#000000', weight: 5 }, { key: '#1d2433', weight: 50 }, { key: '#d22b2b', weight: 3 }]);
  assert.strictEqual(doc.pens.length, 2, 'two blacks share a pen');
  assert.strictEqual(lm['#000000'].pen, lm['#1d2433'].pen);
  assert.ok(r.find(x => x.key === '#000000').joined);
  lm['#2b2b2b'] = { color: '#2b2b2b', enabled: true, order: 3 };
  P.assignNew(doc, lm, [{ key: '#2b2b2b', weight: 1 }]);
  assert.strictEqual(lm['#2b2b2b'].pen, lm['#1d2433'].pen, 'a later black joins the existing black pen');
  const red = lm['#d22b2b'].pen, black = lm['#1d2433'].pen;
  assert.ok(P.movePen(doc, red, -1)); assert.strictEqual(doc.pens[0].id, red);
  const plan = P.plan(doc, lm, ['#000000', '#1d2433', '#d22b2b']);
  assert.deepStrictEqual(plan.groups.map(g => g.id), [red, black], 'pen order decides layer order');
  P.setMode(doc, 'single'); assert.strictEqual(P.plan(doc, lm, ['#000000', '#d22b2b']).groups.length, 1);
  assert.strictEqual(P.penColorFor(doc, lm, '#d22b2b'), doc.single.color);
  P.setMode(doc, 'multi'); assert.strictEqual(lm['#d22b2b'].pen, red, 'assignments survive the mode round trip');
  P.removePen(doc, lm, red, black); assert.strictEqual(lm['#d22b2b'].pen, black);
  assert.deepStrictEqual(P.visiblePens(doc, lm, ['#d22b2b']).map(p => p.id), [black]);
}
console.log('libs ok');
