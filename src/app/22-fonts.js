/* ---------------- plotter fonts ----------------
 * Font sources (SVG fonts, ~40 KB each) live in IndexedDB (db "stiftwerk", store "fonts"); old localStorage entries
 * (stiftwerk:fontsrc:<id>) are migrated on first use, and localStorage stays the fallback when IndexedDB is unavailable. */
const FONT_IDS = ['builtin', 'HersheySans1', 'HersheySansMed', 'HersheySerifMed', 'HersheySerifMedItalic', 'HersheySerifBold', 'HersheyScript1', 'HersheyScriptMed',
  'HersheyGothEnglish', 'EMSReadability', 'EMSElfin', 'EMSAllure', 'EMSFelix', 'EMSTech'];
/* [id, label] – labels follow the language (refreshed on every render) */
const FONT_LIST = FONT_IDS.map(id => [id, '']);
function fontLabels() { for (const p of FONT_LIST) p[1] = p[0] === 'builtin' ? t('fonts.name.builtin') + ' ' + t('fonts.tag.builtin') : t('fonts.name.' + p[0]); }
fontLabels(); SWUI.onRender(fontLabels);
/* the npm package is the one that works; the other two are fallbacks (the gh/ path and raw.githubusercontent.com 404 today) */
const FONT_URLS = f => [`https://cdn.jsdelivr.net/npm/hersheytext/svg_fonts/${f}.svg`, `https://cdn.jsdelivr.net/gh/techninja/hersheytext@master/svg_fonts/${f}.svg`, `https://raw.githubusercontent.com/techninja/hersheytext/master/svg_fonts/${f}.svg`];
let customFonts = store.get('customFonts', {});
const fontCache = new Map(), fontPending = new Map();
function fontName(id) {
  if (!id || id === 'builtin') return t('fonts.name.builtin');
  return FONT_IDS.includes(id) ? t('fonts.name.' + id) : (customFonts[id] || t('fonts.name.custom'));
}
/* which plotter font would match the SVG font family best (a first guess; the user can change it per text) */
function guessFont(family, str) {
  const f = (family || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(str || '')) return 'builtin'; // Hangul: only the built-in font can draw it
  if (/hershey.*goth/.test(f)) return 'HersheyGothEnglish';
  if (/hershey.*script/.test(f)) return 'HersheyScript1';
  if (/hershey.*(serif|roman|duplex|triplex)/.test(f)) return 'HersheySerifMed';
  if (/hershey|simplex/.test(f)) return 'HersheySans1';
  if (/script|cursive|handwrit|brush|calligraph|lobster|pacifico|dancing|marker/.test(f)) return 'HersheyScript1';
  if (/^serif$|times|georgia|garamond|palatino|bookman|cambria|baskerville|didot|merriweather|playfair/.test(f)) return 'HersheySerifMed';
  return 'builtin';
}

/* ---- font sources: IndexedDB with localStorage fallback ---- */
const fontDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    let r; try { r = indexedDB.open('stiftwerk', 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('fonts')) r.result.createObjectStore('fonts'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('indexedDB')); r.onblocked = () => rej(new Error('indexedDB blocked'));
  }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const tr = db.transaction('fonts', mode), rq = fn(tr.objectStore('fonts'));
    tr.oncomplete = () => res(rq && rq.result); tr.onerror = tr.onabort = () => rej(tr.error || new Error('indexedDB'));
  }));
  return { get: id => run('readonly', s => s.get(id)), put: (id, txt) => run('readwrite', s => s.put(txt, id)), del: id => run('readwrite', s => s.delete(id)) };
})();
const FONT_LS = 'stiftwerk:fontsrc:';
const fontLsGet = id => { try { return localStorage.getItem(FONT_LS + id); } catch (e) { return null; } };
/* → 'idb' | 'ls' | null (where the source ended up) */
async function fontSrcPut(id, txt) {
  try { await fontDB.put(id, txt); try { localStorage.removeItem(FONT_LS + id); } catch (e) { } return 'idb'; }
  catch (e) { try { localStorage.setItem(FONT_LS + id, txt); return 'ls'; } catch (e2) { return null; } }
}
async function fontSrcGet(id) {
  let txt = null; try { txt = await fontDB.get(id); } catch (e) { }
  if (txt) return txt;
  txt = fontLsGet(id);
  if (txt) fontSrcPut(id, txt).catch(() => { }); // migrate on first use
  return txt;
}
function fontSrcDrop(id) { fontDB.del(id).catch(() => { }); try { localStorage.removeItem(FONT_LS + id); } catch (e) { } }
/* move every legacy localStorage source (also the ones a font upload just wrote there) to IndexedDB */
async function fontSrcSweep() {
  const ids = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(FONT_LS)) ids.push(k.slice(FONT_LS.length)); } } catch (e) { }
  for (const id of ids) { const txt = fontLsGet(id); if (txt && await fontSrcPut(id, txt) === 'ls') break; }
}
setTimeout(fontSrcSweep, 1500);
/* the upload handler (90-files.js) still writes to localStorage: sweep a few times after a font file was picked */
$('#fontIn').addEventListener('change', () => { let n = 0; const iv = setInterval(() => { fontSrcSweep(); if (++n >= 12) clearInterval(iv); }, 400); });

function loadFont(id) {
  if (!id || id === 'builtin') return Promise.resolve(SW.BUILTIN);
  if (fontCache.has(id)) return Promise.resolve(fontCache.get(id));
  if (fontPending.has(id)) return fontPending.get(id);
  const p = (async () => {
    let f = null; const txt0 = await fontSrcGet(id);
    if (txt0) { try { f = SW.parseSvgFont(txt0, fontName(id)); } catch (e) { fontSrcDrop(id); } } // a damaged cache entry is dropped, then we try the network
    if (!f) {
      if (id.startsWith('custom:')) throw new Error(t('fonts.err.gone'));
      let txt = null;
      for (const u of FONT_URLS(id)) { try { const r = await fetch(u); if (r.ok) { const x = await r.text(); if (/<glyph/i.test(x)) { txt = x; break; } } } catch (e) { } }
      if (!txt) throw new Error(t('fonts.err.net', { font: fontName(id) }));
      f = SW.parseSvgFont(txt, fontName(id));
      fontSrcPut(id, txt).catch(() => { });
    }
    f.id = id; fontCache.set(id, f);
    return f;
  })();
  fontPending.set(id, p);
  p.then(() => { fontPending.delete(id); fontsChanged(id); }, () => fontPending.delete(id));
  return p;
}
function fontFor(id) { if (!id || id === 'builtin') return SW.BUILTIN; const f = fontCache.get(id); if (f) return f; loadFont(id).catch(() => { }); return SW.BUILTIN; }
/* a font finished loading: texts that use it change shape */
function fontsChanged(id) {
  SWUI.emit('fonts', id);
  let hit = false;
  for (const it of items) {
    if (it.type === 'text') { if ((it.font || 'builtin') === id) { hit = true; it.src = textSource(it); } }
    else if (it.textStyle && itemFontIds(it).includes(id)) hit = true;
  }
  if (hit) { invalidate(true, { sys: true }); const sel = items.find(i => i.id === selId); if (!(sel && sel.type === 'svg' && txRefresh())) renderProps(); }
}
/* simple select for a Text item (the SVG texts have their own picker, see 26-text-ui.js) */
function fontSelect(cur) {
  const opts = FONT_LIST.concat(Object.entries(customFonts)).map(([v, l]) => `<option value="${esc(v)}" ${v === (cur || 'builtin') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<div class="field"><span>${tHtml('fonts.select.label')}<small>${fontPending.has(cur) ? tHtml('fonts.select.loading') : tHtml('fonts.select.hint')}</small></span><div class="inp"><select id="pFont" aria-label="${tHtml('fonts.select.label')}">${opts}<option value="__upload">${tHtml('fonts.select.upload')}</option></select></div></div>`;
}
/* font upload target: { it, els } – els = text elements of an SVG item (null = all / a Text item) */
let fontTarget = null, fontTargetConvert = false;
const allEls = it => textEls(it).map(e => e.el);
function fontError(e, it, els, convert) {
  showDialog(`<h3>${tHtml('fonts.err.title')}</h3><p class="hint">${esc(e.message)}</p>
    <p class="hint">${tHtml('fonts.err.embedHint')}</p>
    <div class="row"><button class="btn" id="feUp">${tHtml('fonts.err.upload')}</button><button class="btn" id="feBuiltin">${tHtml('fonts.err.builtin')}</button><span class="fill"></span><button class="btn primary" data-close>${tHtml('common.cancel')}</button></div>`);
  $('#feUp').onclick = () => { closeDialog(false); fontTarget = { it, els }; fontTargetConvert = !!convert || it.type !== 'text'; $('#fontIn').click(); };
  $('#feBuiltin').onclick = () => { closeDialog(false); applyFont(it, 'builtin', els, !!convert || it.type !== 'text'); };
  fontViewRefresh(it);
}
/* re-draw whatever shows the font of this item (after a failed or finished change) */
function fontViewRefresh(it) { const cur = items.find(i => i.id === (it && it.id)); if (cur && cur.type === 'svg' && txRefresh()) { renderObjects(); return; } renderProps(); renderObjects(); }
/* Text item: its font. SVG item: the font of the given <text> elements (default: all of them); convert = also switch them to the plotter font.
 * The font is loaded first, so the change itself is one single undo step. Resolves to true when applied. */
async function applyFont(it, v, els, convert) {
  if (v === '__upload') { fontTarget = { it, els }; fontTargetConvert = !!convert; $('#fontIn').click(); fontViewRefresh(it); return false; }
  const id = it.id;
  if (v !== 'builtin') {
    if (!fontCache.has(v)) toast(t('texts.toast.loading', { font: fontName(v) }));
    try { await loadFont(v); } catch (e) { fontError(e, it, els, convert); return false; }
  }
  const cur = items.find(i => i.id === id); if (!cur) return false;
  if (cur.type === 'text') { cur.font = v; cur.src = textSource(cur); }
  else setTextStyle(cur, els || allEls(cur), convert ? { font: v, mode: 'plot' } : { font: v });
  invalidate(true); fontViewRefresh(cur);
  return true;
}
/* switch <text> elements of an SVG item between their SVG font ('svg') and their plotter font ('plot') */
async function convertTexts(it, on, els) {
  els = els || allEls(it); const id = it.id;
  if (!on) { setTextStyle(it, els, { mode: 'svg' }); invalidate(true); fontViewRefresh(it); return true; }
  for (const f of new Set(els.map(el => textStyleOf(it, el).font).filter(f => f && f !== 'builtin'))) {
    if (!fontCache.has(f)) toast(t('texts.toast.loading', { font: fontName(f) }));
    try { await loadFont(f); } catch (e) { fontError(e, it, els, true); return false; }
  }
  const cur = items.find(i => i.id === id); if (!cur) return false;
  setTextStyle(cur, els, { mode: 'plot' }); invalidate(true); fontViewRefresh(cur); toast(t('texts.toast.converted')); return true;
}
/* back to how the file came: original SVG font, font suggestion as at import */
function resetTexts(it, els) {
  els = els || allEls(it); const info = new Map(textEls(it).map(e => [e.el, e]));
  for (const el of els) {
    const run = (it.src.texts || []).find(r => r.el === el), e = info.get(el);
    setTextStyle(it, [el], { mode: 'svg', font: guessFont(run && run.family, e && e.str) });
  }
  invalidate(true); fontViewRefresh(it);
}
