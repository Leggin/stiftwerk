# Stiftwerk – contract for parallel work

Read this before touching code. It describes how the app is put together, what you may change, and how your work plugs
into shared surfaces without editing other people's files.

## 1. Build and runtime

- `python3 build.py` → `dist/stiftwerk.html` (local file, real plotter), `dist/stiftwerk.artifact.html`.
  `python3 build.py --dev` also writes `dist/stiftwerk.dev.html` with `tools/fake-grbl.js` (a **simulated** plotter).
- `npm test` runs all `test/*.test.js` (includes a build + syntax check of the generated scripts). Must stay green.
- `src/index.html` is the skeleton. Marker lines are replaced by the **sorted** concatenation of:
  `src/css/*.css` → `<style>`, `src/html/*.html` → body markup, then four `<script>` blocks in this order:
  1. `src/core.js` (`SW`: geometry, fonts, G-code)
  2. `src/lib/*.js` (pure, Node-testable: `SWColor`, `SWPens`, `SWJob`, `SWText`, `SWUndo`, `SWMigrate`)
  3. `src/i18n/i18n.js` + `src/i18n/de/*.js` + `src/i18n/en/*.js` (`I18N`)
  4. `src/app/*.js` – **all app fragments share ONE function scope** (one IIFE). Consequences:
     - two fragments must never declare the same top-level name (the build test fails on duplicates);
     - prefer `function` declarations and listeners registered at load time; code runs in file-name order;
     - prefix your new top-level helpers when the name could be generic (`pnRender`, `txPick`, `mcWizard` …).
- Browsers: Chrome/Edge and **Firefox 155** (the user's browser, native Web Serial). Standard web APIs only.
- Never open a real serial port. For plot flows use the dev build: `window.__fakeGrbl` exposes `sent`, `lost`, `reset()`.
  `?fake=<firmware>` picks the simulated firmware: `drawcore` (default), `fluidnc`, `grblhal`, `plain`, `silent`.

## 2. Data model (all plain JSON, persisted in localStorage)

- `items[]` – objects on the sheet:
  - common: `{ id, type: 'svg'|'text'|'test'|'gen', name, nameKey?, sample?, visible, scale, rot (0…360, clockwise), flipX?, flipY?, x, y, hatch:{on, spacing, angle}, src }`.
    `(x, y)` is the top-left of the rotated bounding box; transform: `SWJob.itemFrame/itemAffine/xf`, size `itemSize(it)`, box incl. plotted text `itemBox(it)`.
  - `src = { paths:[{layer, pts, z?}], fills:[{layer, rings}], w, h, texts?, occ? }` in item-local mm. **`src` is replaced, never mutated** (undo shares it).
    `z` = paint order from the SVG, `occ = [{ z, rings }]` = opaque filled shapes; with `it.occlude` the hidden parts are removed
    (`SWJob.itemPolys(it, plottedTextPolys)` – use it wherever an item's lines are needed).
  - `type:'gen'`: `gen = { kind, params, font, color }` (replaced, never mutated); `src` is made by `genSource(it)`; change with `updateGen(it, patch)`.
  - `type:'text'`: `text:{ str, size, line, align, slant, color }`, `font` (font id). `src` is regenerated with `textSource(it)`.
  - `type:'svg'` with `<text>`: `src.texts[i]` = runs `{ str, x, y, M, fs, ls, anchor, layer, color, family, weight, style, paint, el }`;
    `el` = index of the `<text>` element. `it.textStyle[el] = { mode: 'svg'|'plot', font, k?, dx?, dy?, bold?, italic? }` – **replace via `setTextStyle()`**, never mutate.
  - display name: `itemName(it)` (samples have `nameKey` and follow the language).
- `layerMeta[key]` – a design colour (stroke/fill hex, or `L:<name>` for Inkscape layers): `{ name|null, color, enabled, order, pen }`.
  `name: null` = automatic → `colorLabel(key)` ("Schwarz", "Schwarz 2"). `enabled:false` = never plotted (ghost preview).
- `doc` – pens: `{ v:2, penMode:'single'|'multi', single:{name|null, color, lib?}, pens:[{id, name|null, color, manual?, lib?}], nextPen }`.
  `lib` = id of a pen in the pen library (`penLib`, `58-penlib.js`: `libAdd/libUpdate/libRemove/libLink/libFromPen/libExport/libImport`).
  Library: `SWPens` (`assignNew`, `plan`, `setMode`, `assign`, `movePen`, `removePen`, `mergePens`, `suggestions`, `visiblePens`, `penColorFor`, `newPen`).
  Label: `penLabel(pen)` (or `penLabel(doc.single)`). Preview colour of a design colour: `penColorFor(key)`.
- `page` – `{ fmt, orient, w, h, cw, ch, margin }`. `fmt` is a key of `FORMATS` (`10-state.js`), `'custom'` (cw × ch) or
  `'machine'` (the sheet is `workArea()`, orientation fixed). `S` – machine/plot settings (`05-settings.js`, saved with `saveS()`).
- `machines` – `{ list:[profile…], active:id }` (localStorage `stiftwerk:machines`). A **profile** is a flat JSON object with the keys
  of `SWMachine.FIELDS` (`src/lib/05-machine.js`): the keys of `S` (`machW`, `penUp`, `drawF`, `bootWait` …) plus
  `id, name, template, penType: 'z'|'servo'|'gcode'`. `machineApplied()` copies the active profile into `S`; read `S.*`, never the list.
  `SWMachine` (pure, Node-tested): `TEMPLATES`, `validate(p)`, `fromTemplate`, `fromLegacySettings`, `detect(text)` (banner or `$I` →
  `{family, template}`, `null` = not GRBL), `workArea(S)`, `parseSettings` (`$130/$131/$132/$32`), `pick(S)`.
- `job` (derived, `getJob()`): `{ layers, plotLayers, clipped, unconverted, stats, total, cum, cumTotal, colorLengths: Map(key→mm), usedKeys }`.
  `layers[i] = { key, pen, name (display label), color, keys:[design colours], enabled, ghost?, single?, paths, base, S?, width? }`
  (`S` = settings of a library pen – use `L.S || S` when generating G-code or times; `width` = its line width).
  One plot layer per pen, in pen order. Ghost layers = disabled colours (preview only).
- `selId` – selected item id (the inspector shows it); `selMore` – Set of further selected ids; `selectedItems()`, `isSelected(id)`,
  `toggleSelect(id)`, `selectAll()` (`34-arrange.js`). Arranging: `alignSelected`, `distributeSelected`, `orderSelected`, `makeCopies`, `copiesPlan`, `setSnap`.
- Documents (`92-docs.js`): `docIndex`, `curDocId`, `docName()`, `docNew()`, `docOpen(id)`, `docRename`, `docDuplicate`, `docDelete`,
  `docSaveNow()`, `projectSave()`, `projectOpen(text, name)`; event `'docs'`. Plot extras (`80-plot.js`): `traceFrame()`,
  `startPlot({ from: { g, k } })`, `resumePoint()`, `previewPoint()`.

### Changing the document
- After **every** user change: `invalidate()` (debounced rebuild) or `invalidate(true)` (immediate). This rebuilds the job,
  saves (debounced 400 ms) and records an **undo step**. Changes not made by the user (font finished loading, migration):
  `invalidate(true, { sys: true })` – no undo step.
- Undo/redo: `undo()`, `redo()`, `history.canUndo`, `history.canRedo`; event `'history'`. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are bound.
- While a plot runs (`plotting === true`, `body.plotting`), editing must be blocked; undo/redo already refuse.

## 3. Registry and events (`src/app/01-registry.js`)

| API | Use |
|---|---|
| `SWUI.inspector.register({ id, order, applies(it), render(it)→html, bind(it, root), light?(it) })` | sections of the selection panel (`renderProps`). Current: basics 10, textItem 20, svgTexts 30, hatch 40, actions 90 |
| `SWUI.preflight.register({ id, order, check()→{ state:'ok'\|'warn'\|'block'\|'info', label, detail?, action?:{label, run} } })` | checklist above "Plot starten" (rendered by the plot step) |
| `SWUI.overlays.register({ id, order, clip?:false, draw(ctx) })` | canvas drawing on top of the content; `clip:false` = outside the sheet clip, after item frames. Use `view`, `toScr`, `dpr`, `mul`, `itemAffine` |
| `SWUI.beforePlot = async job => boolean` | pre-flight gate, awaited by `startPlot()` before anything is sent |
| `SWUI.on(ev, f)` / `SWUI.emit(ev, …)` | events below |
| `SWUI.onRender(f)` | called by `renderAll()` (language switch, undo/redo) |
| `SWUI.machine.open() / close() / isOpen` | the Maschine drawer |

Events: `'job'(job)` after rebuild · `'select'(id)` · `'conn'` connection/phase/banner changed (`serial.connected`, `serial.phase`
'off'|'starting'|'ready', `serial.banner`) · `'state'` GRBL status (`serial.state`, `serial.pos = {page:[x,y], mach:[x,y,z]}`, globals `pen`, `penDown`) ·
`'plot'(phase)` 'start'|'tick'|'pause'|'done'|'abort' (read `plotState`, `plotting`) · `'history'` · `'step'(name)` · `'machine'(open)`.
Also: `'origin'` (zero point or start mode changed, machine) · `'fonts'(id)` (a font finished loading) ·
`'preflight'` (re-render the checklist and step badges). Round 3: `'docs'`, `'penlib'`, `'arrange'` (snapping toggled), `'plot'` phases `'frame'`/`'frameDone'`. `'profile'(p)` (machine profiles changed: the list, the active profile or one of
its values; `p` = the active profile; the page panel and a `'machine'` sheet follow the work area).
Canvas: `'canvas:down'({mm, it, e})` after the click selected `it` (null = empty sheet) · `'canvas:move'({mm, e})` hover while not dragging ·
`'canvas:leave'`. `mm` = page millimetres.

Pre-flight checks are registered by whoever owns the knowledge: shell → `content` (something to plot), `area` (work area), `duration`;
pens → `pens`; texts → `texts` (unconverted texts, missing glyphs); machine → `connection`, `origin` (zero point set this session?).

**Core files** (change with care): `70-serial.js`, `80-plot.js`, `10-state.js`, `14-history.js`, `01-registry.js`, `src/lib/*`, `src/core.js`,
`src/i18n/i18n.js`, `build.py`. If you need something there, describe it in your report instead.

## 3b. Cross-module interfaces (implemented by the owner, usable by everyone)
- `toast(text, { action: { label, run } })` – optional action button (e.g. "Rückgängig" → `undo`). Owner: shell (`85-dialog.js`).
- `showDialog(html, resolve, { dismissible: false })` – Esc/backdrop do not close it (used by the pen-change dialog so Esc never aborts a
  running plot). Dialogs get `role="dialog"`, `aria-modal`, a focus trap and focus return. Owner: shell (`85-dialog.js`, `95-keys.js`).
- Pre-flight result may carry `confirm: true` → the gate (`SWUI.beforePlot`, owner: shell) asks once before starting, listing the label.
- Import notes: `importSVG(text, name)` returns `{ it, notes }` with `notes = [{ key, vars }]` (translated by the caller) and stores the
  same array as `it.notes` (shown as a dismissible "Hinweise" card in the inspector by the shell). Owner of the notes: texts (`30-import.js`,
  keys under `import.*` in the texts dictionaries).
- Canvas emphasis: an overlay may veil the content (`ctx.fillStyle` = sheet colour, low alpha) and redraw a subset on top – that's how the
  pens step highlights one pen without touching `50-canvas.js`.

## 4. Helpers you can use everywhere in `src/app`
`$`, `$$`, `esc`, `t`, `tn`, `tHtml`, `tnHtml`, `fmt(v, digits)`, `fmtInt`, `fmtTime`, `sleep`, `store`, `toast(text)`, `log(text, cls)`,
`showDialog(html, resolve)`, `closeDialog(v)`, `render()` (canvas, rAF-throttled), `rebuild()`, `getJob()`, `invalidate()`,
`select(id)`, `addItem(it)`, `removeItem(id)`, `itemName`, `itemSize`, `itemBox`, `xf`, `itemAffine`, `toScr`, `toMm`, `view`,
`penColorFor`, `colorLabel`, `penLabel`, `colorWord`, `layerOn`, `textStyleOf`, `textEls`, `setTextStyle`, `textCounts`,
`plottedTextPolys`, `fontFor`, `loadFont`, `fontName`, `fontCache`, `fontPending`, `FONT_LIST`, `customFonts`, `applyFont(it, font, els?)`,
`convertTexts(it, on, els?)`, `showStep(name)`, `renderAll()`, `SWText.*`, `SWPens.*`, `SWColor.*`.

Also available: `swIcon(name, cls)` / `data-icon` hydration (`02-icons.js`), `toast(text, { action, duration })` → `{ dismiss }`,
machine helpers `mcOpenSection(id)`, `mcOpenWizard(step)`, `mcZeroSet`; text helpers `txSel`, `textInfo(it)`, `textCoverage(str, fontId)`,
`resetTexts`, `fontSrcPut/Get` (IndexedDB font sources), `applyFont(it, font, els, convert)`.

Machine profiles (`src/app/06-machines.js`, the machines UI calls only these): `activeMachine()`, `machineList()`,
`switchMachine(id)` (refused while plotting), `addMachine(profile, activate)`, `addMachineFromTemplate(id)`, `duplicateMachine(id)`,
`removeMachine(id)` (the last profile stays), `renameMachine(id, name)`, `resetMachineToTemplate(id)`, `exportMachine(id)` /
`importMachine(text)` (JSON file), `machineApplied()`, `tplName(id)`, `machineDetected(text)`. Also `workArea()` (work area after the
X/Y swap, `05-settings.js`), `serial.query(cmd)` (the lines printed before the `ok`), `serial.family` (set after connect).

## 5. Strings and language (de + en)
- Every user-visible string goes through `t()` / `tn()` (plain text) or `tHtml()` / `tnHtml()` (inside HTML; values are escaped for you).
  Static markup: `data-i18n="key"`, `data-i18n-attr="aria-label:key;title:key"`, `data-i18n-html="key"`. Keep a German default text in the markup.
- Put your keys in **your own** dictionary files, both languages: `src/i18n/de/<area>.js` and `src/i18n/en/<area>.js`, identical keys and
  `{placeholders}`. Plurals: `key_one` / `key_other`, use `tn(key, n)`.
- German: warm, informal "du", short. English: **American spelling** (color, center, gray), sentence case, "you", contractions ok,
  no "please"/"successfully"/exclamation marks. Glossary: Stift → pen · Stiftwechsel → pen change · Ebene → layer · Motiv → design ·
  Leerfahrt → travel move · Nullpunkt → origin · oben links → top-left · Referenzfahrt → homing · Entsperren → unlock ·
  Motoren aus → motors off · Arbeitsbereich → work area · Blatt → sheet · Schrift → font · Plotter-Schrift → plotter font ·
  SVG-Schrift → SVG font / original font · Maschine → machine · Profil → profile · Vorlage → template · GRBL-Familie → GRBL family.
- Numbers through `fmt`/`fmtInt`/`fmtTime` (locale aware). G-code always uses `.` and ASCII.
- Re-render on language switch: register your render function with `SWUI.onRender(f)`.

## 6. DOM mount points (ids that other files rely on – keep them, or update every reference you own)
- Header `html/10-header.html`: `#app`, `#steps [data-step]`, `#langSwitch [data-lang]`, `#btnMachine`, `#machineDot`.
- Objects `html/20-aside.html`: `#objList`, `#btnOpen`, `#btnAddText`, `#btnAddTest`, `#fileIn`, `#fontIn` (font upload input, used by text fonts).
- Stage `html/30-stage.html`: `#stage`, `#cv`, `#fmtChip`, `#cursorChip`, `#zIn`, `#zOut`, `#zFit`, `#showTravel`, `#sim`, `#drop`.
- Panel `html/40-panel-open.html` … `69-panel-close.html` with step panes `[data-step-pane="motiv"|"pens"|"plot"]`:
  - ① `45-step-motiv.html`: `#pgFmt`, `#pgCustom`, `#pgW`, `#pgH`, `#pgOrient`, `#pgMargin`, `#pgWarn`, `#propSec`, `#selMeta`, `#props`.
  - ② `50-step-pens.html`: `#penList`, `#penCount`.
  - ③ `60-step-plot.html`: `#stats`, `#plotNotes`, `#plotBtns`, `#progWrap`, `#progBar`, `#progL`, `#progR`, `#s_drawF`, `#s_travelF`,
    `#s_penDelay`, `#s_optimize`, `#s_reverse`, `#s_joinTol`, `#s_simplify`, `#btnCopyG`, `#btnSaveG`.
- Machine drawer `html/70-machine-drawer.html`: `#machine`, `#machineClose`, `#connChip`, `#connText`, `#btnConnect`, `#stateChip`,
  `#jog`, `#jogPen`, `#jogStep`, `#posPage`, `#posMach`, `#cUp`, `#cDown`, `#cZero`, `#cGoZero`, `#cHome`, `#cUnlock`, `#cSleep`, `#cReset`,
  `#logAll`, `#console`, `#cmdForm`, `#cmdIn`, `#settingsBox`, `#btnResetSet`.
- Overlays `html/90-overlays.html`: `#svgHost` (hidden SVG measuring host – don't touch), `#modal`, `#dialog`, `#toast`.

## 7. CSS
- Tokens (`css/00-tokens.css`, light + dark): `--bg --surface --surface-2 --surface-3 --wood --wood-2 --table --ink --muted --line --line-strong
  --accent --accent-hover --accent-soft --on-accent --rose --rose-soft --rose-ink --sheet --sheet-edge --grid --rule --ok --warn --bad
  --f-display --f-body --f-mono --r-s --r-m --r-l --r-pill --sh-1 --sh-2 --sh-3 --ease`. Never hard-code colours; every rule must work in dark mode.
  Rose and wood are decorative only (low contrast) – never for text or the only signal of a state.
- Shared component classes (owned by the shell/design pass): `.btn` (+ `.primary .ghost .sm .big .danger .fill`), `.sec`, `.row`, `.fill`,
  `.hint`, `.empty`, `.field`, `.inp`, `.grid2`, `.seg` (buttons with `aria-pressed`), `.check`, `.note` (+ `.warn .bad`), `.chip`, `.dot`,
  `.list`, `.meta`, `.tag`, `.swatch`, `.stats`, `.bar`, `.prog`, `.modal`, `.dialog`, `.toast`, `.drawer`.
- Feature styles live in their own file with a class prefix: pens `css/60-pens.css` (`pn-`), texts `css/61-texts.css` (`tx-`),
  machine `css/62-machine.css` (`mc-`).
- Accessibility: visible focus (`:focus-visible`), labels bound to inputs, targets ≥ 32 px (≥ 40 px on touch), `prefers-reduced-motion`.

## 8. Areas
| Area | Files |
|---|---|
| Shell & design | `css/00-tokens` (refine values only, keep names) `10 15 20 30 40 50`, `html/10 20 30 40 45 60 69 90`, `app/50-canvas.js` (styling only), `52-canvas-input`, `60-objects`, `62-inspector`, `63-item-ops`, `64-page`, `65-steps`, `67-plot-ui`, `68-gcode`, `85-dialog`, `90-files`, `95-keys`, `99-boot` (render registration only); i18n `shell`, `inspector`, `files`, `gcode`, `plot`, `10-doc` |
| Pens | `app/12-colors.js`, `40-job.js`, `61-pens.js`, `81-pen-dialog.js`, `html/50-step-pens.html`, `css/60-pens.css`; i18n `pens` |
| Texts & fonts | `app/22-fonts.js`, `25-text-model.js`, `26-text-ui.js`, `30-import.js` (text loop + notes), `51-canvas-text.js`, new `27-…`/`53-…` files for text picking, `css/61-texts.css`; i18n `texts` (+ new `fonts`) |
| Machine | `html/70-machine-drawer.html`, `css/62-machine.css`, `app/05-settings.js`, `66-settings-ui.js`, `71-conn-ui.js`, `72-console.js`, `73-manual.js`; i18n `settings`, `conn`, `console`, `manual`, `serial` (texts only) |
| Machine profiles | `lib/05-machine.js` (`SWMachine`, frozen), `app/06-machines.js` (profile API, emits `'profile'`); the profile fields are read by the machine code through `S` |
| Machines UI | `app/07-machine-ui.js` (picker, "Dein Plotter" card, profile editor; calls only the 06 API; planned, not in the repo yet) |

Further files: shell `app/02-icons.js`; texts `app/27-text-pick.js`, `app/53-text-overlay.js`, `i18n/*/fonts.js`;
machine `app/74-wizard.js` (drawer ids `#mcWiz`, `#mcConnAdv`, `#mcBanner`, `#mcCard*` belong to machine).

Need something in another area's file? Prefer a registry or an event over editing it.

## 9. Definition of done (every change)
1. `npm test` green; no console errors in the dev build (desktop 1280×800, mobile 375×812, light and dark, `?lang=de`, `?lang=en`, `?lang=xx`).
2. Every new string in de **and** en.
3. Checked in the browser (serve `dist/` with `python3 -m http.server <your port> --directory dist`).
