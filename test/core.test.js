// node test/core.test.js – prüft die DOM-freie Kernlogik
const assert = require('assert');
const SW = require('../src/core.js');
const T = (x, y) => [x, y];
// Pfad-Parser
const sub = SW.parsePathD('M0,0 a5 5 0 0110 0 a5,5 0 1,1 -10,0z')[0];
assert.ok(sub.closed);
const f = SW.flattenSub(sub, T); assert.ok(Math.abs(f.pts.at(-1)[0]) < 1e-6);
// Clipping
assert.deepStrictEqual(SW.clipPoly([[-5, 5], [5, 5], [5, 15], [15, 15]], 10, 10).parts, [[[0, 5], [5, 5], [5, 10]]]);
// Strichelung
assert.strictEqual(SW.dash([[0, 0], [10, 0]], [1.3, 1.7]).length, 4);
// Schrift
assert.ok(SW.hasGlyph('치') && SW.hasGlyph('★') && SW.hasGlyph('ü'));
assert.ok(SW.renderText('Hallo 치킨', 7).length > 10);
// SVG-Schrift
const font = SW.parseSvgFont('<font horiz-adv-x="500"><font-face units-per-em="1000"/><glyph unicode="H" horiz-adv-x="600" d="M100 0 L100 700 M500 0 L500 700"/></font>');
assert.strictEqual(font.map.get('H').strokes[0][0][1], 10);
// Optimierung + G-Code
const S = { penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, drawF: 2000, travelF: 8000, penDelay: 0, invX: false, invY: true, swap: false, startMode: 'current', sleepAfter: true, park: 'origin' };
const L = [{ name: 'Schwarz', color: '#000', paths: SW.order(SW.clean(SW.renderText('Hi', 8), 0.02), {}) }];
const g = SW.programText({ layers: L, stats: SW.jobStats(L, S) }, S);
assert.ok(g.includes('G92 X0 Y0') && g.includes('$SLP'));
console.log('alle Tests ok');
