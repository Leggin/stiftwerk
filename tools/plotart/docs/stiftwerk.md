# How Stiftwerk treats an SVG

Stiftwerk is the browser app that drives the plotter (`dist/stiftwerk.html`). You
drag the SVG onto it, or use *Hinzufügen → SVG öffnen*. What happens next:

| SVG | In Stiftwerk |
|---|---|
| `width="148mm" height="105mm"` with a `viewBox` in mm | Real size. The object keeps its position on the sheet when Stiftwerk's sheet has the same format. Pick the format under *Blatt* first. If the SVG is larger than the sheet, it is shrunk to fit. |
| `stroke` colour | One **design colour** each. Colours become pens in step ② (*Stifte*). Near-identical colours (#000 and #1d2433) share a pen. In *Ein Stift* mode everything is plotted with one pen. |
| `fill` without stroke, non-white | Its **outline** is drawn in the fill colour. Areas can be hatched under *Flächen schraffieren* in the inspector. |
| `fill="#ffffff"` (or near-white) without stroke | A **cover**: never drawn. It hides lines painted before it, beneath it ("Verdeckte Linien weglassen", on by default when something is covered). Only **closed** subpaths (ending in `Z`) count. |
| `<text>` | Kept as text, shown in the original font, **not plotted** until converted under *Texte & Schriften*, per text or all at once. Stiftwerk guesses the plotter font from `font-family`: Hershey Sans/Serif/Script/Gothic English for the names plotart writes, script-like names → Script, Times/Georgia… → Serif, everything else → the built-in font. Size and position can be adjusted per text, and *An Original anpassen* matches the width. |
| `font-weight` ≥ 600 / `font-style: italic` | Bold = a doubled stroke, italic = 12° slant. Both can be switched per text. |
| `stroke-dasharray` | Real dashes. |
| `<use>`, `<symbol>`, `clip-path`, transforms, CSS classes | Supported. |
| `<image>`, gradients, filters, masks, `opacity` < 0.5 fills | Skipped. Images get an import note. |
| Hangul | Built-in font only. |

## After importing
1. Check the sheet format and the position. Optionally use **Rahmen abfahren** in step ③: the pen traces the frame
   of the drawing with the pen up.
2. **Texte & Schriften:** convert the texts. "Alle umwandeln" is fine if the guessed fonts are right.
3. Step ②: a new document starts in *Ein Stift* mode (everything one colour). For a multi-colour design, switch
   to *Mehrere Stifte*: every design colour gets a pen. Pens from *Meine Stifte* carry their own speed and
   pressure.
4. Step ③: plot. Several pens means the app pauses for each pen change. A cancelled plot can continue with
   **Weiterplotten ab Linie N**.

## Limits worth knowing
- The plotter work area of the iDraw 2.0 A4 is 210 × 297 mm. Other machines use their profile.
- Stiftwerk's own generators (*Muster & Vorlagen*: border, grid, spiral, rosette, Lissajous, calendar, name cards)
  and *Kopien* with cut marks can replace hand-written code for simple pieces.
- Plot time in Stiftwerk is exact. Our report estimates it within about ±25 %.
