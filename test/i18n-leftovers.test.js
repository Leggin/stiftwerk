// Heuristic: user-visible German that bypasses i18n. Scans string literals and template text in src/app/*.js
// and text / title, aria-label, placeholder, alt in src/html/*.html. Allowlist: test/i18n-allow.json.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const listDir = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(ext)).sort().map(f => `${dir}/${f}`);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

// umlauts / ß, or German function words and UI nouns (capitalised forms where English would clash, e.g. "die")
const GERMAN = new RegExp('[äöüÄÖÜß]|\\b(?:[Uu]nd|[Dd]er|[Dd]ie|[Dd]as|[Nn]icht|[Mm]it|[Ee]in|[Ee]ine|[Ii]st|[Ww]ird|[Oo]der|[Zz]um|[Bb]eim|' +
  '[Bb]itte|[Ss]tift|[Bb]latt|[Ff]arbe|[Ss]chrift|[Zz]eichnen|[Pp]lotten|[Dd]atei|[Ff]ehler|[Vv]erbindung|[Ee]instellung|[Aa]bbrechen|' +
  '[Ss]peichern|[Ss]chritt|[Ee]bene|[Bb]ereich|[Vv]orab|[Mm]otiv|[Mm]aschine|[Ss]eite|[Ll]eerfahrt|[Rr]eferenzfahrt|[Nn]ullpunkt)\\b');
const KEYWORDS_BEFORE_EXPR = /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await|instanceof)$/;
const WORD = /[A-Za-z_$][\w$]*|\d[\w.]*/y;

// Minimal JS lexer: returns string literal values and template text chunks with their line numbers.
// Skips comments; regex literals are recognised by the previous token.
function jsLiterals(src) {
  const out = [], tplDepth = [], n = src.length;
  let i = 0, line = 1, depth = 0, last = '(';
  const regexAllowed = () => /^[A-Za-z_$]/.test(last) ? KEYWORDS_BEFORE_EXPR.test(last) : !/^[\d)\]]/.test(last);
  function templateText(startLine) {
    let s = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; out.push({ line: startLine, text: s }); last = ')'; return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; out.push({ line: startLine, text: s }); tplDepth.push(depth); last = '{'; return; }
      if (c === '\n') line++;
      s += c; i++;
    }
  }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? n : close + 2;
      line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; } else s += src[j++]; }
      out.push({ line, text: s }); i = j + 1; last = ')'; continue;
    }
    if (c === '`') { i++; templateText(line); continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, inClass = false;
      while (j < n && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') j++; else if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) break;
        j++;
      }
      i = j + 1; while (i < n && /[a-z]/.test(src[i])) i++; last = ')'; continue;
    }
    if (c === '{') { depth++; last = '{'; i++; continue; }
    if (c === '}') {
      if (tplDepth.length && tplDepth[tplDepth.length - 1] === depth) { tplDepth.pop(); i++; templateText(line); continue; }
      depth--; last = '}'; i++; continue;
    }
    WORD.lastIndex = i; const w = WORD.exec(src);
    if (w) { last = w[0]; i += w[0].length; continue; }
    last = c; i++;
  }
  return out;
}

// Markup: text nodes outside data-i18n elements, and checked attributes not listed in the element's data-i18n-attr.
function markupLiterals(src) {
  const s = src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const out = [], stack = [];
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const CHECKED = ['title', 'aria-label', 'placeholder', 'alt'];
  const text = (from, to) => {
    const chunk = s.slice(from, to);
    if (chunk.trim() && GERMAN.test(chunk) && !stack.some(e => e.i18n))
      out.push({ line: lineOf(s, from + chunk.search(/\S/)), text: chunk.trim() });
  };
  let pos = 0;
  for (const m of s.matchAll(TAG)) {
    text(pos, m.index);
    pos = m.index + m[0].length;
    const [, close, name, attrSrc, selfClose] = m;
    const tag = name.toLowerCase();
    if (close) { const k = stack.map(e => e.name).lastIndexOf(tag); if (k >= 0) stack.length = k; continue; }
    const attrs = {};
    for (const a of attrSrc.matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const covered = new Set((attrs['data-i18n-attr'] || '').split(';').map(p => p.split(':')[0].trim()));
    for (const a of CHECKED) if (attrs[a] && GERMAN.test(attrs[a]) && !covered.has(a))
      out.push({ line: lineOf(s, m.index), text: `${a}="${attrs[a]}"` });
    const i18n = ['data-i18n', 'data-i18n-html', 'data-i18n-attr'].some(k => k in attrs);
    if (!VOID.test(tag) && !selfClose) stack.push({ name: tag, i18n });
  }
  text(pos, s.length);
  return out;
}

const allowFile = path.join(root, 'test/i18n-allow.json');
const allow = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {};
const used = new Set();
const flagged = [];
for (const f of listDir('src/app', '.js')) {
  for (const lit of jsLiterals(read(f))) {
    if (GERMAN.test(lit.text) && !/data-i18n/.test(lit.text)) flagged.push({ file: f, line: lit.line, text: lit.text });
  }
}
for (const f of listDir('src/html', '.html')) for (const lit of markupLiterals(read(f))) flagged.push({ file: f, ...lit });

// allowlist key "<file>:<approx snippet>" matches a hit in that file whose text contains the snippet
const problems = [];
for (const hit of flagged) {
  const entry = Object.keys(allow).find(k => k.slice(0, k.indexOf(':')) === hit.file && hit.text.includes(k.slice(k.indexOf(':') + 1)));
  if (entry) used.add(entry);
  else problems.push(`${hit.file}:${hit.line} ${JSON.stringify(hit.text.slice(0, 90))}`);
}
for (const k of Object.keys(allow)) if (!used.has(k)) problems.push(`stale allowlist entry (matches nothing): ${k}`);

if (problems.length) {
  console.error(`German text outside i18n (${problems.length}):\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log(`i18n leftovers ok: ${flagged.length} German-looking literals, all allowlisted`);
