// node test/run.js – runs every test/*.test.js in its own process, no dependencies
const { readdirSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');
const files = readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [join(__dirname, f)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${f}${ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')}`);
}
console.log(failed ? `${failed} of ${files.length} test files failed` : `all ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
