#!/usr/bin/env python3
"""Check any SVG before plotting it with Stiftwerk:  python3 check_plot.py art.svg [--margin 6] [--json]

Reports sheet size, pens (stroke colours), metres of line, a time estimate, texts and the fonts Stiftwerk will
guess, and layout problems: lines running through text, overlapping texts, text in the margin or off the sheet,
tiny text, text hidden under a cover. Hidden lines (under white covers) are removed first, as Stiftwerk does."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plotart as P  # noqa: E402

GUESS = {'sans': 'Hershey Sans 1-stroke', 'serif': 'Hershey Serif', 'script': 'Hershey Script 1-stroke', 'gothic': 'Hershey Gothic English', 'plain': 'Stiftwerk built-in'}

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit(__doc__)
    margin = float(sys.argv[sys.argv.index('--margin') + 1]) if '--margin' in sys.argv else 0.0
    args = [a for a in args if a != (sys.argv[sys.argv.index('--margin') + 1] if '--margin' in sys.argv else None)]
    w, h, items, notes = P.load_svg(args[0])
    rep = P.analyze(w, h, margin, items, quiet='--json' in sys.argv)
    fams = {}
    for e in items:
        if e.kind == 'text':
            fams.setdefault(GUESS.get(e.attrs['family'], e.attrs['family']), []).append(e.text)
    hangul = [e.text for e in items if e.kind == 'text' and P.has_hangul(e.text)]
    if '--json' in sys.argv:
        rep['fonts'] = {k: len(v) for k, v in fams.items()}; rep['notes'] = notes
        print(json.dumps(rep, ensure_ascii=False, indent=1))
    else:
        for f, ts in fams.items():
            print(f'  font: {len(ts)} text(s) → Stiftwerk guesses "{f}" (changeable per text)')
        if hangul:
            print(f'  · {len(hangul)} text(s) with Hangul: only Stiftwerk\'s built-in font can draw them')
        for n in notes:
            print('  ·', n)
