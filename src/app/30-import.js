/* ---------------- SVG import ---------------- */
function importSVG(text, name) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || !root || root.nodeName.toLowerCase() !== 'svg') throw new Error(`„${name}“ ist keine gültige SVG-Datei.`);
  const svg = document.importNode(root, true);
  const vb = svg.getAttribute('viewBox'), vbn = vb ? vb.trim().split(/[\s,]+/).map(parseFloat) : null;
  const bad = v => !v || /%\s*$/.test(v);
  if (vbn && vbn.length === 4) { if (bad(svg.getAttribute('width'))) svg.setAttribute('width', vbn[2]); if (bad(svg.getAttribute('height'))) svg.setAttribute('height', vbn[3]); }
  const host = $('#svgHost'); host.appendChild(svg);
  const paths = [], fills = [], texts = [], textStyle = {}; let skippedUse = 0; const missing = new Set();
  try {
    const rr = svg.getBoundingClientRect(), k = 25.4 / 96;
    const hidden = new Map();
    const isHidden = el => { for (let n = el; n && n !== svg; n = n.parentNode) { if (hidden.has(n)) { if (hidden.get(n)) return true; continue; } const h = getComputedStyle(n).display === 'none'; hidden.set(n, h); if (h) return true; } return false; };
    skippedUse = svg.querySelectorAll('use').length;
    const layerOf = (el, stroke, fill) => {
      let sKey = stroke, fKey = fill, lname = null;
      if (S.layerMode === 'inkscape') {
        const g = [...ancestors(el)].find(n => n.getAttribute && (n.getAttribute('inkscape:groupmode') === 'layer' || n.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'groupmode') === 'layer'));
        if (g) { lname = g.getAttribute('inkscape:label') || g.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label') || g.getAttribute('id') || 'Ebene'; sKey = fKey = 'L:' + lname; }
      }
      return { sKey, fKey, lname };
    };
    // <text>: kept as text (shown in its SVG font) until the user converts it to a plotter font
    for (const el of svg.querySelectorAll('text')) {
      if (el.closest('defs,clipPath,mask,symbol,marker,pattern') || isHidden(el)) continue;
      const cs = getComputedStyle(el); if (parseFloat(cs.opacity) === 0) continue;
      const stroke = cssToHex(cs.stroke, cs.strokeOpacity), fill = cssToHex(cs.fill, cs.fillOpacity), col = stroke || fill;
      if (!col) continue;
      const m = el.getScreenCTM(); if (!m) continue;
      const fsz = parseFloat(cs.fontSize) || 16, capH = fsz * 0.7, ls = parseFloat(cs.letterSpacing) || 0;
      const { sKey, fKey, lname } = layerOf(el, stroke, fill), key = stroke ? sKey : fKey;
      ensureLayer(key, col, lname);
      const el = Object.keys(textStyle).length; textStyle[el] = { mode: 'svg', font: guessFont(cs.fontFamily) };
      const M = [m.a * k, m.b * k, m.c * k, m.d * k, (m.e - rr.left) * k, (m.f - rr.top) * k];
      for (const run of textRuns(el, capH, ls / (capH / 10))) {
        for (const ch of run.str) if (!SW.hasGlyph(ch) && ch !== ' ') missing.add(ch);
        texts.push({ str: run.str, x: run.x, y: run.y, M, fs: fsz, ls, anchor: cs.textAnchor, layer: key, color: col,
          family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle, paint: stroke ? 'stroke' : 'fill', el });
      }
    }
    for (const el of svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')) {
      if (el.closest('defs,clipPath,mask,symbol,marker,pattern') || isHidden(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) === 0) continue;
      const tag = el.tagName.toLowerCase();
      const stroke = cssToHex(cs.stroke, cs.strokeOpacity);
      const fill = (tag === 'line') ? null : cssToHex(cs.fill, cs.fillOpacity);
      if (!stroke && !fill) continue;
      const d = SW.shapeToD(tag, a => el.getAttribute(a)); if (!d) continue;
      const m = el.getScreenCTM(); if (!m) continue;
      const T = (x, y) => [(m.a * x + m.c * y + m.e - rr.left) * k, (m.b * x + m.d * y + m.f - rr.top) * k];
      const { sKey, fKey, lname } = layerOf(el, stroke, fill);
      // stroke-dasharray: dash lengths are in user units → convert to mm
      let dashes = null, dashOff = 0;
      if (stroke && cs.strokeDasharray && cs.strokeDasharray !== 'none') {
        const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * k;
        dashes = cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(isFinite).map(v => v * sc);
        dashOff = (parseFloat(cs.strokeDashoffset) || 0) * sc;
        if (!dashes.some(v => v > 0)) dashes = null;
      }
      for (const sub of SW.parsePathD(d)) {
        const f = SW.flattenSub(sub, T);
        if (f.pts.length < 2) continue;
        const outlineKey = stroke ? sKey : fKey;
        ensureLayer(outlineKey, stroke || fill, lname);
        if (dashes) for (const part of SW.dash(f.pts, dashes, dashOff)) paths.push({ layer: outlineKey, pts: part });
        else paths.push({ layer: outlineKey, pts: f.pts });
        if (fill && f.closed) { ensureLayer(fKey, fill, lname); fills.push({ layer: fKey, rings: [f.pts] }); }
      }
    }
  } finally { host.removeChild(svg); }
  if (!paths.length && !texts.length) throw new Error(`In „${name}“ wurden keine zeichenbaren Linien oder Texte gefunden.`);
  // merge fill rings per layer so holes hatch correctly (even-odd)
  const fm = new Map(); for (const f of fills) { if (!fm.has(f.layer)) fm.set(f.layer, []); fm.get(f.layer).push(...f.rings); }
  const n = normalise(paths, [...fm].map(([layer, rings]) => ({ layer, rings })), texts);
  const it = { id: SW.uid(), type: 'svg', name: name.replace(/\.svg$/i, ''), visible: true, scale: 1, rot: 0, x: n.x, y: n.y, src: n.src, hatch: { on: false, spacing: 1, angle: 45 },
    textStyle };
  const [w, h] = itemSize(it);
  if (it.x < -0.5 || it.y < -0.5 || it.x + w > page.w + 0.5 || it.y + h > page.h + 0.5) fitItem(it);
  const notes = [];
  if (texts.length) notes.push(`${texts.length} Text${texts.length === 1 ? '' : 'e'} in SVG-Schrift – unter „Anordnen“ umwandeln`);
  if (missing.size) notes.push(`ohne Plotter-Glyphe: ${[...missing].slice(0, 8).join(' ')}`);
  if (skippedUse) notes.push(`${skippedUse} <use>-Verweis(e) übersprungen`);
  return { it, notes };
}
/* text content as positioned runs; tspans with their own x/y start a new run */
function textRuns(el, capH, tracking) {
  const first = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).trim().split(/[\s,]+/)[0]); return isFinite(n) ? n : null; };
  const runs = []; let cur = { x: (first(el.getAttribute('x')) || 0) + (first(el.getAttribute('dx')) || 0), y: (first(el.getAttribute('y')) || 0) + (first(el.getAttribute('dy')) || 0), str: '' };
  const flush = () => { if (cur.str.trim()) runs.push(cur); };
  const walk = node => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) cur.str += n.textContent;
      else if (n.nodeType === 1 && /^(tspan|a)$/i.test(n.tagName)) {
        const tx = first(n.getAttribute('x')), ty = first(n.getAttribute('y')), dx = first(n.getAttribute('dx')), dy = first(n.getAttribute('dy'));
        if (tx != null || ty != null || dx || dy) {
          const endX = cur.x + SW.textWidth(cur.str.replace(/\s+/g, ' '), capH, tracking) + (cur.str ? (1.6 + tracking) * capH / 10 : 0);
          flush(); cur = { x: (tx != null ? tx : endX) + (dx || 0), y: (ty != null ? ty : cur.y) + (dy || 0), str: '' };
        }
        walk(n);
      }
    }
  };
  walk(el); flush();
  const xmlSpace = el.getAttribute('xml:space') === 'preserve';
  return runs.map((r, i) => ({ ...r, str: xmlSpace ? r.str.replace(/[\r\n\t]/g, ' ') : (i === 0 ? r.str.replace(/^\s+/, '') : r.str).replace(/\s+/g, ' ').replace(i === runs.length - 1 ? /\s+$/ : /$^/, '') }));
}
function* ancestors(el) { for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) yield n; }
function fitItem(it) {
  const m = page.margin, aw = page.w - 2 * m, ah = page.h - 2 * m; if (aw <= 0 || ah <= 0) return;
  const [w, h] = itemSize(it); if (!w && !h) return;
  const f = Math.min(w ? aw / w : Infinity, h ? ah / h : Infinity);
  if (it.type === 'text') { it.text.size *= f; it.src = textSource(it); } else it.scale *= f;
  centerItem(it);
}
function centerItem(it) { const [w, h] = itemSize(it); it.x = (page.w - w) / 2; it.y = (page.h - h) / 2; }

