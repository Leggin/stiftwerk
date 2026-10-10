/* ---------------- settings ---------------- */
const DEFAULTS = {
  baud: 115200, stream: 'count', rxBuf: 120,
  penUp: 0.5, penDown: 5, zUpF: 20000, zDownF: 5000, penDelay: 0, penWidth: 0.4,
  drawF: 2000, travelF: 8000,
  invX: false, invY: true, swap: false, machW: 210, machH: 297,
  startMode: 'current', homeOffX: 0, homeOffY: 0, park: 'origin', sleepAfter: true,
  optimize: true, reverse: true, joinTol: 0.1, simplify: 0.02, showTravel: false, layerMode: 'color'
};
let S = Object.assign({}, DEFAULTS, store.get('settings', {}));
const saveS = () => store.set('settings', S);
/* Machine settings, rendered by 66-settings-ui.js in friendly groups.
 * Field: { k, label, type: 'num'|'bool'|'sel', unit?, hint?, step?, min?, max?, opts?: [[value, labelKey]], when?: S → bool }
 * where: 'conn' = shown under "Erweitert" in the connection card, otherwise in the settings card.
 * Only the keys listed here are touched by "Standardwerte" (tempo/optimizer settings live in the plot step). */
const SETTINGS = [
  { id: 'pen', title: 'settings.group.pen', fields: [
    { k: 'penUp', label: 'settings.penUp.label', type: 'num', unit: 'unit.mm', hint: 'settings.penUp.hint', step: 0.1, min: 0, max: 10 },
    { k: 'penDown', label: 'settings.penDown.label', type: 'num', unit: 'unit.mm', hint: 'settings.penDown.hint', step: 0.1, min: 0, max: 10 },
    { k: 'zUpF', label: 'settings.zUpF.label', type: 'num', unit: 'unit.mmmin', step: 500, min: 100, max: 30000 },
    { k: 'zDownF', label: 'settings.zDownF.label', type: 'num', unit: 'unit.mmmin', hint: 'settings.zDownF.hint', step: 500, min: 100, max: 30000 },
    { k: 'penWidth', label: 'settings.penWidth.label', type: 'num', unit: 'unit.mm', hint: 'settings.penWidth.hint', step: 0.05, min: 0.05, max: 5 }] },
  { id: 'axes', title: 'settings.group.axes', fields: [
    { k: 'invX', label: 'settings.invX.label', type: 'bool', hint: 'settings.invX.hint' },
    { k: 'invY', label: 'settings.invY.label', type: 'bool', hint: 'settings.invY.hint' },
    { k: 'swap', label: 'settings.swap.label', type: 'bool', hint: 'settings.swap.hint' },
    { k: 'machW', label: 'settings.machW.label', type: 'num', unit: 'unit.mm', hint: 'settings.machW.hint', step: 1, min: 10, max: 2000 },
    { k: 'machH', label: 'settings.machH.label', type: 'num', unit: 'unit.mm', hint: 'settings.machH.hint', step: 1, min: 10, max: 2000 }] },
  { id: 'origin', title: 'settings.group.origin', fields: [
    { k: 'startMode', label: 'settings.startMode.label', type: 'sel', opts: [['current', 'settings.startMode.current'], ['home', 'settings.startMode.home'], ['keep', 'settings.startMode.keep']] },
    { k: 'homeOffX', label: 'settings.homeOffX.label', type: 'num', unit: 'unit.mm', hint: 'settings.homeOffX.hint', step: 0.1, when: s => s.startMode === 'home' },
    { k: 'homeOffY', label: 'settings.homeOffY.label', type: 'num', unit: 'unit.mm', step: 0.1, when: s => s.startMode === 'home' },
    { k: 'park', label: 'settings.park.label', type: 'sel', opts: [['origin', 'settings.park.origin'], ['stay', 'settings.park.stay']] },
    { k: 'sleepAfter', label: 'settings.sleepAfter.label', type: 'bool', hint: 'settings.sleepAfter.hint' }] },
  { id: 'import', title: 'settings.group.svgImport', fields: [
    { k: 'layerMode', label: 'settings.layerMode.label', type: 'sel', hint: 'settings.layerMode.hint', opts: [['color', 'settings.layerMode.color'], ['inkscape', 'settings.layerMode.inkscape']] }] },
  { id: 'connection', title: 'settings.group.connection', where: 'conn', fields: [
    { k: 'baud', label: 'settings.baud.label', type: 'sel', hint: 'settings.baud.hint', opts: [[115200, '115200'], [230400, '230400'], [460800, '460800'], [921600, '921600']] },
    { k: 'stream', label: 'settings.stream.label', type: 'sel', hint: 'settings.stream.hint', opts: [['count', 'settings.stream.count'], ['ack', 'settings.stream.ack']] },
    { k: 'rxBuf', label: 'settings.rxBuf.label', type: 'num', unit: 'unit.byte', hint: 'settings.rxBuf.hint', step: 1, min: 16, max: 128 }] }
];
const settingsFields = () => SETTINGS.flatMap(g => g.fields);
/* machine session flags (reset when the connection drops or the board resets) */
let mcZeroSet = false;   // "Hier ist oben links" (G92 X0 Y0) was used since the last connect / motors-off / plot
