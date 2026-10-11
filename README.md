# Stiftwerk

Gemütliche Browser-App für GRBL-Stiftplotter (GRBL 1.1, FluidNC, grblHAL; Referenzgerät: UUNA TEK iDraw 2.0 A4).
Sie spricht per **Web Serial** direkt mit dem Plotter – keine Installation, kein Inkscape. Deutsch und Englisch.

*A cozy browser app for GRBL pen plotters: arrange an SVG, choose pens, plot – straight from the browser via Web Serial.*

## Was sie kann
- **Motiv:** SVGs öffnen (auch `<use>`, Clip-Pfade, verdeckte Linien), Texte pro Text in eine Plotter-Schrift umwandeln
  (Hershey, eigene SVG-Schriften), frei drehen, spiegeln, ausrichten, einrasten, Kopien mit Schnittmarken,
  Muster & Vorlagen (Rahmen, Raster, Spirale, Rosette, Kalender, Namenskarten).
- **Stifte:** ein Stift für alles oder Farben auf mehrere Stifte verteilen; eine Stift-Bibliothek mit eigenem Tempo,
  Absenktiefe und Strichbreite.
- **Plotten:** Vorab-Check, Rahmen abfahren, Live-Ansicht der gerade gezeichneten Linie, ruhige Restzeit, Pause,
  Weiterplotten ab einer Linie (auch nach Verbindungsabriss), G-Code-Export.
- **Plotter-Profile** für verschiedene Geräte und Blattgrößen (Z-Achse, Servo oder eigener G-Code).
- **Dokumente:** automatisch im Browser gespeichert, Projektdateien (`.stiftwerk.json`) mit eingebetteten Schriften.

## Loslegen
- Bauen: `python3 build.py` → `dist/stiftwerk.html` in Chrome, Edge oder Firefox (mit Web Serial) öffnen.
- Ohne Plotter ausprobieren: `python3 build.py --dev` erzeugt `dist/stiftwerk.dev.html` mit simuliertem Plotter.
- Tests: `npm test` (Node, keine Abhängigkeiten).

## Plotbare Motive per Skript
`tools/plotart/` ist eine kleine Python-Bibliothek (nur Standardbibliothek), um plotbare SVGs zu entwerfen –
Gutscheine, Karten, eine Katzenzeitung, generative Muster – samt Prüfung (Text-Kollisionen, Stifte, Plotzeit) und
Vorschau. Beispiel: `art/katzenzeitung/` („Der Schnurrier“). Details in `tools/plotart/README.md`.

![Der Schnurrier – eine Katzenzeitung, geplottet mit Stiftwerk](art/katzenzeitung/katzenzeitung.plot.png)

## Mehr
- Aufbau, Plotter-Protokoll und Entscheidungen: `docs/entwicklung.md`.
- Regeln für Änderungen am Code: `docs/contract.md`.

## Lizenz
Copyright © 2026 Nicolas Hilberg. Freie Software unter der **GNU General Public License v3** (oder jeder späteren
Version) – siehe [LICENSE](LICENSE).
