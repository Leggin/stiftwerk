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
const SETTINGS = [
  ['settings.group.pen', [
    ['penUp', 'settings.penUp.label', 'num', 'unit.mm', 'settings.penUp.hint', 0.1],
    ['penDown', 'settings.penDown.label', 'num', 'unit.mm', 'settings.penDown.hint', 0.1],
    ['zUpF', 'settings.zUpF.label', 'num', 'unit.mmmin', '', 500],
    ['zDownF', 'settings.zDownF.label', 'num', 'unit.mmmin', 'settings.zDownF.hint', 500],
    ['penWidth', 'settings.penWidth.label', 'num', 'unit.mm', 'settings.penWidth.hint', 0.05]]],
  ['settings.group.axes', [
    ['invX', 'settings.invX.label', 'bool', '', 'settings.invX.hint'],
    ['invY', 'settings.invY.label', 'bool', '', 'settings.invY.hint'],
    ['swap', 'settings.swap.label', 'bool', '', 'settings.swap.hint'],
    ['machW', 'settings.machW.label', 'num', 'unit.mm', 'settings.machW.hint', 1],
    ['machH', 'settings.machH.label', 'num', 'unit.mm', 'settings.machH.hint', 1],
    ['startMode', 'settings.startMode.label', 'sel', '', '', [['current', 'settings.startMode.current'], ['home', 'settings.startMode.home'], ['keep', 'settings.startMode.keep']]],
    ['homeOffX', 'settings.homeOffX.label', 'num', 'unit.mm', 'settings.homeOffX.hint', 0.1],
    ['homeOffY', 'settings.homeOffY.label', 'num', 'unit.mm', '', 0.1],
    ['park', 'settings.park.label', 'sel', '', '', [['origin', 'settings.park.origin'], ['stay', 'settings.park.stay']]],
    ['sleepAfter', 'settings.sleepAfter.label', 'bool', '', 'settings.sleepAfter.hint']]],
  ['settings.group.connection', [
    ['baud', 'settings.baud.label', 'sel', '', 'settings.baud.hint', [[115200, '115200'], [230400, '230400'], [460800, '460800'], [921600, '921600']]],
    ['stream', 'settings.stream.label', 'sel', '', 'settings.stream.hint', [['count', 'settings.stream.count'], ['ack', 'settings.stream.ack']]],
    ['rxBuf', 'settings.rxBuf.label', 'num', 'unit.byte', 'settings.rxBuf.hint', 1]]],
  ['settings.group.svgImport', [
    ['layerMode', 'settings.layerMode.label', 'sel', '', 'settings.layerMode.hint', [['color', 'settings.layerMode.color'], ['inkscape', 'settings.layerMode.inkscape']]]]]
];

