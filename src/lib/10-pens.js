/* Pens: physical pens vs. design colours.
 *  layerMeta[key] = { name|null, color, enabled, order, pen }   – a colour (or Inkscape layer) found in the design
 *  doc = { v:2, penMode:'single'|'multi', single:{name|null, color}, pens:[{id, name|null, color, manual?}], nextPen }
 * Multi mode: every colour is assigned to a pen; several colours may share one. Single mode: everything goes to the
 * virtual pen doc.single (assignments are kept, so switching back loses nothing). Disabled colours are never plotted.
 * Functions mutate the doc/layerMeta they are given (the app snapshots both for undo). */
const SWPens = ((C) => {
  const SINGLE = 'single';
  function defaultDoc() { return { v: 2, penMode: 'single', single: { name: null, color: '#2e2e2c' }, pens: [], nextPen: 1 }; }
  const penById = (doc, id) => doc.pens.find(p => p.id === id) || null;
  function newPen(doc, color, name = null, manual = false) {
    const p = { id: 'p' + doc.nextPen++, name: name || null, color };
    if (manual) p.manual = true;
    doc.pens.push(p); return p;
  }
  const byOrder = layerMeta => (a, b) => ((layerMeta[a] && layerMeta[a].order) || 0) - ((layerMeta[b] && layerMeta[b].order) || 0);

  /* give every colour without a valid pen one: grouped with similar new colours (heaviest = anchor) and joined to an
   * existing pen of similar colour, else a new pen. entries [{key, weight}] → [{key, pen, joined}] (joined = shares a
   * pen with a different colour; used for the "2 ähnliche Farben → Schwarz" import note) */
  function assignNew(doc, layerMeta, entries) {
    const fresh = entries.filter(e => layerMeta[e.key] && !penById(doc, layerMeta[e.key].pen));
    if (!fresh.length) return [];
    const { of, anchors } = C.group(fresh.map(e => ({ key: e.key, color: layerMeta[e.key].color, weight: e.weight || 0 })));
    const anchorPen = new Map(), out = [];
    for (const a of anchors) {
      const p = doc.pens.find(x => C.similar(x.color, a.color)) || newPen(doc, a.color, layerMeta[a.key].name);
      anchorPen.set(a.key, p);
    }
    for (const e of fresh) {
      const p = anchorPen.get(of.get(e.key)); layerMeta[e.key].pen = p.id;
      out.push({ key: e.key, pen: p.id, joined: p.color.toLowerCase() !== String(layerMeta[e.key].color).toLowerCase() });
    }
    return out;
  }

  const penColorFor = (doc, layerMeta, key) => {
    if (doc.penMode === SINGLE) return doc.single.color;
    const m = layerMeta[key]; const p = m && penById(doc, m.pen);
    return p ? p.color : (m ? m.color : '#2e2e2c');
  };

  /* what gets plotted, in which order: groups = one per pen (pen order), each with its enabled colour keys;
   * ghosts = disabled colours (preview only). usedKeys: colour keys that actually have geometry. */
  function plan(doc, layerMeta, usedKeys) {
    const keys = [...usedKeys].filter(k => layerMeta[k]).sort(byOrder(layerMeta));
    const on = keys.filter(k => layerMeta[k].enabled !== false), off = keys.filter(k => layerMeta[k].enabled === false);
    let groups;
    if (doc.penMode === SINGLE) groups = on.length ? [{ id: SINGLE, name: doc.single.name, color: doc.single.color, keys: on, single: true }] : [];
    else {
      groups = doc.pens.map(p => ({ id: p.id, name: p.name, color: p.color, keys: on.filter(k => layerMeta[k].pen === p.id) })).filter(g => g.keys.length);
      const orphan = on.filter(k => !penById(doc, layerMeta[k].pen));
      for (const k of orphan) groups.push({ id: 'orphan:' + k, name: layerMeta[k].name, color: layerMeta[k].color, keys: [k] });
    }
    const ghosts = off.map(k => ({ key: k, name: layerMeta[k].name, color: penColorFor(doc, layerMeta, k) }));
    return { groups, ghosts };
  }

  function setMode(doc, mode) { doc.penMode = mode === SINGLE ? SINGLE : 'multi'; }
  function assign(layerMeta, key, penId) { if (layerMeta[key]) layerMeta[key].pen = penId; }
  function movePen(doc, id, delta) {
    const i = doc.pens.findIndex(p => p.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= doc.pens.length) return false;
    const [p] = doc.pens.splice(i, 1); doc.pens.splice(j, 0, p); return true;
  }
  /* remove a pen; its colours move to `intoId` (or the first other pen, or a fresh pen) */
  function removePen(doc, layerMeta, id, intoId) {
    const rest = doc.pens.filter(p => p.id !== id); if (rest.length === doc.pens.length) return false;
    const members = Object.keys(layerMeta).filter(k => layerMeta[k].pen === id);
    let into = intoId && penById(doc, intoId);
    doc.pens = rest;
    if (members.length && !into) into = rest[0] || newPen(doc, layerMeta[members[0]].color);
    for (const k of members) layerMeta[k].pen = into.id;
    return true;
  }
  function mergePens(doc, layerMeta, keepId, dropId) { return removePen(doc, layerMeta, dropId, keepId); }
  /* pens whose colours are so close that they are probably the same physical pen (both in use) */
  function suggestions(doc, layerMeta, usedKeys) {
    const used = new Set([...usedKeys].filter(k => layerMeta[k]).map(k => layerMeta[k].pen));
    const ps = doc.pens.filter(p => used.has(p.id)), out = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (C.similar(ps[i].color, ps[j].color)) out.push([ps[i].id, ps[j].id]);
    return out;
  }
  /* pens that should be listed: assigned to a used colour, or created by hand */
  function visiblePens(doc, layerMeta, usedKeys) {
    const used = new Set([...usedKeys].filter(k => layerMeta[k]).map(k => layerMeta[k].pen));
    return doc.pens.filter(p => used.has(p.id) || p.manual);
  }
  return { SINGLE, defaultDoc, newPen, penById, assignNew, penColorFor, plan, setMode, assign, movePen, removePen, mergePens, suggestions, visiblePens };
})(typeof module !== 'undefined' ? require('./00-color.js') : SWColor);
if (typeof module !== 'undefined') module.exports = SWPens;
