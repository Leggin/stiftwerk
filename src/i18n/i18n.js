/* i18n runtime. Dictionaries live in src/i18n/<lang>/<area>.js and call I18N.add(lang, {...}).
 * Keys are flat and dotted ('pens.mode.single'). Plurals: key_one / key_other (Intl.PluralRules), used via tn().
 * Placeholders: {name}. Dictionary strings are trusted (may contain <b>, <code>, <kbd>, <br> for tHtml / data-i18n-html);
 * interpolated values are always escaped in tHtml. Usable in Node for tests (module.exports). */
const I18N = (() => {
  const LANGS = ['de', 'en'];
  const dict = { de: {}, en: {} };
  const listeners = [];
  const warned = new Set();
  let lang = 'de', pseudo = false;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function add(l, entries) { Object.assign(dict[l] || (dict[l] = {}), entries); }
  function raw(key) {
    let s = dict[lang] && dict[lang][key];
    if (s == null) s = dict.de[key] != null ? dict.de[key] : dict.en[key];
    if (s == null) { if (!warned.has(key)) { warned.add(key); if (typeof console !== 'undefined') console.warn('i18n: missing key', key); } return null; }
    return pseudo ? stretch(s) : s;
  }
  // pseudo-locale (?lang=xx): +40 % length, brackets show untranslated/clipped text
  function stretch(s) { return '⟦' + s + '·'.repeat(Math.ceil(s.replace(/<[^>]+>|\{\w+\}/g, '').length * 0.4)) + '⟧'; }
  const interp = (s, vars, f = String) => s.replace(/\{(\w+)\}/g, (m, k) => vars && k in vars ? f(vars[k]) : m);

  function t(key, vars) { const s = raw(key); return s == null ? key : interp(s, vars); }
  function tHtml(key, vars) { const s = raw(key); return s == null ? esc(key) : interp(s, vars, esc); }
  const prCache = {};
  function plural(n) { const l = lang; return (prCache[l] || (prCache[l] = new Intl.PluralRules(l))).select(n); }
  function pluralKey(key, n) { const k = key + '_' + plural(n); return (dict[lang] && dict[lang][k] != null) || dict.de[k] != null ? k : key + '_other'; }
  function tn(key, n, vars) { return t(pluralKey(key, n), Object.assign({ n: fmtInt(n) }, vars)); }
  function tnHtml(key, n, vars) { return tHtml(pluralKey(key, n), Object.assign({ n: fmtInt(n) }, vars)); }
  function has(key) { return dict.de[key] != null || dict.en[key] != null; }

  const locale = () => (lang === 'de' ? 'de-DE' : 'en-GB');
  const nfCache = {};
  function fmt(v, d = 1) { const k = locale() + d; return (nfCache[k] || (nfCache[k] = new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }))).format(Number(v)); }
  function fmtInt(v) { return fmt(Math.round(Number(v)), 0); }
  function fmtTime(s) {
    s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = v => String(v).padStart(2, '0');
    return h ? t('fmt.time.h', { t: `${h}:${p(m)}:${p(x)}` }) : t('fmt.time.min', { t: `${m}:${p(x)}` });
  }

  /* static markup: data-i18n="key" (text), data-i18n-html="key" (trusted markup), data-i18n-attr="aria-label:key;title:key2" */
  function apply(root) {
    if (!root || !root.querySelectorAll) return;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = tHtml(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-attr]'))
      for (const pair of el.dataset.i18nAttr.split(';')) { const [a, k] = pair.split(':').map(x => x.trim()); if (a && k) el.setAttribute(a, t(k)); }
  }
  function setLang(l, opts = {}) {
    pseudo = l === 'xx'; lang = pseudo ? 'de' : (LANGS.includes(l) ? l : 'en');
    if (!opts.temporary && !pseudo) { try { localStorage.setItem('stiftwerk:lang', lang); } catch (e) { } }
    if (typeof document !== 'undefined') { document.documentElement.lang = lang; apply(document); }
    for (const f of listeners) { try { f(lang); } catch (e) { console.error(e); } }
  }
  function detect() {
    let q = null; try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { }
    if (q) return q;
    let saved = null; try { saved = localStorage.getItem('stiftwerk:lang'); } catch (e) { }
    if (saved && LANGS.includes(saved)) return saved;
    const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    for (const n of nav) { const b = String(n || '').slice(0, 2).toLowerCase(); if (LANGS.includes(b)) return b; }
    return 'en';
  }
  function init() { const l = detect(); setLang(l, { temporary: true }); return lang; }
  function onChange(f) { listeners.push(f); }

  return { LANGS, add, t, tn, tHtml, tnHtml, has, fmt, fmtInt, fmtTime, apply, setLang, init, onChange, dict,
    get lang() { return lang; }, get pseudo() { return pseudo; } };
})();
if (typeof module !== 'undefined') module.exports = I18N;
