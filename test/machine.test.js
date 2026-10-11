// machine profiles: validation, legacy migration, detection, pen G-code per pen type, timing, work area
const assert = require('assert');
const SW = require('../src/core.js');
const MC = require('../src/lib/05-machine.js');
const TL = require('../src/lib/60-timeline.js');

/* validation: clamps, drops unknown keys, survives garbage */
const v = MC.validate({ template: 'idraw2-a4', machW: -5, penType: 'laser', drawF: 'fast', evil: '<script>', name: '  ' });
assert.strictEqual(v.machW, 10, 'clamped');
assert.strictEqual(v.penType, 'z', 'unknown enum → template value');
assert.strictEqual(v.drawF, 2000, 'NaN → template value');
assert.ok(!('evil' in v), 'unknown keys dropped');
assert.strictEqual(v.name, 'UUNA TEK iDraw 2.0 A4');
assert.ok(MC.validate('nonsense').id && MC.validate(null).machW > 0, 'garbage imports become a usable profile');
assert.strictEqual(MC.validate({ template: 'grbl-z', canHome: false, startMode: 'home' }).startMode, 'current', 'no homing → no home start');

/* the user's old settings become an iDraw A4 profile with their tuned values */
const legacy = { penUp: 1.2, penDown: 4.4, drawF: 2500, invY: true, machW: 210, machH: 297, optimize: false, baud: 115200 };
const lp = MC.fromLegacySettings(legacy);
assert.strictEqual(lp.template, 'idraw2-a4'); assert.strictEqual(lp.penUp, 1.2); assert.strictEqual(lp.drawF, 2500);
assert.ok(!('optimize' in lp), 'plot preferences stay out of the profile');

/* detection from banners / $I */
assert.strictEqual(MC.detect("Grbl 1.1h DrawCore V2.12 ['$' for help]").family, 'drawcore');
assert.strictEqual(MC.detect("Grbl 3.7 [FluidNC v3.7.12 (wifi) '$' for help]").family, 'fluidnc');
assert.strictEqual(MC.detect("GrblHAL 1.1f ['$' or '$HELP' for help]").family, 'grblhal');
assert.strictEqual(MC.detect("Grbl 1.1h ['$' for help]").family, 'grbl');
assert.strictEqual(MC.detect('EBBv13_and_above EB Firmware Version 2.8.1'), null, 'not GRBL');
assert.strictEqual(MC.familyOf(MC.template('idraw2-a3')), 'drawcore');

/* $$ answer → work area, Z range, laser mode */
assert.deepStrictEqual(MC.parseSettings('$32=1\n$130=297.000\n$131=420.000\n$132=10.000\nok'), { machW: 297, machH: 420, zMax: 10, laser: true });

/* pen G-code by type */
const idraw = MC.template('idraw2-a4'), servo = MC.template('grbl-servo');
assert.deepStrictEqual(SW.penLines(idraw, 'up'), ['G1 G90 Z0.5 F20000']);
assert.deepStrictEqual(SW.penLines(idraw, 'down'), ['G1 G90 Z5 F5000']);
assert.deepStrictEqual(SW.penLines(servo, 'up'), ['M5', 'G4 P0.15']);
assert.deepStrictEqual(SW.penLines(servo, 'down'), ['M3 S255', 'G4 P0.15']);
assert.deepStrictEqual(SW.penLines(Object.assign({}, servo, { servoUpM5: false, servoUp: 30 }), 'up'), ['M3 S30', 'G4 P0.15']);
const custom = Object.assign({}, idraw, { penType: 'gcode', penUpCode: 'M280 P0 S90\n\n', penDownCode: 'M280 P0 S10', penDwell: 0 });
assert.deepStrictEqual(SW.penLines(custom, 'up'), ['M280 P0 S90']);
assert.ok(Math.abs(SW.penTime(servo, 'down') - 0.15) < 1e-9);
assert.ok(Math.abs(SW.penTime(idraw, 'down') - 4.5 / 5000 * 60) < 1e-9);

/* a whole program for a servo machine: no Z anywhere, header/footer code, no $SLP when sleep is unsupported */
const S = Object.assign({ optimize: true, reverse: true, joinTol: 0.1, simplify: 0.02 }, servo, { headerCode: 'M5\nG4 P0.5', footerCode: 'M2', canSleep: false, sleepAfter: true });
const layer = { name: 'Schwarz', color: '#000', base: 0, paths: SW.order(SW.clean(SW.renderText('Hi', 8), 0.02), {}) };
const g = SW.programText({ layers: [layer], stats: SW.jobStats([layer], S) }, S);
assert.ok(!/\bZ-?\d/.test(g.replace(/^;.*$/gm, '')), 'no Z moves for a servo pen');
assert.ok(g.includes('M3 S255') && g.includes('\nM5\n') && g.includes('G4 P0.15'));
assert.ok(g.indexOf('G4 P0.5') < g.indexOf('M3 S255'), 'header code runs first');
assert.ok(/\nM2\n/.test(g) && !g.includes('$SLP'), 'footer code, no sleep');
assert.ok(/^; Stiftwerk G-code for GRBL/.test(g), 'profile name in the header');
/* timeline uses the same pen timing */
const tl = TL.build([layer], S), down = tl.kind.indexOf(TL.DOWN);
assert.ok(Math.abs(tl.dur[down] - 0.15) < 1e-9, 'pen-down time = servo dwell');

/* work area after swap */
assert.deepStrictEqual(MC.workArea({ machW: 297, machH: 420, swap: false }), [297, 420]);
assert.deepStrictEqual(MC.workArea({ machW: 297, machH: 420, swap: true }), [420, 297]);
/* templates are valid profiles */
for (const t of MC.TEMPLATES) { const p = MC.validate(t); for (const k of MC.KEYS) assert.ok(p[k] !== undefined, t.template + ' ' + k); }
console.log('machine ok');
