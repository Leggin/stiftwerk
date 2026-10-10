# Stiftwerk

Gemütliche Browser-App für den Stiftplotter UUNA TEK iDraw 2.0 (Web Serial, GRBL) – Deutsch und Englisch.
Motiv anordnen → Stifte wählen (ein Stift oder mehrere) → plotten. SVG-Texte lassen sich pro Text in eine
Plotter-Schrift umwandeln, mit Live-Vorschau und Rückgängig.

- Bauen: `python3 build.py` → `dist/stiftwerk.html` in Chrome, Edge oder Firefox öffnen.
  `python3 build.py --dev` erzeugt zusätzlich `dist/stiftwerk.dev.html` mit simuliertem Plotter.
- Tests: `npm test`.
- Aufbau, Plotter-Protokoll und Entscheidungen: `docs/entwicklung.md`; Regeln für Änderungen: `docs/contract.md`.
