"""„Der Schnurrier“ – eine Katzenzeitung, A4 hoch, ein Stift.
Ausführen:  python3 art/katzenzeitung/katzenzeitung.py   →  katzenzeitung.svg daneben"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools', 'plotart'))
from plotart import Sheet, Box  # noqa: E402

NAME = 'Der Schnurrier'
ISSUE = 'Nr. 42 · Dienstag, 11. Oktober 2026 · Unabhängig, überparteilich, meistens müde · Preis: ein Leckerli'
HEADLINE = 'KARTON GELIEFERT – KATER ZIEHT SOFORT EIN'
SUB = 'Herr Keks (7) über seine neue Wohnung: „Genau meine Größe!“'
LEAD = ('Am Montagmorgen wurde ein Karton in die Küche geliefert. Augenzeugen berichten, dass die Menschen einen '
        'Toaster herausnahmen und den Karton danach fast vier Minuten lang unbeaufsichtigt auf dem Boden stehen ließen. '
        'Ein unglaublicher Leichtsinn. Herr Keks, 7, zog umgehend ein. „Er passt wie angegossen“, sagte er unserer '
        'Redaktion, bevor er mit einer Pfote über dem Rand einschlief. Der Toaster war für eine Stellungnahme nicht '
        'zu erreichen.\n'
        'Fachleute warnen: Zur Weihnachtszeit könnten weitere Kartons folgen. Sie raten jedem Haushalt, stets '
        'mindestens einen leeren Karton auf dem Boden bereitzuhalten. Eine Petition für einen zweiten Karton hat '
        'bereits vier Pfotenabdrücke und ein Niesen gesammelt.\n'
        'Der Hund betrachtete den Karton derweil lange und schweigend. Aus seinem Umfeld heißt es, er verstehe die '
        'Lage nicht. Er bekam stattdessen ein Leckerli und war zufrieden.\n'
        'Zweimal versuchten die Menschen, den Karton zusammenzufalten. Beide Versuche scheiterten an lautem '
        'Fauchen aus dem Inneren. Der Karton bleibt nun „bis auf Weiteres, oder bis ein größerer kommt“.')
QUOTE = '„Ich bin nicht dick, ich bin flauschig.“'
QUOTE_BY = '– Herr Keks, 7'
BRIEF = [('Sofa', 'Kissen Nr. 3 ist offiziell der wärmste Platz.'),
         ('Wissenschaft', 'Der Napf ist halb leer, sobald man den Boden sieht.'),
         ('Horoskop', 'Löwe: Wirf heute etwas vom Tisch. Du hast es dir verdient.')]
SECOND_HEAD = 'Roter Punkt erneut entkommen'
SECOND = ('Der rote Punkt, der das Wohnzimmer seit drei Jahren in Atem hält, wurde am Sonntagabend an der Zimmerdecke '
          'gesichtet. Trotz eines heldenhaften Einsatzes von Luna, 4, die zweimal den Vorhang erklomm, verschwand er '
          'spurlos. Die Polizei vermutet eine Zusammenarbeit mit dem Menschen, der die kleine Taschenlampe hielt und '
          'dabei auffällig kicherte. Die Ermittlungen laufen. Luna ruht sich aus und lässt ausrichten: '
          '„Nächstes Mal krieg ich ihn.“')
WEATHER = 'Vormittags sonnige Plätzchen auf dem Sofa, nachmittags Staubwolken unter dem Bett. Nachts um drei: Rennwetter im Flur.'
ADS = [('ZU VERSCHENKEN', 'Ein Staubsauger. Laut. Muss weg. Bitte bei Pepper melden.'),
       ('GESUCHT', 'Warmer Schoß, werktags ab 14 Uhr. Beste Referenzen von drei Sofas.'),
       ('VERMISST', 'Lieblingsmaus aus Filz, zuletzt unter dem Kühlschrank. Finderlohn: ein Schnurren.')]
BODY = 3.1                       # Schriftgröße des Fließtexts (Großbuchstaben 2,2 mm hoch)

s = Sheet('A4', margin=12, title=NAME, seed=5)
page = s.inner

# Kopf: zwei Katzengesichter, Titel in Fraktur, Ausgabezeile zwischen Doppellinien
s.cat_face(page.x + 11, page.y + 12, 17, mood='happy')
s.cat_face(page.x1 - 11, page.y + 12, 17, mood='wink')
s.fit_text(NAME, page.cx, page.y + 19, page.w - 48, max_size=26, family='gothic', anchor='middle')
s.rule(page.x, page.x1, page.y + 25, double=True, gap=0.9)
s.fit_text(ISSUE, page.cx, page.y + 30, page.w, max_size=2.8, family='serif', anchor='middle')
s.rule(page.x, page.x1, page.y + 32.5, double=True, gap=0.9)

# Aufmacher: Schlagzeile, zwei Textspalten, rechts Bild + „Kurz notiert“
y = page.y + 44
s.fit_text(HEADLINE, page.cx, y, page.w, max_size=11, family='serif', anchor='middle')
s.fit_text(SUB, page.cx, y + 7, page.w, max_size=4, family='serif', anchor='middle', italic=True)
body = Box(page.x, y + 13, page.w, 112)
cols = s.columns(body, 3, gutter=5)
rest, end = s.flow_text(LEAD, cols[:2], size=BODY, family='serif', leading=1.4)
assert not rest, f'Aufmacher zu lang: {len(rest)} Zeichen zu viel'

q = Box(cols[1].x + 2, end + 7, cols[1].w - 4, cols[1].y1 - end - 7)   # Platz unter dem Text: ein Zitat mit Herzchen
if q.h > 30:
    s.heart(q.x + 6, q.y + 1, 5, pen='black')
    s.rule(q.x + 12, q.x1 - 12, q.y)
    s.heart(q.x1 - 6, q.y + 1, 5, pen='black')
    _, qy, _ = s.text_block(QUOTE, Box(q.x, q.y + 5, q.w, 22), size=6, family='script', align='center', leading=1.3)
    s.text(QUOTE_BY, q.x1 - 4, qy + 6, 3, 'serif', 'end', italic=True)
    s.rule(q.x + 8, q.x1 - 8, qy + 10)
    room = cols[1].y1 - (qy + 10) - 6                                   # space down to the column bottom
    cw = min(q.w * .5, 36, room / (77 / 140))                          # the cat is 77/140 of its width tall
    if cw > 15: s.cat_sleeping(q.cx, qy + 10 + 3 + 42 * cw / 140, cw)

pic = Box(cols[2].x, body.y, cols[2].w, 47)
s.rect(*pic.tup(), r=1.5)
for hx, hy, hs in ((pic.x + 9, pic.y + 11, 4), (pic.x + 15, pic.y + 5.5, 3), (pic.x1 - 9, pic.y + 8, 3.5)):
    s.heart(hx, hy, hs)                                             # Herzchen über dem Kater
s.cat_sitting(pic.cx - 2, pic.y1 - 6, 38, mood='happy')
s.cardboard_box(pic.cx - 16, pic.y1 - 20, 28, 15)
s.text('Herr Keks in seinem neuen Zuhause.', pic.cx, pic.y1 + 4.5, 2.6, 'serif', 'middle', italic=True)
yb = pic.y1 + 12
s.text('KURZ NOTIERT', pic.cx, yb, 3.6, 'serif', 'middle'); yb += 3
BRIEF_SIZE = 2.9
for head, txt in BRIEF:
    need = 5 + 1.5 + len(s.wrap(txt, pic.w, BRIEF_SIZE, 'serif')) * BRIEF_SIZE * 1.32 + 1
    if yb + need > body.y1: print('„Kurz notiert“ ohne:', head); break
    s.rule(pic.x + 12, pic.x1 - 12, yb, style='dotted'); yb += 5
    s.text(head, pic.x, yb, 3.1, 'serif', bold=True)
    _, yb, _ = s.text_block(txt, Box(pic.x, yb + 1.5, pic.w, body.y1 - yb - 1.5), size=BRIEF_SIZE, family='serif', leading=1.32)
    yb += 2.5

# Trenner: eine Spur aus Pfotenabdrücken quer über die Seite
y2 = body.y1 + 7
for i in range(17):
    x = page.x + 4 + i * (page.w - 8) / 16
    s.paw(x, y2 - 2.5 + (1.2 if i % 2 else -1.2), 3.6, rot=90)

# zweite Geschichte (zwei Spalten) und Wetter mit Sonnenkatze
low = Box(page.x, y2 + 3, page.w, 54)
left, right = low.split_x(2, 1, gap=6)
s.fit_text(SECOND_HEAD, left.x, left.y + 6, left.w, max_size=7, family='serif', anchor='start')
c1, c2 = left.split_x(1, 1, gap=5)
rest, end = s.flow_text(SECOND, [Box(c.x, left.y + 11, c.w, left.h - 11) for c in (c1, c2)], size=BODY, family='serif', leading=1.4)
assert not rest, f'Zweite Geschichte zu lang: {len(rest)} Zeichen'
if left.y1 - end > 22:
    s.yarn(c2.cx - 6, (end + left.y1) / 2, 7)
    s.paw(c2.cx + 14, (end + left.y1) / 2 + 4, 8, rot=20)
s.rect(*right.tup(), r=2)
s.text('WETTER', right.cx, right.y + 7, 4.2, 'serif', 'middle')
s.sun(right.x + 13, right.y + 18, 4.5)
s.cat_sleeping(right.cx + 6, right.y + 23.5, 30)                      # Katze im Sonnenfleck
s.text_block(WEATHER, Box(right.x + 4, right.y + 34, right.w - 8, right.h - 36), size=2.7, family='serif', align='center', leading=1.38)

# Kleinanzeigen – über der rechten Anzeige schaut eine Katze hervor
ads = Box(page.x, low.y1 + 8, page.w, page.y1 - low.y1 - 8)
s.rule(page.x, page.x1, ads.y - 3, style='wave')
s.text('KLEINANZEIGEN', ads.cx, ads.y + 4, 3.6, 'serif', 'middle')
s.fish(ads.x + 12, ads.y + 2, 12, rot=180)
boxes = Box(ads.x, ads.y + 8, ads.w, ads.h - 8).split_x(1, 1, 1, gap=5)
peek = boxes[2].x1 - 15
s.cat_face(peek, boxes[2].y - 1.2, 12, mood='awake')                  # erst das Gesicht …
for box, (kind, txt) in zip(boxes, ADS):
    s.rect(*box.tup(), r=1, cover=True)                              # … dann die Anzeige davor: die Katze lugt darüber
    s.text(kind, box.cx, box.y + 6, 3.4, 'sans', 'middle', bold=True)
    s.text_block(txt, Box(box.x + 3, box.y + 9, box.w - 6, box.h - 10), size=2.8, family='serif', align='center')
for dx in (-3.6, 3.6):                                               # … und zwei Pfötchen hängen über die Kante
    s.ellipse(peek + dx, boxes[2].y + 0.6, 2.1, 1.6, cover=True)
    s.lines([[(peek + dx - .7, boxes[2].y + 1.2), (peek + dx - .7, boxes[2].y + 2.1)], [(peek + dx + .7, boxes[2].y + 1.2), (peek + dx + .7, boxes[2].y + 2.1)]])

out = os.path.splitext(os.path.abspath(__file__))[0] + '.svg'
s.save(out)
s.report()
print(out)
