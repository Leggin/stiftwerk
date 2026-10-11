const assert = require('assert');
const C = require('../src/lib/00-color.js');
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
// distances (OKLab)
assert.ok(near(C.dist('#d22b2b', '#d9472b'), 0.046), 'red vs red-orange');
assert.ok(C.dist('#d22b2b', '#2a44d4') > 0.3, 'red vs blue');
// same-pen rule
assert.ok(C.similar('#000000', '#1d2433'), 'ticket black + default text black share a pen (ink-black family)');
assert.ok(C.similar('#d22b2b', '#e03030'));
assert.ok(C.similar('#808080', '#7a7a7a'));
assert.ok(!C.similar('#000000', '#1a1a80'), 'navy is a different pen');
assert.ok(!C.similar('#000000', '#300000'), 'dark red is a different pen');
assert.ok(!C.similar('#d22b2b', '#2a44d4'));
// anchor grouping: heaviest first, no chaining
const g = C.group([{ key: 'a', color: '#000000', weight: 10 }, { key: 'b', color: '#1d2433', weight: 50 }, { key: 'c', color: '#d22b2b', weight: 5 }, { key: 'd', color: '#d9472b', weight: 1 }]);
assert.strictEqual(g.of.get('a'), 'b', 'heavier black is the anchor');
assert.strictEqual(g.of.get('d'), 'c');
assert.strictEqual(g.anchors.length, 2);
// grey ramp: steps of ~0.04 must not chain into one group
const ramp = ['#606060', '#6a6a6a', '#747474', '#7e7e7e', '#888888', '#929292'].map((c, i) => ({ key: c, color: c, weight: 10 - i }));
const gr = C.group(ramp);
assert.ok(gr.anchors.length >= 2, 'no chaining through a gradient');
// determinism
assert.deepStrictEqual([...C.group(ramp).of], [...C.group(ramp.slice().reverse()).of]);
// names
assert.strictEqual(C.nameId('#1d2433'), 'black');
assert.strictEqual(C.nameId('#d22b2b'), 'red');
assert.strictEqual(C.nameId('#2a44d4'), 'blue');
console.log('color ok');
// paper-like fills (knock-outs) vs. light inks
{ const C = require('../src/lib/00-color.js'); assert.ok(C.isPaper('#ffffff') && C.isPaper('#fdfcf8')); assert.ok(!C.isPaper('#ffeb3b') && !C.isPaper('#e0e0e0') && !C.isPaper('#000000')); }
