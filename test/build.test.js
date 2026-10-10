// Builds dist/ and syntax-checks every inline <script> (catches duplicate top-level declarations
// between src/app/*.js fragments, which share one IIFE scope).
const { execFileSync } = require('child_process');
const { readFileSync, writeFileSync, mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');
const root = join(__dirname, '..');
execFileSync('python3', [join(root, 'build.py'), '--dev'], { cwd: root, stdio: 'pipe' });
const tmp = mkdtempSync(join(os.tmpdir(), 'stiftwerk-build-'));
for (const file of ['stiftwerk.html', 'stiftwerk.dev.html']) {
  const html = readFileSync(join(root, 'dist', file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length < 2) throw new Error(`${file}: expected inline scripts, found ${scripts.length}`);
  scripts.forEach((s, i) => {
    const f = join(tmp, `${file}.${i}.js`); writeFileSync(f, s);
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  });
}
console.log('build ok, scripts parse');
