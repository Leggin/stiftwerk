/* ---------------- SVG import ---------------- */
function importSVG(text, name) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || !root || root.nodeName.toLowerCase() !== 'svg') throw new Error(t('import.err.invalid', { name }));
  const svg = document.importNode(root, true);
  const vb = svg.getAttribute('viewBox'), vbn = vb ? vb.trim().split(/[\s,]+/).map(parseFloat) : null;
  const bad = v => !v || /%\s*$/.test(v);
  if (vbn && vbn.length === 4) { if (bad(svg.getAttribute('width'))) svg.setAttribute('width', vbn[2]); if (bad(svg.getAttribute('height'))) svg.setAttribute('height', vbn[3]); }
  const skippedUse = expandUses(svg), images = svg.querySelectorAll('image').length;
  const host = $('#svgHost'); host.appendChild(svg);
  const paths = [], fills = [], texts = [], occ = [], textStyle = {}; const missing = new Set();
  try {
    const rr = svg.getBoundingClientRect(), k = 25.4 / 96;
    // paint order: later elements are drawn on top (hidden-line removal uses it)
    const order = new Map(); let oi = 0; for (const el of svg.querySelectorAll('*')) order.set(el, ++oi);
    const hidden = new Map();
    const isHidden = el => { for (let n = el; n && n !== svg; n = n.parentNode) { if (hidden.has(n)) { if (hidden.get(n)) return true; continue; } const h = getComputedStyle(n).display === 'none'; hidden.set(n, h); if (h) return true; } return false; };
    const layerOf = (el, stroke, fill) => {
      let sKey = stroke, fKey = fill, lname = null;
      if (S.layerMode === 'inkscape') {
        const g = [...ancestors(el)].find(n => n.getAttribute && (n.getAttribute('inkscape:groupmode') === 'layer' || n.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'groupmode') === 'layer'));
        if (g) { lname = g.getAttribute('inkscape:label') || g.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label') || g.getAttribute('id') || 'Ebene'; sKey = fKey = 'L:' + lname; }
      }
      return { sKey, fKey, lname };
    };
    const toMm = m => (x, y) => [(m.a * x + m.c * y + m.e - rr.left) * k, (m.b * x + m.d * y + m.f - rr.top) * k];
    const clipFor = clipRegions(svg, toMm);
    // <text>: kept as text (shown in its SVG font) until the user converts it to a plotter font – one style per <text> element
    for (const el of svg.querySelectorAll('text')) {
      if (el.closest('defs,clipPath,mask,symbol,marker,pattern') || isHidden(el)) continue;
      const cs = getComputedStyle(el); if (parseFloat(cs.opacity) === 0) continue;
      const stroke = cssToHex(cs.stroke, cs.strokeOpacity), fill = cssToHex(cs.fill, cs.fillOpacity), col = stroke || fill;
      if (!col) continue;
      const m = el.getScreenCTM(); if (!m) continue;
      const fsz = parseFloat(cs.fontSize) || 16, capH = fsz * 0.7, ls = parseFloat(cs.letterSpacing) || 0;
      const runs = textRuns(el, capH, ls / (capH / 10)); if (!runs.length) continue;
      const { sKey, fKey, lname } = layerOf(el, stroke, fill), key = stroke ? sKey : fKey;
      ensureLayer(key, col, lname);
      const ei = Object.keys(textStyle).length; // element index: the key of it.textStyle and run.el
      const bold = parseInt(cs.fontWeight, 10) >= 600 || /bold/i.test(cs.fontWeight), italic = /italic|oblique/i.test(cs.fontStyle);
      textStyle[ei] = Object.assign({ mode: 'svg', font: guessFont(cs.fontFamily, runs.map(r => r.str).join(' ')) }, bold ? { bold: true } : null, italic ? { italic: true } : null);
      const M = [m.a * k, m.b * k, m.c * k, m.d * k, (m.e - rr.left) * k, (m.f - rr.top) * k], z = order.get(el);
      for (const run of runs) {
        for (const ch of run.str) if (!SW.hasGlyph(ch) && ch !== ' ') missing.add(ch);
        texts.push({ str: run.str, x: run.x, y: run.y, M, fs: fsz, ls, anchor: cs.textAnchor, layer: key, color: col,
          family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle, paint: stroke ? 'stroke' : 'fill', el: ei, z });
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
      const T = toMm(m), z = order.get(el), clip = clipFor(el);
      const { sKey, fKey, lname } = layerOf(el, stroke, fill);
      // stroke-dasharray: dash lengths are in user units → convert to mm
      let dashes = null, dashOff = 0;
      if (stroke && cs.strokeDasharray && cs.strokeDasharray !== 'none') {
        const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * k;
        dashes = cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(isFinite).map(v => v * sc);
        dashOff = (parseFloat(cs.strokeDashoffset) || 0) * sc;
        if (!dashes.some(v => v > 0)) dashes = null;
      }
      const opaque = fill && (parseFloat(cs.fillOpacity) || 1) * (parseFloat(cs.opacity) || 1) >= 0.5, elRings = [];
      for (const sub of SW.parsePathD(d)) {
        const f = SW.flattenSub(sub, T);
        if (f.pts.length < 2) continue;
        const outlineKey = stroke ? sKey : fKey;
        ensureLayer(outlineKey, stroke || fill, lname);
        let parts = dashes ? SW.dash(f.pts, dashes, dashOff) : [f.pts];
        if (clip) parts = parts.flatMap(pts => SWGeo.clipPolyline(pts, clip, 'inside'));
        for (const part of parts) paths.push({ layer: outlineKey, pts: part, z });
        if (fill && f.closed) { ensureLayer(fKey, fill, lname); fills.push({ layer: fKey, rings: [f.pts] }); if (opaque) elRings.push(f.pts); }
      }
      if (elRings.length) occ.push({ z, rings: elRings });
    }
  } finally { host.removeChild(svg); }
  if (!paths.length && !texts.length) throw new Error(t('import.err.empty', { name }));
  // merge fill rings per layer so holes hatch correctly (even-odd)
  const fm = new Map(); for (const f of fills) { if (!fm.has(f.layer)) fm.set(f.layer, []); fm.get(f.layer).push(...f.rings); }
  const n = normalise(paths, [...fm].map(([layer, rings]) => ({ layer, rings })), texts, occ);
  const it = { id: SW.uid(), type: 'svg', name: name.replace(/\.svg$/i, ''), visible: true, scale: 1, rot: 0, x: n.x, y: n.y, src: n.src, hatch: { on: false, spacing: 1, angle: 45 },
    textStyle };
  // filled shapes over lines (e.g. a white-filled drawing over text): hide what lies beneath, like on screen
  const covers = occ.length && (paths.some(p => occ.some(o => o.z > p.z)) || texts.some(r => occ.some(o => o.z > r.z)));
  if (covers) it.occlude = true;
  const [w, h] = itemSize(it);
  if (it.x < -0.5 || it.y < -0.5 || it.x + w > page.w + 0.5 || it.y + h > page.h + 0.5) fitItem(it);
  // notes for the caller: [{ key, vars }] (keys import.*, translated with t(key, vars)); also kept on the item
  const notes = [], nText = Object.keys(textStyle).length;
  if (nText) notes.push({ key: nText === 1 ? 'import.texts_one' : 'import.texts_other', vars: { n: nText } });
  if (missing.size) notes.push({ key: 'import.noGlyph', vars: { chars: [...missing].slice(0, 8).join(' ') + (missing.size > 8 ? ' …' : '') } });
  if (covers) notes.push({ key: 'import.occluded', vars: {} });
  if (skippedUse) notes.push({ key: skippedUse === 1 ? 'import.use_one' : 'import.use_other', vars: { n: skippedUse } });
  if (images) notes.push({ key: images === 1 ? 'import.images_one' : 'import.images_other', vars: { n: images } });
  if (notes.length) it.notes = notes;
  return { it, notes };
}
/* <use href="#id"> → an inline copy (<g> with the use's transform and x/y), nested up to 6 levels. Returns how many stay unresolved. */
function expandUses(svg) {
  let unresolved = 0;
  for (let depth = 0; depth < 6; depth++) {
    const uses = [...svg.querySelectorAll('use')].filter(u => !u.closest('defs,clipPath,mask,pattern,marker'));
    if (!uses.length) break;
    for (const u of uses) {
      const href = u.getAttribute('href') || u.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      const ref = href.startsWith('#') ? svg.querySelector('#' + CSS.escape(href.slice(1))) : null;
      if (!ref || ref.contains(u)) { u.remove(); unresolved++; continue; }
      const g = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const a of [...u.attributes]) if (!/^(href|xlink:href|x|y|width|height|id)$/.test(a.name)) g.setAttribute(a.name, a.value);
      const x = parseFloat(u.getAttribute('x')) || 0, y = parseFloat(u.getAttribute('y')) || 0;
      g.setAttribute('transform', `${u.getAttribute('transform') || ''} translate(${x} ${y})`.trim());
      if (ref.tagName.toLowerCase() === 'symbol') for (const c of ref.childNodes) g.appendChild(c.cloneNode(true));
      else { const c = ref.cloneNode(true); c.removeAttribute('id'); g.appendChild(c); }
      u.replaceWith(g);
    }
  }
  return unresolved;
}
/* clip-path="url(#c)" on an element or an ancestor → the clip region (rings, mm) – shapes of the <clipPath>, in the user
 * space of the element that references it. Cached per referencing element. */
function clipRegions(svg, toMm) {
  const cache = new Map();
  const refOf = el => { for (let n = el; n && n !== svg; n = n.parentNode) { const v = n.getAttribute && (n.getAttribute('clip-path') || (n.style && n.style.clipPath)); if (v && /url\(/.test(v)) return [n, v]; } return null; };
  return el => {
    const r = refOf(el); if (!r) return null;
    const [owner, v] = r; if (cache.has(owner)) return cache.get(owner);
    const id = (/url\(\s*["']?#([^"')]+)/.exec(v) || [])[1], cp = id && svg.querySelector('#' + CSS.escape(id));
    let rings = null;
    const m = owner.getScreenCTM && owner.getScreenCTM();
    if (cp && m) {
      rings = [];
      for (const s of cp.querySelectorAll('path,rect,circle,ellipse,polygon,polyline')) {
        const d = SW.shapeToD(s.tagName.toLowerCase(), a => s.getAttribute(a)); if (!d) continue;
        const own = s.transform && s.transform.baseVal.consolidate(), M = own ? m.multiply(own.matrix) : m;
        for (const sub of SW.parsePathD(d)) { const f = SW.flattenSub(sub, toMm(M)); if (f.pts.length > 2) rings.push(f.pts); }
      }
      if (!rings.length) rings = null;
    }
    cache.set(owner, rings); return rings;
  };
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

