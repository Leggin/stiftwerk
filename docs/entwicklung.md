# Stiftwerk – Entwicklung: Web-App für GRBL-Stiftplotter (Referenz: UUNA TEK iDraw 2.0 A4)

Ersatz für die Inkscape-Erweiterung von UUNA TEK, gedacht für GRBL-Stiftplotter allgemein (GRBL 1.1, FluidNC,
grblHAL) über **Plotter-Profile**. Referenzgerät ist der UUNA TEK iDraw 2.0 A4 – das einzige Profil, das an echter
Hardware geprüft ist. Läuft komplett im Browser (Chrome/Edge, **Firefox 155** mit nativem Web Serial), spricht per **Web Serial**
direkt mit dem Plotter.
UI zweisprachig **Deutsch/Englisch** (Umschalter DE|EN, Vorgabe: gespeicherte Wahl → Browsersprache → en).

## Aufbau (Details und Regeln für parallele Arbeit: `docs/contract.md` – vor Änderungen lesen)
- `python3 build.py` baut aus `src/` eine einzige Datei: `dist/stiftwerk.html` (lokal öffnen).
  `--dev` zusätzlich `dist/stiftwerk.dev.html` mit
  `tools/fake-grbl.js` (simulierter Plotter – zum Testen von Verbinden/Plotten ohne Hardware). In der URL wählt
  `?fake=drawcore|fluidnc|grblhal|plain|silent` die simulierte Firmware (`silent` antwortet nie → „Kein GRBL-Plotter“).
- `src/index.html` = Gerüst; Marker werden durch sortiert verkettete Fragmente ersetzt:
  `src/css/*.css`, `src/html/*.html`, dann Skripte `src/core.js` (SW: Geometrie, Schriften, G-Code) →
  `src/lib/*.js` (rein, in Node testbar: SWColor, SWMachine, SWPens, SWGeo, SWJob, SWText, SWLayout, SWUndo, SWGen,
  SWMigrate, SWPenLib, SWTimeline, SWProject) →
  `src/i18n/i18n.js` + `src/i18n/{de,en}/*.js` (I18N) → `src/app/*.js` (**alle in einer gemeinsamen IIFE**,
  keine doppelten Top-Level-Namen).
- App-Gerüst: `01-registry.js` (SWUI: Inspector-Sektionen, Pre-Flight-Checks, Canvas-Overlays, Events
  `job/select/conn/state/plot/history/step/machine/origin/fonts/preflight/canvas:*`), `10-state.js` (Dokument,
  Speichern, Migration), `14-history.js` (Undo/Redo), `70-serial.js`/`80-plot.js` (GRBL, DOM-frei – nur Events).
- Tests: `npm test` (alle `test/*.test.js`: Build-/Syntaxcheck, Kernlogik, Libs, **Golden-G-Code** gegen
  `test/golden/*.gcode`, i18n). Nach jeder Änderung bauen und testen – Exit-Code prüfen.
- Dev-Build: `window.SWDEBUG` (pb, job, items, pbCut/pbLiveInfo, draw …) für Tests; der simulierte Plotter hat einen
  15-Block-Planer mit Echtzeit-Bewegung (`timeScale` 0,1 = 10× schneller).
- Werkzeuge: `tools/bridge.py` (HTTP↔Seriell-Brücke + `/debug.html` mit Web-Serial-Mitschnitt für echte
  Hardware – nur bewusst einsetzen, bewegt echte Hardware), `tools/fake-grbl.js`, `tools/split.py` (historisch).

## Kunst-Werkzeuge (`tools/plotart/`)
- Erzeugt plotbare SVGs (Gutscheine, Karten, Katzenzeitung, generative Kunst) mit `tools/plotart/plotart.py` (nur
  Python-Standardbibliothek), prüft sie (`check_plot.py`: Stifte, Zeit, Text-Kollisionen) und rendert eine Vorschau
  (`preview.py --plot`: Texte mit Stiftwerks eigenem Schriftcode aus `src/core.js`, Hershey-Fonts aus `~/.cache`).
- Textbreiten in `tools/plotart/metrics.json` sind mit Stiftwerks Code gemessen (eingebaute Schrift + 4 Hershey-Fonts);
  ändert sich die Schrift-Engine, neu messen. Weiße Flächen ohne Kontur = Abdeckung (Import, `SWColor.isPaper`).

## Bedienkonzept
- Drei Schritte: **① Motiv** (Objekte, Blatt, Auswahl inkl. „Texte & Schriften“) → **② Stifte** →
  **③ Plotten** (Pre-Flight-Checkliste, Start/Pause/Abbrechen, Fortschritt, Erweitert: Tempo/Optimierung/G-Code).
  Maschinen-Kram (Verbinden, Einrichten-Assistent, Steuerung, Einstellungen, Konsole) in der **Maschine**-Schublade.
- Design „Nordic hygge“: Off-White, Birke, Waldgrün (Aktionen), Rosé (nur Deko), Anthrazit; DM Serif Display /
  DM Sans / DM Mono; hell + warmes Dunkel. Tokens in `src/css/00-tokens.css`.
- Undo/Redo global (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z); jede Dokumentänderung über `invalidate()` = ein Schritt.
- **Ablauf/Vorschau & Live-Ansicht**: `lib/60-timeline.js` kennt jede Bewegung (Leerfahrt, Stift ab/auf, Zeichnen,
  Stiftwechsel-Pause) mit Dauer in G-Code-Reihenfolge; `app/55-playback.js` hält den Abspielkopf. Scrubben und
  „Abspielen“ (1×/5×/20×/100×, Leertaste in ③) zeichnen die aktuelle Linie stufenlos. Beim Plotten folgt der Kopf dem
  echten Stift: GRBL-Statuspositionen (5/s) werden auf die Timeline gelegt und dazwischen interpoliert – nie weiter als
  die quittierten Zeilen (GRBL quittiert bis zu 15 Blöcke im Voraus). Live-Zeile „Zeichnet Linie i von n“, Glühen um die
  aktuelle Linie, „Ansicht folgt dem Stift“.
- **Größe & Position geplotteter Texte**: `textStyle[el].k` (Faktor um den Ankerpunkt) und `dx/dy` (mm); im Textpanel
  einstellbar, „An Original anpassen“ (Breite wie die Original-Schrift), ausgewählten Text auf dem Blatt ziehen oder mit
  Pfeiltasten schieben (0,5 mm, Shift 5 mm).

- **Verdeckte Linien**: Beim SVG-Import bekommt jede Form die Malreihenfolge (`z`), jede deckend gefüllte Form wird ein
  „Verdecker“ (`src.occ`). Mit `it.occlude` (Inspector „Verdeckte Linien weglassen“, beim Import an, wenn etwas verdeckt
  wird) entfernt `SWJob.itemPolys` alles, was unter später gemalten Flächen liegt (`lib/15-geo.js`, gerade/ungerade).
  Das Ticket-Beispiel hat keine Füllungen – dort greift das nicht.
- **SVG-Import** außerdem: `<use>`/`<symbol>` werden aufgelöst, `clip-path` schneidet Linien, `<image>` → Hinweis,
  Fett/Kursiv aus `font-weight`/`font-style` → `textStyle[el].bold/italic` (Fett = doppelter Strich, Kursiv = 12°).
- **Freie Drehung & Spiegeln**: `it.rot` 0…360°, `it.flipX/flipY`; `(x, y)` = linke obere Ecke der gedrehten Box
  (`SWJob.itemFrame/itemAffine`); `rotateItem`, `flipItem` (`24-items.js`).
- **Anordnen** (`34-arrange.js`): Mehrfachauswahl (Shift/Cmd-Klick, Cmd/Ctrl+A) in `selMore`, gemeinsames Ziehen mit
  Einrasten an Blatt, Rand, Mitte und anderen Objekten (Alt = frei), Ausrichten, Verteilen, Reihenfolge, Kopien im
  Raster (`makeCopies`, optional Schnittmarken als eigenes Objekt).
- **Muster** (`lib/45-gen.js`, `32-gen.js`): Objekte `type: 'gen'` mit `gen = { kind, params, font, color }` –
  Rahmen, Raster, Spirale, Rosette, Lissajous, Kalender, Namenskarten; bleiben bearbeitbar (`updateGen`).
- **Stift-Bibliothek** (`lib/55-penlib.js`, `58-penlib.js`): echte Stifte dokumentübergreifend (`stiftwerk:penlib`);
  ein Dokument-Stift mit `.lib` plottet mit eigenem Tempo, Absenktiefe/Servo-Wert, Pause und Strichbreite
  (Ebenen tragen dann `L.S`, das Stats, Timeline, G-Code und Plot benutzen).
- **Dokumente** (`92-docs.js`): das offene Dokument wird automatisch in IndexedDB (`stiftwerk` → Store `docs`)
  gespeichert, „Meine Dokumente“ listet alle (Index `stiftwerk:docs`). Projektdatei `.stiftwerk.json` (`lib/70-project.js`)
  enthält auch eigene Schriften; Öffnen per Menü oder Drag & Drop legt ein neues Dokument an. Muster werden ohne ihre
  Linien gespeichert und beim Öffnen neu erzeugt.
- **Rahmen abfahren & Weiterplotten** (`80-plot.js`): Rahmen um alles Geplottete mit Stift oben. Nach einem Abbruch
  merkt sich `resumeAt` die Stelle (aus der Live-Ansicht) und den Werkstück-Versatz (WCO); „Weiterplotten ab Linie N“
  stellt den Nullpunkt per `G92` wieder her (GRBL löscht G92 beim Soft-Reset; die Maschinenposition bleibt), wenn die
  Verbindung dieselbe ist. Aus der pausierten Vorschau: „Ab hier plotten“. `SWJob.resumeLayers` schneidet die Pfade,
  Punktnummern bleiben die des ganzen Pfads (`p.k0`).

## Datenmodell (Kurzfassung)
- Stifte: `doc.penMode` `'single'|'multi'`, `doc.single`, `doc.pens[]`; Designfarben `layerMeta[key]` mit
  `pen`, `enabled`. **Ein Stift** = alles in einer Farbe ohne Stiftwechsel/M0. Mehrere Stifte: Farben frei
  Stiften zuordnen; fast gleiche Farben (OKLab ≤ 0,05 oder beide „Tintenschwarz“) teilen sich automatisch einen
  Stift (z. B. #000000 und #1d2433). Neue Installation startet mit einem Stift.
- SVG-`<text>`: pro `<text>`-Element `it.textStyle[el] = { mode: 'svg'|'plot', font }` – Original-Schrift wird
  nur angezeigt, geplottet wird erst in einer Plotter-Schrift; Schrift **pro Text** wählbar mit Live-Vorschau,
  „Vergleichen“, Zurücksetzen. Schriftquellen in IndexedDB (Fallback localStorage).
- Persistenz localStorage `stiftwerk:{items,layers,doc,page,settings,lang,machines,penlib,docs,curDoc,snap}`; v1→v2-Migration beim Start
  (Backup `*.v1`). Automatische Namen werden nicht gespeichert (folgen der Sprache).

## Plotter-Profile (GRBL-Familie)
- Ein **Profil** ist ein flaches JSON-Objekt mit denselben Schlüsseln wie `S` (Plot- und Maschinenwerte wie `machW`,
  `machH`, `invY`, `penUp`, `penDown`, `drawF`, `baud`, `bootWait`) plus `id`, `name`, `template` und `penType`:
  `'z'` (Stift an der Z-Achse), `'servo'` (`M3 S…` = unten, `M5` = oben) oder `'gcode'` (eigene Codes
  `penUpCode`/`penDownCode`). Typen und Grenzen stehen in `SWMachine.FIELDS`.
- `SWMachine` (`src/lib/05-machine.js`, rein, in Node getestet): `TEMPLATES` (iDraw 2.0 A4 und A3, GRBL Z- und
  Servo-Stift, FluidNC-Servo, grblHAL-Z, „Eigener Plotter“), `validate(p)` (klemmt und prüft jeden Wert, auch Importe),
  `fromTemplate`, `fromLegacySettings` (die Einstellungen von vor den Profilen werden ein iDraw-A4-Profil),
  `detect(text)` (Banner oder `$I` → `{ family, template }`, `null` = kein GRBL), `workArea(S)`, `parseSettings`
  (`$130`, `$131`, `$132`, `$32` aus einer `$$`-Antwort), `pick(S)`.
- Gespeichert wird `stiftwerk:machines` = `{ list, active }`. Das aktive Profil kopiert `machineApplied()` nach `S`;
  alle anderen Stellen lesen weiter `S.*`. `workArea()` (`05-settings.js`) ist der Arbeitsbereich nach Achsentausch;
  ein Blatt „Wie Arbeitsbereich“ (`page.fmt === 'machine'`) folgt ihm.
- Stift-G-Code und Zeit: `SW.penLines(p, 'up'|'down')` und `SW.penTime(p, 'up'|'down')` (core.js; Zeit für die Dauer-Schätzung).
- Profil-API in `src/app/06-machines.js`: `activeMachine()`, `machineList()`, `switchMachine(id)` (nicht während eines
  Plots), `addMachine(profile, activate)`, `addMachineFromTemplate(id)`, `duplicateMachine(id)`, `removeMachine(id)`
  (das letzte Profil bleibt), `renameMachine`, `resetMachineToTemplate`, `exportMachine` / `importMachine` (JSON-Datei).
  Jede Änderung speichert und sendet `SWUI.emit('profile', aktivesProfil)`.
- Erkennung nach dem Verbinden: `serial.connect()` (`70-serial.js`) wertet Banner und `$I` mit `SWMachine.detect` aus.
  Passt die Familie nicht zum aktiven Profil, schlägt `machineDetected()` per Toast ein vorhandenes oder neues Profil
  vor. Die Familie steht danach in `serial.family`.
- `serial.query(cmd)` schickt einen Befehl und sammelt die Zeilen bis zum `ok` (z. B. `$$`; Timeout 4 s).
- Kein GRBL: Kommt auf `$I` weder ein `ok` noch ein Banner, wirft `connect()` `NOTGRBL`, und `71-conn-ui.js` zeigt
  „Kein GRBL-Plotter gefunden“. Boards, die beim Öffnen nicht booten, setzen `bootWait: false`.
- Watchdog: Wird eine Zeile gesendet und 10 s lang nicht quittiert, obwohl der Plotter im Leerlauf steht, gilt sie als
  verloren (`serial.stalled()`); der Plot bricht dann ab.
- Verbindungsabriss (z. B. Laptop im Ruhezustand → USB weg): `serial.health()` (bei jedem Status-Poll) erkennt
  „keine Antwort auf `?` seit 4 s“ (nur beim Plotten / offenen Zeilen, nicht im `$SLP`) und Ruhezustand (Wanduhr springt
  weiter als `performance.now()`); Schreibfehler, Ende des Lesestroms und `disconnect` führen ebenfalls zu
  `serial.lost(grund)` → Port zu, Plot endet, `plotInterrupted()` erklärt die Schritte (neu verbinden, Nullpunkt oben
  links, „Weiterplotten ab Linie N“). Ein Banner ohne eigenen Soft-Reset = Neustart der Platine (`serial.boots++`):
  Position/Nullpunkt verloren, kein Wiederherstellen per WCO. Der Weiterplot-Punkt überlebt ein Neuladen
  (`stiftwerk:resume`). Während des Plots hält ein Screen Wake Lock den Bildschirm an.
- Simulator-Fehlerfälle: `__fakeGrbl.die() / revive() / reboot() / breakWrites() / unplug()`.

## Referenzgerät iDraw 2.0: Protokoll (recherchiert und gemessen)
- iDraw 2.0: Board **DrawCore V2**, Firmware **GRBL 1.1h**, USB-Seriell (WCH, VID 0x1A86/PID 0x8040),
  Standard **115200 Baud**. iDraw 1.x nutzte das EBB-Protokoll (AxiDraw) – wird nicht unterstützt, die App
  erkennt es und meldet das.
- Was die Inkscape-Erweiterung sendet (mitgeschnitten, github.com/sihil/christmas2023):
  `$H` Referenzfahrt; mm ohne explizites G21; XY **relativ** (`G1G91X..Y..`), Stift über
  **Z absolut**: oben `G1G90 Z0.5F20000`, unten `G1G90 Z5.0F5000`; Zeichentempo `F2000`,
  Leerfahrt `F8000`; am Ende `$SLP` (Motoren aus). vpype-Profil: `vertical_flip = true` → Y-Achse invertiert.
- **Am echten A4-Gerät gemessen (2026-10-10):** Banner `Grbl 1.1h DrawCore V2.12`, `$I` →
  `[VER:1.1h DrawCore V2.12.20240704:]` `[OPT:VZHDL,15,128]` (L = keine Homing-Sperre, bootet Idle).
  `$3=1 $10=1 $22=1 $100=100 $101=100 $102=85.8 $110..112=15000 $130=210 $131=297 $132=10`.
  Status-Reports wie Standard-GRBL: `<Idle|MPos:…|FS:0,0|WCO:…>`. Jede Zeile bekommt genau ein `ok`.
- **Öffnen des Ports startet die Platine neu** (Banner nach ~1,2 s, Position danach 0) – auch in Firefox.
  Alles, was vorher gesendet wird, geht verloren → `serial.connect()` wartet aufs Banner; ein Banner mitten
  in der Sitzung verwirft alle offenen Zeilen (sonst verrutscht die ok-Zuordnung und der Plot hängt).
- Stiftwerk nutzt absolute Koordinaten relativ zu `G92 X0 Y0` (Startpunkt = obere linke Blattecke),
  Achsumkehr/Tausch einstellbar, Streaming per GRBL-Zeichenzählung (Puffer 120 von 128) oder Zeile-für-Zeile.
  Echtzeit: `?` Status, `!` Halt, `~` weiter, `0x18` Reset. G-Code-Kommentare sind ASCII-Englisch.

## Wichtige Entscheidungen
- Gemütliches Zuhause-Gefühl, warme kurze Texte („du“); Englisch in amerikanischer Schreibweise.
- Hershey-/EMS-Schriften kommen von jsDelivr (`npm/hersheytext/svg_fonts`) – funktioniert; Fallback: eigene
  SVG-Schrift laden (Inkscape: `share/inkscape/extensions/svg_fonts`) oder eingebaute Schrift (kann Hangul, ★).

## Offene Punkte
- Noch nicht an echter Hardware geprüft: neuer Einrichten-Assistent (Achsen-Check), Aufwecken nach `$SLP`
  (Reset + `$X`), Pause/Abbrechen im neuen UI. Achsrichtungen/Startpunkt-Ecke ebenfalls ungeprüft.
- Profile für FluidNC, grblHAL und Servo-Stifte sind nur gegen den Simulator (`?fake=…`) geprüft, nicht an Hardware.
- Einstellungs-Hinweise (`settings.*.hint` in `src/i18n/*/settings.js`) nennen noch den iDraw 2.0 als Beispiel.
- Rasterbilder im SVG werden übersprungen (Hinweis). Schraffuren werden nicht verdeckt (Füllungen ohne z).
- Weiterplotten nach einem Abbruch ist nur im Simulator geprüft: ob DrawCore nach `0x18` die Maschinenposition behält
  und WCO meldet, muss am echten Gerät getestet werden.
