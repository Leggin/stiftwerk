// Dictionary parity (de/en keys, placeholders, plural pairs, American spelling) and: every key used in code exists.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const listDir = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(ext)).sort().map(f => `${dir}/${f}`);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

global.I18N = require('../src/i18n/i18n.js');
for (const lang of ['de', 'en']) for (const f of listDir(`src/i18n/${lang}`, '.js')) require('../' + f);
const { de, en } = I18N.dict;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const failures = [];
const expect = (title, items) => { if (items.length) failures.push(`${title} (${items.length}):\n    ${items.join('\n    ')}`); };

// 1. identical key sets
expect('keys only in de', Object.keys(de).filter(k => !has(en, k)));
expect('keys only in en', Object.keys(en).filter(k => !has(de, k)));

// 2. identical placeholder names per key
const phs = s => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort().join(', ');
expect('placeholders differ between de and en', Object.keys(de)
  .filter(k => has(en, k) && phs(de[k]) !== phs(en[k]))
  .map(k => `${k}: de {${phs(de[k])}} vs en {${phs(en[k])}}`));

// 3. plural pairs: x_one needs x_other and vice versa, in both languages
const pluralGaps = lang => Object.keys(lang).flatMap(k => {
  const m = /^(.+)_(one|other)$/.exec(k);
  const sibling = m && `${m[1]}_${m[2] === 'one' ? 'other' : 'one'}`;
  return m && !has(lang, sibling) ? [`${k} has no ${sibling}`] : [];
});
expect('plural pair missing in de', pluralGaps(de));
expect('plural pair missing in en', pluralGaps(en));

// 4. every literal key used in code (t, tn, tHtml, tnHtml, I18N.has, data-i18n*) exists in both languages
const CALL = /\b(I18N\.has|tnHtml|tHtml|tn|t)\(\s*(['"])([^'"\n]+)\2\s*[,)]/g;
const DYNAMIC = /\b(I18N\.has|tnHtml|tHtml|tn|t)\(\s*(?:(['"])([^'"\n]*?)\2\s*\+|`([^`\n]*?)\$\{)/g;
const DATA = /data-i18n(-html|-attr)?=(["'])([^"'\n]*)\2/g;
const jsFiles = listDir('src/app', '.js');
const markupFiles = listDir('src/html', '.html');
const missing = [];
const prefixes = new Map(); // dynamic key prefix -> first place it is used
for (const f of [...jsFiles, ...markupFiles]) {
  const s = read(f);
  const at = i => `${f}:${lineOf(s, i)}`;
  for (const m of s.matchAll(CALL)) {
    const [, fn, , key] = m;
    const needed = fn === 'tn' || fn === 'tnHtml' ? [key + '_other'] : [key];
    for (const k of needed) for (const [name, dict] of [['de', de], ['en', en]])
      if (!has(dict, k)) missing.push(`${at(m.index)} '${k}' missing in ${name}`);
  }
  for (const m of s.matchAll(DYNAMIC)) {
    const prefix = m[3] ?? m[4];
    if (prefix) prefixes.set(prefix, prefixes.get(prefix) || at(m.index));
  }
  for (const m of s.matchAll(DATA)) {
    const val = m[3];
    if (/[${+]/.test(val)) continue; // dynamic attribute value
    const keys = m[1] === '-attr' ? val.split(';').map(p => p.slice(p.indexOf(':') + 1).trim()).filter(Boolean) : [val];
    for (const k of keys) for (const [name, dict] of [['de', de], ['en', en]])
      if (!has(dict, k)) missing.push(`${at(m.index)} '${k}' missing in ${name}`);
  }
}
expect('keys used in code but missing from the dictionaries', missing);

// 4b. dynamic prefixes ('color.' + x, `page.fmt.${x}`): at least one key must carry the prefix
expect('dynamic key prefix without any key', [...prefixes]
  .filter(([p]) => !Object.keys(de).some(k => k.startsWith(p)) || !Object.keys(en).some(k => k.startsWith(p)))
  .map(([p, where]) => `'${p}' used at ${where}`));

// 5. American spelling in English values
const BRITISH = /\b(colour|centre|grey|favourite|behaviour|organis|optimis|cancelled)/i;
expect('British spelling in en values', Object.keys(en).filter(k => BRITISH.test(en[k])).map(k => `${k}: "${en[k]}"`));

if (failures.length) {
  console.error('i18n test failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`i18n ok: ${Object.keys(de).length} keys, ${prefixes.size} dynamic prefixes checked`);
