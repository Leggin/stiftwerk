/* Machine profiles for GRBL-family pen plotters (GRBL 1.1, FluidNC, grblHAL).
 * A profile is a flat JSON object with the same keys the app keeps in S (penUp, drawF, machW …) plus
 * penType ('z' | 'servo' | 'gcode') and a few capabilities. The active profile is merged into S, so all
 * consumers keep reading S.*; SW.penLines / SW.penTime (core.js) turn the pen keys into G-code and timing.
 * Pure – used by the app and by Node tests. */
const SWMachine = (() => {
  /* key: [type, default, min|enum, max] – type 'num' | 'int' | 'bool' | 'enum' | 'str' | 'code' */
  const FIELDS = {
    name: ['str', 'Plotter'], template: ['str', 'custom'], experimental: ['bool', false],
    machW: ['num', 210, 10, 3000], machH: ['num', 297, 10, 3000],
    invX: ['bool', false], invY: ['bool', true], swap: ['bool', false],
    penType: ['enum', 'z', ['z', 'servo', 'gcode']],
    penUp: ['num', 0.5, -50, 50], penDown: ['num', 5, -50, 50], zUpF: ['num', 20000, 10, 100000], zDownF: ['num', 5000, 10, 100000], zMax: ['num', 10, 0, 100],
    servoUp: ['num', 0, 0, 100000], servoDown: ['num', 255, 0, 100000], servoUpM5: ['bool', true],
    penUpCode: ['code', 'M5'], penDownCode: ['code', 'M3 S255'],
    penDwell: ['int', 150, 0, 5000], penDelay: ['int', 0, 0, 5000],
    drawF: ['num', 2000, 10, 100000], travelF: ['num', 8000, 10, 100000], jogMax: ['num', 6000, 10, 100000],
    baud: ['int', 115200, 1200, 3000000], stream: ['enum', 'count', ['count', 'ack']], rxBuf: ['int', 120, 16, 1024], bootWait: ['bool', true],
    canHome: ['bool', true], canSleep: ['bool', true], canUnlock: ['bool', true],
    startMode: ['enum', 'current', ['current', 'home', 'keep']], homeOffX: ['num', 0, -3000, 3000], homeOffY: ['num', 0, -3000, 3000],
    park: ['enum', 'origin', ['origin', 'stay']], sleepAfter: ['bool', true],
    headerCode: ['code', ''], footerCode: ['code', '']
  };
  const KEYS = Object.keys(FIELDS);
  const DEFAULTS = Object.fromEntries(KEYS.map(k => [k, FIELDS[k][1]]));
  /* built-in templates: only the iDraw 2.0 A4 is verified on real hardware */
  const T = (o) => Object.assign({}, DEFAULTS, o);
  const TEMPLATES = [
    T({ template: 'idraw2-a4', name: 'UUNA TEK iDraw 2.0 A4', family: 'drawcore', page: 'A4' }),
    T({ template: 'idraw2-a3', name: 'UUNA TEK iDraw 2.0 A3', family: 'drawcore', page: 'A3', machW: 297, machH: 420, experimental: true }),
    T({ template: 'grbl-z', name: 'GRBL · Stift an der Z-Achse', family: 'grbl', page: 'machine', experimental: true, machW: 300, machH: 200,
      penUp: 3, penDown: 0, zUpF: 3000, zDownF: 1500, drawF: 1500, travelF: 4000, jogMax: 3000, sleepAfter: false }),
    T({ template: 'grbl-servo', name: 'GRBL · Servo-Stift (M3/M5)', family: 'grbl', page: 'machine', experimental: true, machW: 300, machH: 200,
      penType: 'servo', servoUp: 0, servoDown: 255, servoUpM5: true, penDwell: 150, drawF: 1500, travelF: 4000, jogMax: 3000, sleepAfter: false }),
    T({ template: 'fluidnc-servo', name: 'FluidNC · Servo-Stift', family: 'fluidnc', page: 'machine', experimental: true, machW: 300, machH: 200,
      penType: 'servo', servoUp: 0, servoDown: 1000, servoUpM5: true, penDwell: 200, drawF: 1500, travelF: 4000, jogMax: 3000, sleepAfter: false }),
    T({ template: 'grblhal-z', name: 'grblHAL · Stift an der Z-Achse', family: 'grblhal', page: 'machine', experimental: true, machW: 300, machH: 200,
      penUp: 3, penDown: 0, zUpF: 3000, zDownF: 1500, drawF: 1500, travelF: 4000, jogMax: 3000, sleepAfter: false }),
    T({ template: 'custom', name: 'Eigener Plotter', family: 'grbl', page: 'machine', experimental: true, machW: 300, machH: 200,
      penUp: 3, penDown: 0, zUpF: 3000, zDownF: 1500, drawF: 1500, travelF: 4000, jogMax: 3000, sleepAfter: false })
  ];
  const template = id => TEMPLATES.find(t => t.template === id) || null;
  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* clamp, type-check and fill a profile (imports from files go through here) */
  function validate(p, base) {
    p = p && typeof p === 'object' ? p : {};
    const src = Object.assign({}, base || template(p.template) || DEFAULTS);
    const out = { id: typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : uid() };
    for (const k of KEYS) {
      const [type, def, a, b] = FIELDS[k], v = p[k] !== undefined ? p[k] : src[k] !== undefined ? src[k] : def;
      if (type === 'num' || type === 'int') { let n = Number(v); if (!isFinite(n)) n = Number(src[k] !== undefined ? src[k] : def); n = Math.min(b, Math.max(a, n)); out[k] = type === 'int' ? Math.round(n) : n; }
      else if (type === 'bool') out[k] = typeof v === 'boolean' ? v : v === 'true' || v === 1 ? true : v === 'false' || v === 0 ? false : !!def;
      else if (type === 'enum') out[k] = a.includes(v) ? v : (a.includes(src[k]) ? src[k] : def);
      else if (type === 'str') out[k] = String(v == null ? '' : v).slice(0, 80).trim() || String(src[k] || def);
      else out[k] = String(v == null ? '' : v).replace(/\r/g, '').slice(0, 2000);
    }
    if (!out.canHome && out.startMode === 'home') out.startMode = 'current';
    return out;
  }
  /* the user's current settings (from before profiles existed) → an iDraw 2.0 A4 profile with their tuned values */
  function fromLegacySettings(S) {
    const p = Object.assign({}, template('idraw2-a4'));
    for (const k of KEYS) if (S && S[k] !== undefined && !['name', 'template', 'experimental'].includes(k)) p[k] = S[k];
    return validate(p, template('idraw2-a4'));
  }
  /* new profile from a template */
  function fromTemplate(id, name) { const t = template(id) || template('custom'); return validate(Object.assign({}, t, { id: uid(), name: name || t.name })); }
  /* work area as seen from the sheet (after X/Y swap) */
  const workArea = S => (S.swap ? [S.machH, S.machW] : [S.machW, S.machH]);
  /* banner / $I text → { family, template } (null = not GRBL) */
  function detect(text) {
    const s = String(text || '');
    if (/DrawCore/i.test(s)) return { family: 'drawcore', template: 'idraw2-a4' };
    if (/FluidNC/i.test(s)) return { family: 'fluidnc', template: 'fluidnc-servo' };
    if (/grblHAL/i.test(s)) return { family: 'grblhal', template: 'grblhal-z' };
    if (/\bGrbl\b/i.test(s)) return { family: 'grbl', template: 'grbl-z' };
    return null;
  }
  const familyOf = p => { const t = template(p && p.template); return t ? t.family : 'grbl'; };
  /* "$130=297.000" lines of a $$ answer → { machW, machH, zMax, laser } (what is present) */
  function parseSettings(text) {
    const out = {}, get = n => { const m = new RegExp('^\\$' + n + '=([-\\d.]+)', 'm').exec(text || ''); return m ? parseFloat(m[1]) : null; };
    const w = get(130), h = get(131), z = get(132), laser = get(32);
    if (w > 0) out.machW = w; if (h > 0) out.machH = h; if (z > 0) out.zMax = z; if (laser != null) out.laser = laser === 1;
    return out;
  }
  /* the machine keys of S (to save back into the active profile) */
  const pick = S => Object.fromEntries(KEYS.filter(k => S[k] !== undefined).map(k => [k, S[k]]));
  return { FIELDS, KEYS, DEFAULTS, TEMPLATES, template, validate, fromLegacySettings, fromTemplate, workArea, detect, familyOf, parseSettings, pick, uid };
})();
if (typeof module !== 'undefined') module.exports = SWMachine;
