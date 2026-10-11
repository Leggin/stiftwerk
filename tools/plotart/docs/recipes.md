# Recipes

Each recipe gives a layout, the content to write and the traps to avoid. Sizes are in mm. "Accent" means the second
pen colour. Time estimates assume Stiftwerk's iDraw defaults.

## Gift voucher / birthday voucher (A6 landscape, 2 pens, 2–5 min)
A working example is `examples/voucher.py`.
- **Shape.** A `ticket` or `double` border, with a tear-off stub on the right (about 26 mm wide, `perforation`). The
  stub holds a rotated "HAPPY BIRTHDAY" or "No. 001", plus two stars.
- **Left text column, about 60 % of the width:**
  - the title in `script`, accent colour, size 14–18 ("Gutschein", "Voucher");
  - the gift as one or two lines of `sans`, size 4.5–5 ("für einen Kinoabend mit Popcorn");
  - write-in lines labelled "für" and "von", or pre-filled names in `script`;
  - small print at size 2.6.
- **Right of the column:** one hero illustration group. Ideas:
  - balloons and a gift;
  - cake and candles;
  - a motif that matches the gift (film reel, coffee cup, plant, ticket stars);
  - a cat holding a sign.
- **Confetti** goes around the illustration only. `reserve()` the text column first.
- **Content ideas:** a breakfast in bed, one day free of chores, a concert, a cooking class, "one wish of your
  choice", a trip together. Small print with a wink: "Valid until used up. Not exchangeable for broccoli."
- **Traps:**
  - The title too close to the perforation.
  - An illustration that touches the text. The checker warns about it.
  - More than 3 colours.

## Greeting card (A5 folded to A6, or a single A6)
- For a folded card, draw only the **front panel** (A6 portrait) as its own sheet. The inside is a second sheet.
  Plotting both sides means turning the paper over and setting the zero point again.
- **Front:** a big motif (`cat_sitting`, `cake`, `flower` bouquet, `bunting` across the top). Add a short greeting
  in `script`, size 10–14, centred in the lower third or in a `ribbon`.
- **Inside:** a centred message in `script` or `serif`, size 5–6, `text_block(align='center')`, plus a small motif
  above it and the signature bottom right.
- **Christmas:** stars, snowflakes (`s.star(points=6, inner=.3)` plus lines), a tree (stacked triangles with covers).
- **Wedding or anniversary:** `deco` or `rounded` border, `serif` and `script`, two hearts overlapping (covers),
  laurel made from `ellipse` leaves along an `arc`.

## Invitation (A6 or A5)
- **Hierarchy:** what (title), then who, when and where (three short lines), then RSVP small print.
- The date and time block works well in `serif` capitals, with `rule(style='dotted')` lines between the items.
- `bunting` across the top edge, confetti in the corners, a `ribbon` with the occasion.

## Place cards / name tags (Card 85 × 55 or folded 90 × 100)
- Many names: make one sheet per page and lay the cards out in a grid. Read `SIZES['Card']`, and cut marks are
  short lines at the corners. Or use Stiftwerk's own **Namenskarten** generator and the **Kopien** feature for
  identical cards.
- A folded tent card: draw the name in the lower half, upside up, and the fold line dashed in the middle. For the
  back, rotate the text 180° (`rot=180`).
- Each name with `fit_text(max_size=12, family='script')`, plus a small motif (heart, flower, paw).

## Bookmark (50 × 180)
- Portrait. A tall motif such as a sleeping cat at the bottom, a stack of books, or a flow field. Add a quote in
  `script`, size 4–5, `text_block(align='center')`, and a hole marker circle at the top (r 2.5).

## Cat newspaper (A4 portrait, 1 pen, 30–45 min)
A working example is `examples/cat_newspaper.py` ("The Daily Whisker").
- **Masthead:** the name in `gothic`, about 26 (`fit_text`), paw prints at the left and right. Below it an issue line
  between double rules: "Vol. IX · No. 42 · Tuesday … · Price: one fish".
- **Lead story:**
  - a headline in `serif` capitals across the page, plus a subheadline in italic;
  - the body flows over two columns (`flow_text`, `serif` 3.1 or `sans` 3.2 for half the plot time);
  - the third column holds a framed picture (a cat in a box, a cat with a fish), a caption in italic, and
    "IN BRIEF" items separated by dotted rules.
- **Lower half:** a second story over two columns, plus a boxed **weather** report (sun and cloud: "Sunny spots on
  the sofa until 3 pm").
- **Bottom:** CLASSIFIEDS in three boxes (FOR SALE / WANTED / LOST) with fish at the edges.
- **Content:** write proper, funny cat journalism with quotes, numbers and an official tone. Topics:
  - a box arrives;
  - the red dot escapes;
  - the vacuum cleaner is spotted;
  - the 5 am breakfast strike;
  - a sunbeam moves;
  - the dog doesn't understand;
  - a new sofa is "tested";
  - a cat show results;
  - horoscope ("Leo: knock something off a table today").
- **Fit the text with `s.capacity(box, size, family)`:** write the content to that length, then check the
  `flow_text` overflow. If space is left, add a pull quote ("It is exactly my size.") and a small motif.
  Don't stretch the font size.
- **German version:** "Der Tägliche Schnurrbart" / "Die Pfotenpost", "Kurz notiert", "Wetter", "Kleinanzeigen".

## Poster / typographic print (A4–A3)
- One giant word or name with `fit_text` across the width, in `gothic` or `script`, plus a hatched shape or
  `ridgelines`/`flow_field` as the background, with a `rect(cover=True)` panel behind the text.
- **Quote posters:** `text_block` centred, mixed sizes (key words bigger, as separate `text()` lines), and rules
  between the lines.

## Calendar
- Stiftwerk has a **Kalender** generator (Muster & Vorlagen): month grid, title, first weekday, plotter font.
  For a custom calendar, build the grid with `rect`, `rule` and `text` from `calendar.monthcalendar`, and give each
  month a motif.

## Generative art (any size, 1–3 pens)
- **`flow_field`:** hundreds of curved lines following a smooth field. Use 2–3 pens with different seeds and boxes.
- **`truchet`** (arcs or diagonals): tile patterns. Cell size 6–12 mm.
- **`ridgelines`:** "Unknown Pleasures" mountains. Each row covers the rows behind it.
- **`spiral`, concentric circles, moiré:** two sets of circles with slightly different centres.
- **Spirograph:** Stiftwerk's **Rosette** generator, or your own hypotrochoid with `polyline`.
- **Time:** 1000 lines of 40 mm is 40 m, about 20+ min. Check the report.

## Making illustrations look good
- Build from a few smooth curves (`C` beziers) with round joins. Fewer lines read better than more.
- Faces: two eyes (ellipses or happy arcs), a tiny nose and a "w" mouth.
- Use covers for overlaps instead of computing intersections: draw the back object first, then the front object
  with `cover=True`.
- Shading: hatch at 45°, spacing 1–1.2 mm, inside a closed shape (`s.hatch(rings)`); cross-hatch for darker areas.
- Keep the stroke style consistent: don't mix tiny details with huge motifs in the same piece.
