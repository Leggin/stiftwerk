#!/usr/bin/env python3
"""One-off: split src/app.html into src/index.html + src/{css,html,app}/ fragments (line ranges, 1-based, inclusive).
Contiguous ranges, no edits – the rebuilt dist/ must be byte-identical."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
lines = (src / 'app.html').read_text(encoding='utf-8').splitlines(keepends=True)
assert len(lines) == 1428, len(lines)
L = lambda a, b: ''.join(lines[a - 1:b])

CSS = [('00-tokens', 6, 26), ('10-shell', 27, 46), ('20-components', 47, 87), ('30-stage', 88, 99), ('40-panel', 100, 145), ('50-overlays', 146, 163)]
HTML = [('10-header', 166, 176), ('20-aside', 177, 196), ('30-stage', 197, 214), ('40-panel', 215, 319), ('90-overlays', 320, 322)]
APP = [('00-util', 330, 339), ('05-settings', 340, 376), ('10-state', 377, 394), ('12-colors', 395, 427), ('20-geometry', 428, 456),
       ('22-fonts', 457, 517), ('24-items', 518, 548), ('30-import', 549, 667), ('40-job', 668, 704), ('50-canvas', 705, 853),
       ('52-canvas-input', 854, 899), ('60-objects', 900, 914), ('61-pens', 915, 941), ('62-inspector', 942, 1004),
       ('63-item-ops', 1005, 1010), ('64-page', 1011, 1025), ('65-tabs', 1026, 1029), ('66-settings-ui', 1030, 1050),
       ('67-plot-ui', 1051, 1077), ('68-gcode', 1078, 1100), ('70-serial', 1101, 1204), ('71-conn-ui', 1205, 1234),
       ('72-console', 1235, 1250), ('73-manual', 1251, 1271), ('80-plot', 1272, 1351), ('85-dialog', 1352, 1358),
       ('90-files', 1359, 1391), ('95-keys', 1392, 1402), ('99-boot', 1403, 1426)]

def check(parts, a, b):
    cur = a
    for _, s, e in parts: assert s == cur, (s, cur); cur = e + 1
    assert cur == b + 1, (cur, b)
check(CSS, 6, 163); check(HTML, 166, 322); check(APP, 330, 1426)

index = L(1, 5) + '/*CSS*/\n' + L(164, 165) + '/*HTML*/\n' + L(323, 329) + '/*APP*/\n' + L(1427, 1428)
for d, parts, ext in (('css', CSS, '.css'), ('html', HTML, '.html'), ('app', APP, '.js')):
    (src / d).mkdir(exist_ok=True)
    for name, a, b in parts: (src / d / (name + ext)).write_text(L(a, b), encoding='utf-8')
(src / 'index.html').write_text(index, encoding='utf-8')
print('split ok:', len(CSS), 'css,', len(HTML), 'html,', len(APP), 'app fragments')
