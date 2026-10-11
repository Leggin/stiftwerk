"""'The Daily Whisker' – a cat newspaper, A4 portrait, one pen. Gothic masthead, a lead story over two columns,
a picture with "In brief" beside it, a second story, a weather box and classifieds.
Text is many short strokes (many pen lifts): about 40 minutes. Serif body text has ~5 strokes per letter –
family='sans' or 'script' for the body would roughly halve the time.
Run:  python3 cat_newspaper.py [out.svg]"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from plotart import Sheet, Box  # noqa: E402

NAME = 'The Daily Whisker'
ISSUE = 'Vol. IX · No. 42 · Tuesday, 11 October 2026 · Price: one fish'
HEADLINE = 'BOX ARRIVES, NOBODY ORDERS ANYTHING'
SUB = 'Local cat declares it "the best day of the year"'
LEAD = ('A cardboard box was delivered to the kitchen on Monday morning. Witnesses report that the humans took '
        'a toaster out of it and then simply left the box on the floor, unattended, for almost four minutes. '
        'Mr. Biscuit, 7, moved in immediately. "It is exactly my size," he told reporters, before falling asleep '
        'with one paw hanging over the edge. The toaster has not commented.\n'
        'Experts warn that more boxes could follow as the holiday season approaches, and advise every household '
        'to keep at least one empty box on the floor at all times. A petition for a second box has already '
        'collected four paw prints and one sneeze.\n'
        'Meanwhile the dog was seen staring at the box for a long time. Sources close to the dog say he does not '
        'understand what is happening. He was given a biscuit instead and appeared satisfied.\n'
        'The humans have tried twice to fold the box flat and carry it to the recycling bin. Both attempts failed '
        'after loud protests from inside. A spokescat for the household said the box would stay "until further '
        'notice, or until a bigger box arrives". The kitchen is expected to remain partly blocked until spring.')
BRIEF = [('Sofa', 'Cushion number three declared the warmest. Queue forms at noon.'),
         ('Science', 'Study confirms: the bowl is half empty if you can see the bottom.'),
         ('Sport', 'Luna sets a new record: zero to top of the wardrobe in 1.2 seconds.')]
SECOND_HEAD = 'Red Dot Escapes Again'
SECOND = ('The red dot that has terrorised the living room for three years was spotted on the ceiling on Sunday '
          'evening. Despite a heroic effort by Luna, 4, who climbed the curtains twice, it vanished without a trace. '
          'Police believe the dot may be working together with the human holding the little torch, who was seen '
          'laughing at the scene. The investigation continues, and residents are asked to report any suspicious '
          'red lights to the nearest cat. Luna is resting and doing well.')
ADS = [('FOR SALE', 'One vacuum cleaner. Loud. Must go. Ask for Pepper.'),
       ('WANTED', 'Warm lap, weekday afternoons. References from three sofas.'),
       ('LOST', 'Favourite toy mouse, last seen under the fridge. Reward: one purr.')]
BODY = 3.1                       # font-size of running text (cap height 2.2 mm)

s = Sheet('A4', margin=12, title=NAME, seed=3)
page = s.inner

# masthead
s.paw(page.x + 10, page.y + 12, 9, rot=-15)
s.paw(page.x1 - 10, page.y + 12, 9, rot=15)
s.fit_text(NAME, page.cx, page.y + 19, page.w - 40, max_size=26, family='gothic', anchor='middle')
s.rule(page.x, page.x1, page.y + 25, double=True, gap=0.9)
s.text(ISSUE, page.cx, page.y + 30, 2.8, 'serif', 'middle')
s.rule(page.x, page.x1, page.y + 32.5, double=True, gap=0.9)

# lead story: headline, two text columns, the third column holds the picture and "In brief"
y = page.y + 44
s.fit_text(HEADLINE, page.cx, y, page.w, max_size=11, family='serif', anchor='middle')
s.text(SUB, page.cx, y + 7, 4, 'serif', 'middle', italic=True)
body = Box(page.x, y + 13, page.w, 112)
cols = s.columns(body, 3, gutter=5)
rest, end = s.flow_text(LEAD, cols[:2], size=BODY, family='serif', leading=1.4)
assert not rest, f'lead story too long by {len(rest)} characters'
q = Box(cols[1].x + 2, end + 8, cols[1].w - 4, cols[1].y1 - end - 8)   # free space under the story: a pull quote
if q.h > 30:
    s.rule(q.x + 8, q.x1 - 8, q.y)
    _, qy, _ = s.text_block('"It is exactly my size."', Box(q.x, q.y + 5, q.w, 20), size=6.5, family='script', align='center', leading=1.3)
    s.text('– Mr. Biscuit, 7', q.x1 - 4, qy + 6, 3, 'serif', 'end', italic=True)
    s.rule(q.x + 8, q.x1 - 8, qy + 10)
    cw = min(q.w * .55, 40)                                          # cat_sleeping reaches 42/140 × width above its centre
    s.cat_sleeping(q.cx, qy + 10 + 5 + 42 * cw / 140, cw)
pic = Box(cols[2].x, body.y, cols[2].w, 52)
s.rect(*pic.tup(), r=1.5)
s.cat_sitting(pic.cx - 2, pic.y1 - 7, 42, mood='happy')            # the cat first …
s.cardboard_box(pic.cx - 17, pic.y1 - 22, 30, 16)                    # … then the box covers its lower half
s.text('Mr. Biscuit in his new home.', pic.cx, pic.y1 + 4.5, 2.6, 'serif', 'middle', italic=True)
yb = pic.y1 + 12
s.text('IN BRIEF', pic.cx, yb, 3.6, 'serif', 'middle'); yb += 3
for head, txt in BRIEF:
    need = 5.5 + 1.5 + len(s.wrap(txt, pic.w, BODY, 'serif')) * BODY * 1.35 + 1
    if yb + need > body.y1: break                                       # no room left in the column: leave it out
    s.rule(pic.x + 12, pic.x1 - 12, yb, style='dotted'); yb += 5.5
    s.text(head, pic.x, yb, 3.2, 'serif', bold=True)
    _, yb, _ = s.text_block(txt, Box(pic.x, yb + 1.5, pic.w, body.y1 - yb - 1.5), size=BODY, family='serif', leading=1.35)
    yb += 3

# second story (two columns) and the weather
y2 = body.y1 + 6
s.rule(page.x, page.x1, y2 - 2)
low = Box(page.x, y2 + 2, page.w, 58)
left, right = low.split_x(2, 1, gap=6)
s.text(SECOND_HEAD, left.x, left.y + 6, 7, 'serif')
c1, c2 = left.split_x(1, 1, gap=5)
rest, end = s.flow_text(SECOND, [Box(c.x, left.y + 11, c.w, left.h - 11) for c in (c1, c2)], size=BODY, family='serif', leading=1.4)
if left.y1 - end > 22:                                               # room left in the second column: a yarn ball and a paw
    s.yarn(c2.cx - 6, (end + left.y1) / 2, 7, cover=True)
    s.paw(c2.cx + 14, (end + left.y1) / 2 + 4, 8, rot=20)
s.rect(*right.tup(), r=2)
s.text('WEATHER', right.cx, right.y + 7, 4.2, 'serif', 'middle')
s.sun(right.cx - 8, right.y + 21, 5)
s.cloud(right.cx + 7, right.y + 24, 18)                              # the cloud covers part of the sun's rays
s.text_block('Sunny spots on the sofa until 3 pm, then clouds of dust under the bed.', Box(right.x + 4, right.y + 35, right.w - 8, 20),
             size=2.9, family='serif', align='center')

# classifieds
ads = Box(page.x, low.y1 + 8, page.w, page.y1 - low.y1 - 8)
s.rule(page.x, page.x1, ads.y - 3, style='wave')
s.text('CLASSIFIEDS', ads.cx, ads.y + 4, 3.6, 'serif', 'middle')
s.fish(ads.x1 - 12, ads.y + 2, 12)
s.fish(ads.x + 12, ads.y + 2, 12, rot=180)
for box, (kind, txt) in zip(Box(ads.x, ads.y + 8, ads.w, ads.h - 8).split_x(1, 1, 1, gap=5), ADS):
    s.rect(*box.tup(), r=1)
    s.text(kind, box.cx, box.y + 6, 3.4, 'sans', 'middle', bold=True)
    s.text_block(txt, Box(box.x + 3, box.y + 9, box.w - 6, box.h - 10), size=2.8, family='serif', align='center')

out = sys.argv[1] if len(sys.argv) > 1 else os.path.splitext(os.path.abspath(__file__))[0] + '.svg'
s.save(out)
s.report()
print(out)
