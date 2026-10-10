// Regression: the <text> loop of importSVG must not redeclare its loop variable (`const el` inside `for (const el of …)`
// throws "Cannot access 'el' before initialization" at runtime although the script still parses).
const { readFileSync } = require('fs');
const { join } = require('path');
const assert = require('assert');
const src = readFileSync(join(__dirname, '..', 'src', 'app', '30-import.js'), 'utf8');
const loops = [...src.matchAll(/for \((?:const|let) (\w+) of [^)]*\) \{([\s\S]*?)\n    \}/g)];
assert(loops.length >= 2, 'expected the element loops of importSVG');
for (const [, v, body] of loops) assert(!new RegExp(`\\b(?:const|let|var) ${v}\\b`).test(body), `loop variable "${v}" is redeclared inside its loop body`);
const m = src.match(/for \(const el of svg\.querySelectorAll\('text'\)\) \{([\s\S]*?)\n    \}/);
assert(m && /el: ei\b/.test(m[1]) && /textStyle\[ei\]/.test(m[1]), 'text runs must carry the element index (el) and a textStyle entry');
console.log('import text loop ok');
