#!/usr/bin/env python3
"""Baut die Single-File-App: src/app.html + src/core.js -> dist/."""
import re, pathlib
root = pathlib.Path(__file__).parent
app = (root / 'src/app.html').read_text(encoding='utf-8')
core = (root / 'src/core.js').read_text(encoding='utf-8')
full = app.replace('/*CORE*/', core)
dist = root / 'dist'; dist.mkdir(exist_ok=True)
# Artifact-Variante: ohne <!doctype>/<head>, die Plattform ergänzt das Gerüst
(dist / 'stiftwerk.artifact.html').write_text(full, encoding='utf-8')
# Lokale Variante: vollständiges HTML-Dokument (für Chrome/Edge mit Web Serial)
i = full.index('</style>') + len('</style>')
local = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
         + full[:i] + '\n</head>\n<body>\n' + full[i:] + '\n</body>\n</html>\n')
(dist / 'stiftwerk.html').write_text(local, encoding='utf-8')
print('dist/stiftwerk.html und dist/stiftwerk.artifact.html gebaut')
