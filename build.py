#!/usr/bin/env python3
"""Baut die Single-File-App aus src/ -> dist/.

src/index.html ist das Gerüst. Marker-Zeilen werden durch die sortiert aneinandergehängten Fragmente ersetzt:
  /*CSS*/  <- src/css/*.css      /*HTML*/ <- src/html/*.html      /*APP*/ <- src/app/*.js (alles in einer IIFE)
  /*CORE*/ <- src/core.js      /*LIB*/ <- src/lib/*.js (pure, auch in Node testbar)
  /*I18N*/ <- src/i18n/i18n.js + src/i18n/de/*.js + src/i18n/en/*.js
Ausgabe: dist/stiftwerk.html (lokal öffnen, Web Serial) und dist/stiftwerk.artifact.html (ohne doctype/head).
--dev zusätzlich: dist/stiftwerk.dev.html mit tools/fake-grbl.js (simulierter Plotter, nie für echte Hardware)."""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent
src = root / 'src'

def cat(d, ext):
    p = src / d
    return ''.join(f.read_text(encoding='utf-8') for f in sorted(p.glob('*' + ext))) if p.is_dir() else ''

def put(t, marker, content):
    line = marker + '\n'
    if t.count(line) != 1: sys.exit(f'build: marker {marker} must appear exactly once on its own line')
    return t.replace(line, content)

full = (src / 'index.html').read_text(encoding='utf-8')
full = put(full, '/*CSS*/', cat('css', '.css'))
full = put(full, '/*HTML*/', cat('html', '.html'))
full = put(full, '/*APP*/', cat('app', '.js'))
full = put(full, '/*LIB*/', cat('lib', '.js'))
full = put(full, '/*I18N*/', (src / 'i18n' / 'i18n.js').read_text(encoding='utf-8') + ''.join(cat(f'i18n/{l}', '.js') for l in ('de', 'en')))
full = full.replace('/*CORE*/', (src / 'core.js').read_text(encoding='utf-8'))

dist = root / 'dist'; dist.mkdir(exist_ok=True)
# Artifact-Variante: ohne <!doctype>/<head>, die Plattform ergänzt das Gerüst
(dist / 'stiftwerk.artifact.html').write_text(full, encoding='utf-8')
# Lokale Variante: vollständiges HTML-Dokument (für Chrome/Edge/Firefox mit Web Serial)
i = full.index('</style>') + len('</style>')
local = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
         + full[:i] + '\n</head>\n<body>\n' + full[i:] + '\n</body>\n</html>\n')
(dist / 'stiftwerk.html').write_text(local, encoding='utf-8')
out = ['dist/stiftwerk.html', 'dist/stiftwerk.artifact.html']
if '--dev' in sys.argv:
    fake = (root / 'tools' / 'fake-grbl.js').read_text(encoding='utf-8')
    dev = local.replace('<body>\n', '<body>\n<script>\n' + fake + '</script>\n', 1)
    (dist / 'stiftwerk.dev.html').write_text(dev, encoding='utf-8')
    out.append('dist/stiftwerk.dev.html (simulierter Plotter)')
print('gebaut:', ', '.join(out))
