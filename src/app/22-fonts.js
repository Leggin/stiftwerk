/* ---------------- plotter fonts ---------------- */
const FONT_LIST = [['builtin', 'Stiftwerk Linear (eingebaut)'], ['HersheySans1', 'Hershey Sans · einstrichig'], ['HersheySansMed', 'Hershey Sans Medium'],
  ['HersheySerifMed', 'Hershey Serif Medium'], ['HersheySerifMedItalic', 'Hershey Serif Italic'], ['HersheyScript1', 'Hershey Script · einstrichig'],
  ['HersheyScriptMed', 'Hershey Script Medium'], ['HersheyGothEnglish', 'Hershey Gothic English'], ['EMSReadability', 'EMS Readability'],
  ['EMSCasualHand', 'EMS Casual Hand'], ['EMSAllure', 'EMS Allure'], ['EMSFelix', 'EMS Felix'], ['EMSTech', 'EMS Tech']];
const FONT_URLS = f => [`https://cdn.jsdelivr.net/gh/techninja/hersheytext@master/svg_fonts/${f}.svg`, `https://cdn.jsdelivr.net/npm/hersheytext/svg_fonts/${f}.svg`, `https://raw.githubusercontent.com/techninja/hersheytext/master/svg_fonts/${f}.svg`];
let customFonts = store.get('customFonts', {});
const fontCache = new Map(), fontPending = new Map();
function fontName(id) { if (!id || id === 'builtin') return 'Stiftwerk Linear'; const l = FONT_LIST.find(f => f[0] === id); return l ? l[1] : (customFonts[id] || 'Eigene Schrift'); }
function guessFont(family) {
  const f = (family || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (/hershey.*goth/.test(f)) return 'HersheyGothEnglish';
  if (/hershey.*script/.test(f)) return 'HersheyScript1';
  if (/hershey.*(serif|roman|duplex|triplex)/.test(f)) return 'HersheySerifMed';
  if (/hershey|simplex/.test(f)) return 'HersheySans1';
  return 'builtin';
}
function loadFont(id) {
  if (!id || id === 'builtin') return Promise.resolve(SW.BUILTIN);
  if (fontCache.has(id)) return Promise.resolve(fontCache.get(id));
  if (fontPending.has(id)) return fontPending.get(id);
  const p = (async () => {
    let txt = null; try { txt = localStorage.getItem('stiftwerk:fontsrc:' + id); } catch (e) { }
    if (!txt && id.startsWith('custom:')) throw new Error('Diese eigene Schrift ist in diesem Browser nicht mehr gespeichert. Bitte die SVG-Schrift erneut laden.');
    if (!txt) for (const u of FONT_URLS(id)) { try { const r = await fetch(u); if (r.ok) { const t = await r.text(); if (/<glyph/i.test(t)) { txt = t; break; } } } catch (e) { } }
    if (!txt) throw new Error(`„${fontName(id)}“ konnte nicht aus dem Netz geladen werden.`);
    const f = SW.parseSvgFont(txt, fontName(id)); f.id = id; fontCache.set(id, f);
    try { localStorage.setItem('stiftwerk:fontsrc:' + id, txt); } catch (e) { }
    return f;
  })();
  fontPending.set(id, p);
  p.then(() => { fontPending.delete(id); fontsChanged(id); }, () => fontPending.delete(id));
  return p;
}
function fontFor(id) { if (!id || id === 'builtin') return SW.BUILTIN; const f = fontCache.get(id); if (f) return f; loadFont(id).catch(() => { }); return SW.BUILTIN; }
function fontsChanged(id) { let hit = false; for (const it of items) if (it.font === id) { hit = true; if (it.type === 'text') it.src = textSource(it); } if (hit) { invalidate(true); renderProps(); } }
function fontSelect(cur) {
  const opts = FONT_LIST.concat(Object.entries(customFonts)).map(([v, l]) => `<option value="${esc(v)}" ${v === (cur || 'builtin') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<div class="field"><span>Plotter-Schrift<small>${fontPending.has(cur) ? 'wird geladen …' : 'Einstrich-Schrift für den Stift'}</small></span><div class="inp"><select id="pFont">${opts}<option value="__upload">Eigene SVG-Schrift laden …</option></select></div></div>`;
}
let fontTarget = null, fontTargetConvert = false;
function fontError(e, it) {
  showDialog(`<h3>Schrift nicht verfügbar</h3><p class="hint">${esc(e.message)}</p>
    <p class="hint">In der eingebetteten Ansicht darf die Seite keine Schriften nachladen – in der lokalen Datei in Chrome klappt es. Du kannst auch eine SVG-Schrift direkt laden: Inkscape bringt die Hershey-Schriften mit, im Programmordner unter <code>share/inkscape/extensions/svg_fonts</code>.</p>
    <div class="row"><button class="btn" id="feUp">SVG-Schrift laden</button><button class="btn" id="feBuiltin">Eingebaute nehmen</button><span class="fill"></span><button class="btn primary" data-close>Abbrechen</button></div>`);
  $('#feUp').onclick = () => { closeDialog(false); fontTarget = it; fontTargetConvert = it.type !== 'text'; $('#fontIn').click(); };
  $('#feBuiltin').onclick = () => { closeDialog(false); it.font = 'builtin'; if (it.type === 'text') { it.src = textSource(it); invalidate(true); renderProps(); } else convertTexts(it, true); };
}
async function applyFont(it, v) {
  if (v === '__upload') { fontTarget = it; fontTargetConvert = false; $('#fontIn').click(); renderProps(); return; }
  it.font = v; persist();
  if (it.type !== 'text' && it.textMode !== 'plot') { renderProps(); loadFont(v).catch(() => { }); return; }
  if (v !== 'builtin') { renderProps(); try { await loadFont(v); } catch (e) { fontError(e, it); return; } }
  if (it.type === 'text') it.src = textSource(it);
  invalidate(true); renderProps(); renderObjects();
}
async function convertTexts(it, on) {
  if (!on) { it.textMode = 'svg'; invalidate(true); renderProps(); return true; }
  if (it.font && it.font !== 'builtin') { toast(`Lade „${fontName(it.font)}“ …`); try { await loadFont(it.font); } catch (e) { fontError(e, it); return false; } }
  it.textMode = 'plot'; invalidate(true); renderProps(); toast('Texte in Plotter-Schrift umgewandelt'); return true;
}
