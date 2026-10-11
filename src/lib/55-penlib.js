/* Pen library, pure: the user's real pens, kept across documents (localStorage stiftwerk:penlib).
 * entry = { id, name, color, width (line width in mm, preview), drawF, penDown, servoDown, penDelay, note }
 * drawF / penDown / servoDown / penDelay may be null = "as the plotter profile says". A pen of the document
 * (doc.pens[i] or doc.single) links to an entry with .lib = entry id; plotting that pen uses the entry's values. */
const SWPenLib = (() => {
  const LIMITS = { width: [0.05, 5], drawF: [50, 30000], penDown: [-100, 100], servoDown: [0, 100000], penDelay: [0, 10000] };
  const HEX = /^#[0-9a-f]{6}$/i;
  const uid = () => 'lp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const opt = (v, [lo, hi]) => { if (v === '' || v == null) return null; v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };
  function validate(e) {
    e = e && typeof e === 'object' ? e : {};
    let color = String(e.color || '').trim(); if (/^#[0-9a-f]{3}$/i.test(color)) color = '#' + [...color.slice(1)].map(c => c + c).join('');
    return {
      id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : uid(),
      name: String(e.name || '').trim().slice(0, 60),
      color: HEX.test(color) ? color.toLowerCase() : '#2e2e2c',
      width: opt(e.width, LIMITS.width) || 0.4,
      drawF: opt(e.drawF, LIMITS.drawF), penDown: opt(e.penDown, LIMITS.penDown), servoDown: opt(e.servoDown, LIMITS.servoDown), penDelay: opt(e.penDelay, LIMITS.penDelay),
      note: String(e.note || '').slice(0, 200)
    };
  }
  /* the settings a library pen changes for the active plotter (Z depth only for Z pens, servo value only for servos) */
  function overrides(e, S) {
    if (!e) return null;
    const o = {}, type = (S && S.penType) || 'z';
    if (e.drawF != null) o.drawF = e.drawF;
    if (e.penDelay != null) o.penDelay = e.penDelay;
    if (type === 'z' && e.penDown != null) o.penDown = e.penDown;
    if (type === 'servo' && e.servoDown != null) o.servoDown = e.servoDown;
    return Object.keys(o).length ? o : null;
  }
  /* S for plotting with this pen */
  const withPen = (S, e) => { const o = overrides(e, S); return o ? Object.assign({}, S, o) : S; };
  /* list from storage: drop broken entries, unique ids */
  function load(raw) {
    const arr = Array.isArray(raw) ? raw : [], seen = new Set(), out = [];
    for (const r of arr) { const e = validate(r); if (seen.has(e.id)) e.id = uid(); seen.add(e.id); out.push(e); }
    return out;
  }
  const byId = (lib, id) => (id && lib.find(e => e.id === id)) || null;
  /* a new entry from a document pen */
  const fromPen = (pen, name) => validate({ name: name || pen.name || '', color: pen.color });
  return { LIMITS, validate, overrides, withPen, load, byId, fromPen, uid };
})();
if (typeof module !== 'undefined') module.exports = SWPenLib;
