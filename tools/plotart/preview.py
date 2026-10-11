#!/usr/bin/env python3
"""Render an SVG to PNG so you can look at it:  python3 preview.py art.svg [out.png] [--width 1400] [--plot]

Uses Inkscape (best), then ImageMagick. Covers (white fills) render like Stiftwerk's hidden-line removal.
Without --plot, texts render in a fallback screen font (script fonts look much taller than the plotter's).
--plot draws every text as single strokes with Stiftwerk's own font code – the Hershey font Stiftwerk picks for its
font-family (fetched once from jsDelivr like the app does, cached in ~/.cache/stiftwerk-plot-art; built-in font when
offline). Needs node and Stiftwerk's src/core.js (found in the repository above this folder, or set STIFTWERK_CORE)."""
import os
import shutil
import subprocess
import json
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plotart as P  # noqa: E402


def find_core():
    env = os.environ.get('STIFTWERK_CORE')
    if env and os.path.exists(env): return env
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        c = os.path.join(d, 'src', 'core.js')
        if os.path.exists(c): return c
        d = os.path.dirname(d)
    return None


HERSHEY = {'sans': 'HersheySans1', 'serif': 'HersheySerifMed', 'script': 'HersheyScript1', 'gothic': 'HersheyGothEnglish'}
FONT_URL = 'https://cdn.jsdelivr.net/npm/hersheytext/svg_fonts/{}.svg'


def font_dir(ids):
    """the Hershey SVG fonts Stiftwerk would load, cached locally (missing ones: built-in font)"""
    import urllib.request
    d = os.path.join(os.path.expanduser('~'), '.cache', 'stiftwerk-plot-art', 'fonts'); os.makedirs(d, exist_ok=True)
    for i in ids:
        f = os.path.join(d, i + '.svg')
        if not os.path.exists(f):
            try:
                with urllib.request.urlopen(FONT_URL.format(i), timeout=15) as r: data = r.read()
                if b'<font' in data:
                    with open(f, 'wb') as out: out.write(data)
            except Exception as e:  # offline: Stiftwerk's built-in font instead
                print(f'(font {i} not available: {e} – using the built-in font)', file=sys.stderr)
    return d


def plot_svg(svg):
    """the SVG as the plotter draws it: covers, lines, and texts as single strokes (Stiftwerk's built-in font)"""
    core, node = find_core(), shutil.which('node')
    if not core or not node:
        raise SystemExit('--plot needs node and Stiftwerk\'s src/core.js (set STIFTWERK_CORE=/path/to/src/core.js)')
    w, h, items, _ = P.load_svg(svg)
    texts = [e for e in items if e.kind == 'text']
    js = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'textpaths.js')
    fid = lambda e: 'builtin' if P.has_hangul(e.text) else HERSHEY.get(e.attrs['family'], 'builtin')   # Hangul: built-in only
    data = [dict(str=e.text, x=e.attrs['x'], y=e.attrs['y'], size=e.attrs['size'], anchor=e.attrs['anchor'], italic=e.attrs['italic'], bold=e.attrs['bold'],
                 spacing=e.attrs.get('spacing', 0), font=fid(e)) for e in texts]
    fdir = font_dir(sorted({d['font'] for d in data} - {'builtin'}))
    r = subprocess.run([node, js, core, fdir], input=json.dumps(data), capture_output=True, text=True, timeout=60)
    if r.returncode: raise SystemExit(r.stderr)
    polys = iter(json.loads(r.stdout))
    s = P.Sheet((w, h), margin=0)
    for e in items:
        if e.kind == 'text':
            ps = next(polys); rot = e.attrs.get('rot') or 0
            if rot: ps = [[P._rot(q, (e.attrs['x'], e.attrs['y']), rot) for q in p] for p in ps]
            s.items.append(P.Element('line', [list(map(tuple, p)) for p in ps], e.pen, 'text'))
        else:
            s.items.append(e)
    out = os.path.splitext(svg)[0] + '.plot.svg'; s.save(out); return out


def render(svg, png=None, width=1400):
    png = png or os.path.splitext(svg)[0] + '.png'
    ink = shutil.which('inkscape')
    if ink:
        r = subprocess.run([ink, svg, '--export-type=png', f'--export-filename={png}', f'--export-width={width}', '--export-background=#ffffff',
                            '--export-background-opacity=1'], capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and os.path.exists(png):
            return png
    magick = shutil.which('magick') or shutil.which('convert')
    if magick:
        r = subprocess.run([magick, '-background', '#ffffff', '-density', '200', svg, '-resize', f'{width}x', png], capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and os.path.exists(png):
            return png
    raise SystemExit('No renderer found (install Inkscape or ImageMagick) – open the SVG in a browser instead.')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    w = 1400
    if '--width' in sys.argv:
        w = int(sys.argv[sys.argv.index('--width') + 1]); args = [a for a in args if a != str(w)]
    if not args:
        raise SystemExit(__doc__)
    src = plot_svg(args[0]) if '--plot' in sys.argv else args[0]
    out = args[1] if len(args) > 1 else (os.path.splitext(args[0])[0] + ('.plot.png' if '--plot' in sys.argv else '.png'))
    print(render(src, out, w))
