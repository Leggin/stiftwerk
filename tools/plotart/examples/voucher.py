"""Birthday voucher – A6 landscape, 2 pens (black + red), tear-off stub on the right.
Run:  python3 voucher.py [out.svg]   then   python3 ../check_plot.py out.svg   and   python3 ../preview.py out.svg --plot"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from plotart import Sheet, Box  # noqa: E402

TEXTS = {   # python3 voucher.py --en  for the English version
    'de': dict(TITLE='Gutschein', FOR='Lena', GIFT='für einen Kinoabend mit Popcorn', FROM='Max', LABELS=('für', 'von'), NO='Nr. 001',
               SMALL='Einzulösen, wann immer du Lust hast. Popcorn süß oder salzig – du entscheidest.'),
    'en': dict(TITLE='Voucher', FOR='Lena', GIFT='for a movie night with popcorn', FROM='Max', LABELS=('for', 'from'), NO='No. 001',
               SMALL='Redeem whenever you like. Sweet or salty popcorn – your call.'),
}
T = TEXTS['en' if '--en' in sys.argv else 'de']
TITLE, FOR, GIFT, FROM, SMALL = T['TITLE'], T['FOR'], T['GIFT'], T['FROM'], T['SMALL']
ACCENT = 'red'

s = Sheet('A6', landscape=True, margin=5, title=f'{TITLE} – {FOR}', seed=7)
outer = s.inner
s.border('ticket', outer, r=4)                                      # notched ticket shape
stub_x = outer.x1 - 26
s.perforation(stub_x, outer.y + 2, stub_x, outer.y1 - 2)            # tear-off line
main = Box(outer.x + 7, outer.y + 6, stub_x - outer.x - 13, outer.h - 12)

# drawing order = layering: background decoration → motifs (they cover what lies beneath) → text on top
col = Box(main.x, main.y, main.w - 32, main.h)                      # text column on the left
s.reserve(col)                                                       # … stays free of confetti
s.confetti(Box(main.x + 30, main.y - 2, main.w - 30, 42), n=10, pens=(ACCENT, 'black'), size=1.6)

s.balloon(main.x1 - 22, main.y + 17, 7, pen=ACCENT)
s.balloon(main.x1 - 9, main.y + 13, 6, pen='black')
s.gift(main.x1 - 26, main.y1 - 22, 20, 15, pen='black', ribbon_pen=ACCENT)

s.fit_text(TITLE, col.x, col.y + 14, col.w, max_size=17, family='script', anchor='start', pen=ACCENT)
s.text_block(GIFT, Box(col.x, col.y + 21, col.w, 14), size=5, family='sans')
for i, (label, name) in enumerate(zip(T['LABELS'], (FOR, FROM))):
    ly = col.y + 50 + i * 10
    s.text(label, col.x, ly, 3.4, 'sans')
    s.line(col.x + 9, ly + 1, col.x + 52, ly + 1)                  # a line to write on …
    s.text(name, col.x + 11, ly - 0.6, 5, 'script', pen=ACCENT)    # … already filled in
_, _, rest = s.text_block(SMALL, Box(col.x, main.y1 - 7, col.w + 4, 8), size=2.6, family='sans')   # stays left of the gift

# stub: rotated text, a star
cx = stub_x + 13
s.text('HAPPY BIRTHDAY', cx + 2, outer.cy, 4.2, 'sans', 'middle', rot=-90, pen=ACCENT)
s.text(T['NO'], cx - 5, outer.cy, 3, 'sans', 'middle', rot=-90)
s.star(cx - 2, outer.y + 10, 3.2, pen=ACCENT)
s.star(cx - 2, outer.y1 - 10, 3.2, pen=ACCENT)


args = [a for a in sys.argv[1:] if not a.startswith('--')]
out = args[0] if args else os.path.splitext(os.path.abspath(__file__))[0] + '.svg'
s.save(out)
s.report()
print(out)
