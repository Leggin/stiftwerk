// Golden: documents saved by the original app, migrated to v2 and run through the pure job pipeline, must produce
// the same G-code the original app produced (comments excluded – they are plain ASCII English now).
const assert = require('assert');
const { readFileSync } = require('fs');
const { join } = require('path');
const SW = require('../src/core.js');
const SWPens = require('../src/lib/10-pens.js');
const SWJob = require('../src/lib/20-job.js');
const SWMigrate = require('../src/lib/50-migrate.js');
// DEFAULTS of src/app/05-settings.js (the fixtures were captured with default settings)
const DEFAULTS = {
  baud: 115200, stream: 'count', rxBuf: 120,
  penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, penDelay: 0, penWidth: 0.4,
  drawF: 2000, travelF: 8000,
  invX: false, invY: true, swap: false, machW: 210, machH: 297,
  startMode: 'current', homeOffX: 0, homeOffY: 0, park: 'origin', sleepAfter: true,
  optimize: true, reverse: true, joinTol: 0.1, simplify: 0.02, showTravel: false, layerMode: 'color'
};
const strip = g => g.split('\n').filter(l => !l.startsWith(';')).map(l => l.replace(/\s*;.*$/, '')).filter(Boolean).join('\n');
// fixtures only use the built-in font
const textFor = it => {
  const polys = []; let unconverted = 0; const seen = new Set();
  for (const t of it.src.texts) {
    const st = it.textStyle[t.el];
    if (st.mode === 'plot') for (const p of SWJob.textPolys(t, SW.BUILTIN)) polys.push({ layer: t.layer, pts: p });
    else if (!seen.has(t.el)) { seen.add(t.el); unconverted++; }
  }
  return { polys, unconverted };
};
function run(name, tweak) {
  const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', name + '.json'), 'utf8'));
  const S = Object.assign({}, DEFAULTS, fx.settings || {});
  const st = SWMigrate.migrate({ items: fx.items, layerMeta: fx.layers, doc: null });
  if (tweak) tweak(st);
  const col = SWJob.collect(st.items, fx.page, textFor);
  const plan = SWPens.plan(st.doc, st.layerMeta, col.by.keys());
  const job = SWJob.buildJob(col, plan, S);
  return { st, job, gcode: SW.programText({ layers: job.plotLayers, stats: job.stats }, S) };
}
for (const name of ['sample.v1', 'ticket.v1']) {
  const golden = readFileSync(join(__dirname, 'golden', name + '.gcode'), 'utf8');
  const { st, job, gcode } = run(name);
  assert.strictEqual(st.doc.penMode, 'multi', 'legacy documents keep one pen per colour');
  assert.strictEqual(strip(gcode), strip(golden), name + ': G-code differs from the original app');
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(gcode), name + ': G-code must be ASCII');
  assert.strictEqual(gcode.split('\n').filter(l => l.startsWith('M0')).length, job.plotLayers.length - 1);
  // single pen: one layer, no pen-change stop, same strokes
  const single = run(name, s => SWPens.setMode(s.doc, 'single'));
  assert.strictEqual(single.job.plotLayers.length, 1);
  assert.ok(!/^M0/m.test(single.gcode), name + ': single mode has no M0');
  const strokes = g => g.split('\n').filter(l => /^G1 X/.test(l) && !/F8000/.test(l)).length;
  assert.strictEqual(strokes(single.gcode), strokes(gcode), name + ': single mode draws the same lines');
}
// ticket: "Schwarz" (#1d2433, calibration square) and "Schwarz 2" (#000000) on one pen → one pen change fewer
{
  const base = run('ticket.v1');
  const merged = run('ticket.v1', s => SWPens.mergePens(s.doc, s.layerMeta, s.layerMeta['#1d2433'].pen, s.layerMeta['#000000'].pen));
  assert.strictEqual(merged.job.plotLayers.length, base.job.plotLayers.length - 1);
  assert.deepStrictEqual(SWPens.suggestions(base.st.doc, base.st.layerMeta, ['#1d2433', '#000000', '#d22b2b']).length, 1, 'the two blacks are suggested for merging');
  // a disabled colour is not plotted but stays in the preview as a ghost layer
  const off = run('ticket.v1', s => { s.layerMeta['#d22b2b'].enabled = false; });
  assert.ok(off.job.layers.some(l => l.ghost && l.keys[0] === '#d22b2b'));
  assert.ok(!off.job.plotLayers.some(l => l.keys.includes('#d22b2b')));
}
console.log('job golden ok');
