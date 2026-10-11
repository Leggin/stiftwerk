# plotart – plotbare SVGs per Python

Eine kleine Bibliothek (nur Python-Standardbibliothek) für Motive, die ein Stiftplotter mit Stiftwerk zeichnet:
Gutscheine, Karten, Einladungen, Zeitungen, generative Muster. Alles in Millimetern, alles Linien.

```python
import sys; sys.path.insert(0, 'tools/plotart')
from plotart import Sheet, Box

s = Sheet('A6', landscape=True, margin=6)
s.border('ticket')
s.fit_text('Gutschein', s.inner.x + 6, s.inner.y + 16, 70, max_size=16, family='script', anchor='start', pen='red')
s.balloon(110, 40, 8, pen='blue')
s.cat_sitting(120, 92, 40, mood='happy')
s.save('gutschein.svg')
s.report()          # Stifte, Meter Linie, Plotzeit, Warnungen (Linien durch Text, abgeschnittener Text …)
```

## Werkzeuge
- `plotart.py` – Blatt, Formen, Rahmen, Motive (Katzen, Ballons, Geschenk, Torte, Wimpelkette …), Schraffur,
  generative Felder, Textsatz mit den echten Schriftbreiten von Stiftwerk (`metrics.json`).
- `check_plot.py datei.svg [--margin 6]` – prüft jedes SVG: Stifte, Plotzeit, Text-Kollisionen, Ränder.
- `preview.py datei.svg [--plot]` – PNG-Vorschau (Inkscape oder ImageMagick). `--plot` zeichnet die Texte so, wie der
  Plotter sie zeichnet (braucht Node und `src/core.js`; die Hershey-Schriften werden einmal von jsDelivr geladen).
- `examples/` – ein Geburtstagsgutschein (A6, 2 Stifte) und eine englische Katzenzeitung (A4).
- `docs/recipes.md` – Layouts und Ideen; `docs/stiftwerk.md` – wie Stiftwerk ein SVG übernimmt.

## Ebenen über Abdeckungen
Weiße Flächen ohne Kontur („Abdeckungen“) verdecken alles, was vorher gezeichnet wurde – Stiftwerk lässt diese Teile
beim Plotten weg. Motive legen sich deshalb automatisch eine Abdeckung unter (`cover=True`): erst den Hintergrund,
dann die Motive, zuletzt den Text zeichnen.
