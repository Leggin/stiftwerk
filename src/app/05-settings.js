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
  ['Stift', [
    ['penUp', 'Stift oben', 'num', 'mm', 'Z-Position zum Anheben. Inkscape-Erweiterung: 0,5', 0.1],
    ['penDown', 'Stift unten', 'num', 'mm', 'Z-Position zum Aufsetzen. Inkscape-Erweiterung: 5,0', 0.1],
    ['zUpF', 'Tempo heben', 'num', 'mm/min', '', 500],
    ['zDownF', 'Tempo senken', 'num', 'mm/min', 'langsamer schont weiche Spitzen', 500],
    ['penWidth', 'Strichbreite Vorschau', 'num', 'mm', 'nur für die Darstellung', 0.05]]],
  ['Achsen & Nullpunkt', [
    ['invX', 'X-Achse umkehren', 'bool', '', 'wenn → den Stift nach links fährt'],
    ['invY', 'Y-Achse umkehren', 'bool', '', 'iDraw 2.0: an (wie vpype „vertical_flip“)'],
    ['swap', 'X und Y tauschen', 'bool', '', 'falls das Blatt quer zur Maschine liegt'],
    ['machW', 'Arbeitsbereich Breite', 'num', 'mm', 'A4-Modell: 210', 1],
    ['machH', 'Arbeitsbereich Höhe', 'num', 'mm', 'A4-Modell: 297', 1],
    ['startMode', 'Startpunkt beim Plotten', 'sel', '', '', [['current', 'Aktuelle Stiftposition = oben links'], ['home', 'Referenzfahrt, dann Versatz'], ['keep', 'Gesetzten Nullpunkt behalten']]],
    ['homeOffX', 'Versatz nach Referenzfahrt X', 'num', 'mm', 'Maschinenkoordinaten, relativ', 0.1],
    ['homeOffY', 'Versatz nach Referenzfahrt Y', 'num', 'mm', '', 0.1],
    ['park', 'Beim Stiftwechsel', 'sel', '', '', [['origin', 'Zum Nullpunkt fahren'], ['stay', 'Stehen bleiben']]],
    ['sleepAfter', 'Motoren nach dem Plot aus', 'bool', '', 'sendet $SLP wie die Inkscape-Erweiterung']]],
  ['Verbindung', [
    ['baud', 'Baudrate', 'sel', '', 'DrawCore V2: 115200 Standard', [[115200, '115200'], [230400, '230400'], [460800, '460800'], [921600, '921600']]],
    ['stream', 'Übertragung', 'sel', '', 'Puffer füllen = flüssigere Kurven', [['count', 'Puffer füllen (GRBL-Standard)'], ['ack', 'Zeile für Zeile (wie Inkscape)']]],
    ['rxBuf', 'Puffergröße', 'num', 'Byte', 'GRBL: 128, lieber etwas Luft lassen', 1]]],
  ['SVG-Import', [
    ['layerMode', 'Ebenen bilden aus', 'sel', '', 'gilt für neu importierte Dateien', [['color', 'Strichfarbe'], ['inkscape', 'Inkscape-Ebenen']]]]]
];

