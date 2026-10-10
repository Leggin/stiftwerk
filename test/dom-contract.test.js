// DOM contract: every #id the app looks up ($, $$, querySelector(All), getElementById) must be defined somewhere in the
// markup: src/html/*.html, or id="…" / .id = '…' in src/app/*.js (template strings). Dynamic values (${…}, concatenation)
// are not checked.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const listDir = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(ext)).sort().map(f => `${dir}/${f}`);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

const jsFiles = listDir('src/app', '.js');
const markupFiles = listDir('src/html', '.html');

// lookups: the literal selector must end right after the string (no concatenation)
const SELECTOR_CALL = /(?<![\w$])(?:\$\$?|querySelectorAll|querySelector)\(\s*(['"`])([^'"`\n]*)\1\s*[,)]/g;
const BY_ID = /getElementById\(\s*(['"`])([^'"`\n]*)\1\s*\)/g;
const DEFINITIONS = [/(?<![\w-])id=(["'])([^"'\n]*)\1/g, /\.id\s*=\s*(['"`])([^'"`\n]*)\1/g];

const defined = new Set();
for (const f of [...markupFiles, ...jsFiles]) {
  const s = read(f);
  for (const re of DEFINITIONS) for (const m of s.matchAll(re)) if (!m[2].includes('${')) defined.add(m[2]);
}

const referenced = [];
for (const f of jsFiles) {
  const s = read(f);
  for (const m of s.matchAll(SELECTOR_CALL)) {
    const literal = m[2].split('${')[0]; // the part before a template expression is still a fixed id
    const id = /#([A-Za-z_][\w-]*)/.exec(literal);
    if (id) referenced.push({ id: id[1], where: `${f}:${lineOf(s, m.index)}` });
  }
  for (const m of s.matchAll(BY_ID)) if (!m[2].includes('${')) referenced.push({ id: m[2], where: `${f}:${lineOf(s, m.index)}` });
}

// Ids that are defined at runtime by concatenation, so no literal definition exists:
const DYNAMIC_ALLOW = {
  // 66-settings-ui.js: const id = 'mcs_' + f.k (one input per settings field; f.k = 'startMode' in 05-settings.js)
  mcs_startMode: 'built as "mcs_" + field key in src/app/66-settings-ui.js',
};

const missing = referenced.filter(r => !defined.has(r.id) && !Object.prototype.hasOwnProperty.call(DYNAMIC_ALLOW, r.id));
if (missing.length) {
  const byId = new Map();
  for (const r of missing) byId.set(r.id, [...(byId.get(r.id) || []), r.where]);
  console.error(`ids looked up in src/app but defined nowhere (${byId.size}):\n  ` +
    [...byId].map(([id, wheres]) => `#${id}  ${wheres.join(', ')}`).join('\n  '));
  process.exit(1);
}
const usedIds = new Set(referenced.map(r => r.id));
console.log(`dom contract ok: ${usedIds.size} ids looked up, ${defined.size} ids defined`);
