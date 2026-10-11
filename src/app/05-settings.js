/* ---------------- settings & machine profiles ----------------
 * S = plot preferences (optimizer, preview) + the ACTIVE MACHINE PROFILE (lib/05-machine.js: work area, axes, pen,
 * speeds, connection, capabilities, start/end). Profiles are kept in `machines` ({ list, active }, localStorage
 * 'stiftwerk:machines'); saveS() writes machine keys back into the active profile, the rest into 'stiftwerk:settings'. */
const PLOT_DEFAULTS = { penWidth: 0.4, optimize: true, reverse: true, joinTol: 0.1, simplify: 0.02, showTravel: false, layerMode: 'color' };
const PLOT_KEYS = Object.keys(PLOT_DEFAULTS);
const legacySettings = store.get('settings', null);
let machines = store.get('machines', null);
/* first run of the profile system: existing users keep their iDraw (with their tuned values), new users pick a plotter */
let machineFresh = false, machineMigrated = false;
if (!machines || !Array.isArray(machines.list) || !machines.list.length) {
  let hadData = false; try { hadData = !!localStorage.getItem('stiftwerk:items'); } catch (e) { }
  const p = legacySettings || hadData ? SWMachine.fromLegacySettings(legacySettings || {}) : SWMachine.fromTemplate('idraw2-a4');
  machines = { list: [p], active: p.id };
  if (legacySettings || hadData) machineMigrated = true; else machineFresh = true;
  store.set('machines', machines);
}
machines.list = machines.list.map(p => SWMachine.validate(p));
const activeMachine = () => machines.list.find(p => p.id === machines.active) || machines.list[0];
/* defaults the "Standardwerte" button resets to: the template of the active profile + plot defaults */
let DEFAULTS = Object.assign({}, PLOT_DEFAULTS, SWMachine.template(activeMachine().template) || SWMachine.DEFAULTS);
let S = Object.assign({}, PLOT_DEFAULTS, Object.fromEntries(PLOT_KEYS.filter(k => legacySettings && legacySettings[k] !== undefined).map(k => [k, legacySettings[k]])), activeMachine());
const saveS = () => {
  store.set('settings', Object.fromEntries(PLOT_KEYS.map(k => [k, S[k]])));
  const p = activeMachine(); for (const k of SWMachine.KEYS) if (S[k] !== undefined) p[k] = S[k];
  store.set('machines', machines);
};
/* the area the plotter can reach, as seen from the sheet (after an X/Y swap) */
const workArea = () => SWMachine.workArea(S);
const isZPen = () => (S.penType || 'z') === 'z';
/* Machine settings, rendered by 66-settings-ui.js in friendly groups.
 * Field: { k, label, type: 'num'|'bool'|'sel'|'code', unit?, hint?, step?, min?, max?, opts?: [[value, labelKey]], when?: S → bool }
 * where: 'conn' = shown under "Erweitert" in the connection card, otherwise in the settings card.
 * "Standardwerte" resets these keys to the profile's template. */
const SETTINGS = [
  { id: 'pen', title: 'settings.group.pen', fields: [
    { k: 'penType', label: 'settings.penType.label', type: 'sel', hint: 'settings.penType.hint', opts: [['z', 'settings.penType.z'], ['servo', 'settings.penType.servo'], ['gcode', 'settings.penType.gcode']] },
    { k: 'penUp', label: 'settings.penUp.label', type: 'num', unit: 'unit.mm', hint: 'settings.penUp.hint', step: 0.1, min: -50, max: 50, when: s => s.penType === 'z' },
    { k: 'penDown', label: 'settings.penDown.label', type: 'num', unit: 'unit.mm', hint: 'settings.penDown.hint', step: 0.1, min: -50, max: 50, when: s => s.penType === 'z' },
    { k: 'zUpF', label: 'settings.zUpF.label', type: 'num', unit: 'unit.mmmin', step: 500, min: 10, max: 100000, when: s => s.penType === 'z' },
    { k: 'zDownF', label: 'settings.zDownF.label', type: 'num', unit: 'unit.mmmin', hint: 'settings.zDownF.hint', step: 500, min: 10, max: 100000, when: s => s.penType === 'z' },
    { k: 'servoDown', label: 'settings.servoDown.label', type: 'num', hint: 'settings.servoDown.hint', step: 1, min: 0, max: 100000, when: s => s.penType === 'servo' },
    { k: 'servoUpM5', label: 'settings.servoUpM5.label', type: 'bool', hint: 'settings.servoUpM5.hint', when: s => s.penType === 'servo' },
    { k: 'servoUp', label: 'settings.servoUp.label', type: 'num', step: 1, min: 0, max: 100000, when: s => s.penType === 'servo' && !s.servoUpM5 },
    { k: 'penUpCode', label: 'settings.penUpCode.label', type: 'code', hint: 'settings.penUpCode.hint', when: s => s.penType === 'gcode' },
    { k: 'penDownCode', label: 'settings.penDownCode.label', type: 'code', when: s => s.penType === 'gcode' },
    { k: 'penDwell', label: 'settings.penDwell.label', type: 'num', unit: 'unit.ms', hint: 'settings.penDwell.hint', step: 10, min: 0, max: 5000, when: s => s.penType !== 'z' },
    { k: 'penWidth', label: 'settings.penWidth.label', type: 'num', unit: 'unit.mm', hint: 'settings.penWidth.hint', step: 0.05, min: 0.05, max: 5 }] },
  { id: 'axes', title: 'settings.group.axes', fields: [
    { k: 'machW', label: 'settings.machW.label', type: 'num', unit: 'unit.mm', hint: 'settings.machW.hint', step: 1, min: 10, max: 3000 },
    { k: 'machH', label: 'settings.machH.label', type: 'num', unit: 'unit.mm', hint: 'settings.machH.hint', step: 1, min: 10, max: 3000 },
    { k: 'invX', label: 'settings.invX.label', type: 'bool', hint: 'settings.invX.hint' },
    { k: 'invY', label: 'settings.invY.label', type: 'bool', hint: 'settings.invY.hint' },
    { k: 'swap', label: 'settings.swap.label', type: 'bool', hint: 'settings.swap.hint' },
    { k: 'jogMax', label: 'settings.jogMax.label', type: 'num', unit: 'unit.mmmin', step: 500, min: 10, max: 100000 }] },
  { id: 'origin', title: 'settings.group.origin', fields: [
    { k: 'startMode', label: 'settings.startMode.label', type: 'sel', opts: [['current', 'settings.startMode.current'], ['home', 'settings.startMode.home'], ['keep', 'settings.startMode.keep']] },
    { k: 'homeOffX', label: 'settings.homeOffX.label', type: 'num', unit: 'unit.mm', hint: 'settings.homeOffX.hint', step: 0.1, when: s => s.startMode === 'home' },
    { k: 'homeOffY', label: 'settings.homeOffY.label', type: 'num', unit: 'unit.mm', step: 0.1, when: s => s.startMode === 'home' },
    { k: 'park', label: 'settings.park.label', type: 'sel', opts: [['origin', 'settings.park.origin'], ['stay', 'settings.park.stay']] },
    { k: 'sleepAfter', label: 'settings.sleepAfter.label', type: 'bool', hint: 'settings.sleepAfter.hint', when: s => s.canSleep },
    { k: 'headerCode', label: 'settings.headerCode.label', type: 'code', hint: 'settings.headerCode.hint' },
    { k: 'footerCode', label: 'settings.footerCode.label', type: 'code', hint: 'settings.footerCode.hint' }] },
  { id: 'caps', title: 'settings.group.caps', fields: [
    { k: 'canHome', label: 'settings.canHome.label', type: 'bool', hint: 'settings.canHome.hint' },
    { k: 'canSleep', label: 'settings.canSleep.label', type: 'bool', hint: 'settings.canSleep.hint' },
    { k: 'canUnlock', label: 'settings.canUnlock.label', type: 'bool' }] },
  { id: 'import', title: 'settings.group.svgImport', fields: [
    { k: 'layerMode', label: 'settings.layerMode.label', type: 'sel', hint: 'settings.layerMode.hint', opts: [['color', 'settings.layerMode.color'], ['inkscape', 'settings.layerMode.inkscape']] }] },
  { id: 'connection', title: 'settings.group.connection', where: 'conn', fields: [
    { k: 'baud', label: 'settings.baud.label', type: 'sel', hint: 'settings.baud.hint', opts: [[9600, '9600'], [57600, '57600'], [115200, '115200'], [230400, '230400'], [250000, '250000'], [460800, '460800'], [921600, '921600']] },
    { k: 'stream', label: 'settings.stream.label', type: 'sel', hint: 'settings.stream.hint', opts: [['count', 'settings.stream.count'], ['ack', 'settings.stream.ack']] },
    { k: 'rxBuf', label: 'settings.rxBuf.label', type: 'num', unit: 'unit.byte', hint: 'settings.rxBuf.hint', step: 1, min: 16, max: 1024 },
    { k: 'bootWait', label: 'settings.bootWait.label', type: 'bool', hint: 'settings.bootWait.hint' }] }
];
const settingsFields = () => SETTINGS.flatMap(g => g.fields);
/* machine session flags (reset when the connection drops or the board resets) */
let mcZeroSet = false;   // "Hier ist oben links" (G92 X0 Y0) was used since the last connect / motors-off / plot
