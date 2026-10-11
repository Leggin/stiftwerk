"""plotart – plottable line-art SVGs for Stiftwerk / GRBL pen plotters. Python standard library only.

Units are millimetres, origin top-left, y grows downwards. Elements are kept in drawing order: later ones lie on top.
A *cover* (white fill, no stroke) hides every line drawn before it underneath – Stiftwerk removes those parts on
import ("Verdeckte Linien weglassen"), the preview renders them the same way, and report() accounts for it.

    from plotart import Sheet
    s = Sheet('A6', landscape=True, margin=6)
    s.border('double')
    s.text('Gutschein', s.w / 2, 30, size=12, family='script', anchor='middle', pen='red')
    s.balloon(30, 60, 9, pen='blue')
    s.save('voucher.svg'); s.report()

Everything a method draws is returned as an Element (kind 'line' | 'cover' | 'text', .bbox), so layouts can be
measured. Motif methods (balloon, cat_face …) put a cover behind themselves (cover=True) so they can overlap.
"""
import math
import random
import re
import xml.sax.saxutils as sx

# ---------------------------------------------------------------- sheets, pens, fonts
SIZES = {  # portrait (w, h) in mm
    'A6': (105, 148), 'A5': (148, 210), 'A4': (210, 297), 'A3': (297, 420), 'C6': (114, 162), 'DL': (110, 220),
    'Letter': (215.9, 279.4), 'Square': (148, 148), 'Bookmark': (50, 180), 'Card': (85, 55),
}
PALETTE = {'black': '#1d2433', 'red': '#d22b2b', 'blue': '#1f5fbf', 'green': '#2e7d4f', 'orange': '#e8781e',
           'pink': '#e05a9a', 'purple': '#7a3fb0', 'gold': '#b8860b', 'brown': '#7b4a2a', 'grey': '#8a8a8a', 'teal': '#14837b'}
# font-family values Stiftwerk maps to its plotter fonts (22-fonts.js guessFont); the generic fallback is for previews
FAMILIES = {'sans': 'Hershey Sans, sans-serif', 'serif': 'Hershey Serif, serif', 'script': 'Hershey Script, cursive',
            'gothic': 'Hershey Gothic English, fantasy', 'plain': 'Stiftwerk, sans-serif'}
# advance widths per font, in cap heights – measured with Stiftwerk's own font code (metrics.json): 'plain' = the built-in
# font, the others = the Hershey fonts Stiftwerk picks for these font-family names. track = extra space between letters.
import json as _json, os as _os
with open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'metrics.json'), encoding='utf-8') as _f:
    METRICS = _json.load(_f)
ADV, TRACK = METRICS['plain']['adv'], METRICS['plain']['track']   # the built-in font (also used by preview --plot)
CAP = 0.7      # Stiftwerk: cap height = 0.7 × font-size


def text_width(s, size, family='sans', spacing=0.0):
    """width in mm of one line at font-size `size` (mm), as Stiftwerk draws it in the plotter font for `family`
    (sans / serif / script / gothic = Hershey fonts, plain = Stiftwerk's built-in font)"""
    s = str(s)
    if not s:
        return 0.0
    m = METRICS.get(family, METRICS['sans'])
    adv, tr = m['adv'], m['track']
    fallback = 1.0 if family != 'plain' else 0.6
    units = sum(adv.get(c, 1.0 if ord(c) > 0x2e80 else fallback) for c in s) + tr * (len(s) - 1)
    return units * CAP * size + spacing * (len(s) - 1)


def has_hangul(s):
    """Korean letters – only Stiftwerk's built-in font can draw them (same ranges as Stiftwerk)"""
    return any(0x1100 <= ord(c) <= 0x11ff or 0x3130 <= ord(c) <= 0x318f or 0xac00 <= ord(c) <= 0xd7af for c in str(s))


def color_of(pen):
    if pen is None:
        return PALETTE['black']
    if isinstance(pen, str) and pen.startswith('#'):
        return pen.lower()
    if pen in PALETTE:
        return PALETTE[pen]
    raise ValueError(f'unknown pen {pen!r} – use a PALETTE name or a #hex colour')


# ---------------------------------------------------------------- geometry
class Box:
    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h

    @property
    def x1(self): return self.x + self.w
    @property
    def y1(self): return self.y + self.h
    @property
    def cx(self): return self.x + self.w / 2
    @property
    def cy(self): return self.y + self.h / 2

    def inset(self, d, dy=None):
        dy = d if dy is None else dy
        return Box(self.x + d, self.y + dy, self.w - 2 * d, self.h - 2 * dy)

    def split_x(self, *fractions, gap=0.0):
        """columns: split_x(.3, .7) → two boxes 30 % / 70 % wide (gap between them)"""
        tot, out, x = sum(fractions), [], self.x
        free = self.w - gap * (len(fractions) - 1)
        for f in fractions:
            w = free * f / tot; out.append(Box(x, self.y, w, self.h)); x += w + gap
        return out

    def split_y(self, *fractions, gap=0.0):
        tot, out, y = sum(fractions), [], self.y
        free = self.h - gap * (len(fractions) - 1)
        for f in fractions:
            h = free * f / tot; out.append(Box(self.x, y, self.w, h)); y += h + gap
        return out

    def overlaps(self, o, pad=0.0):
        return self.x - pad < o.x1 and o.x - pad < self.x1 and self.y - pad < o.y1 and o.y - pad < self.y1

    def contains(self, x, y):
        return self.x <= x <= self.x1 and self.y <= y <= self.y1

    def tup(self): return (self.x, self.y, self.w, self.h)
    def __repr__(self): return f'Box({self.x:.1f}, {self.y:.1f}, {self.w:.1f}, {self.h:.1f})'


def box_of(polys):
    xs = [p[0] for pl in polys for p in pl]; ys = [p[1] for pl in polys for p in pl]
    if not xs:
        return Box(0, 0, 0, 0)
    return Box(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def poly_len(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def mat_mul(m, n):
    return (m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5])


def apply(m, p):
    return (m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5])


IDENT = (1, 0, 0, 1, 0, 0)


def parse_transform(t):
    m = IDENT
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', t or ''):
        a = [float(v) for v in re.split(r'[\s,]+', args.strip()) if v]
        if name == 'matrix' and len(a) == 6: n = tuple(a)
        elif name == 'translate': n = (1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0)
        elif name == 'scale': n = (a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0)
        elif name == 'rotate':
            r = math.radians(a[0]); c, s = math.cos(r), math.sin(r); n = (c, s, -s, c, 0, 0)
            if len(a) == 3: n = mat_mul(mat_mul((1, 0, 0, 1, a[1], a[2]), n), (1, 0, 0, 1, -a[1], -a[2]))
        elif name == 'skewX': n = (1, 0, math.tan(math.radians(a[0])), 1, 0, 0)
        elif name == 'skewY': n = (1, math.tan(math.radians(a[0])), 0, 1, 0, 0)
        else: continue
        m = mat_mul(m, n)
    return m


def flatten_path(d, m=IDENT, tol=0.08):
    """SVG path data → [(points, closed)] (all commands incl. arcs; relative too), transformed by matrix m"""
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?', d or '')
    out, cur, start, i, cmd = [], [], (0.0, 0.0), 0, None
    x = y = 0.0; lc = lq = None

    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v

    def seg_n(p0, p1):
        a, b = apply(m, p0), apply(m, p1)
        return max(2, min(200, int(math.hypot(b[0] - a[0], b[1] - a[1]) / max(tol, 1e-3) / 4) + 2))

    def add(p):
        cur.append(apply(m, p))

    def flush(closed=False):
        nonlocal cur
        if len(cur) > 1:
            if closed and cur[0] != cur[-1]:
                cur.append(cur[0])
            out.append((cur, closed))
        cur = []

    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                flush(True); x, y = start; lc = lq = None
                cur.append(apply(m, start))   # a drawing command right after Z starts at the subpath's start
                continue
        elif cmd is None:
            break
        rel = cmd.islower(); C = cmd.upper(); ox, oy = (x, y) if rel else (0.0, 0.0)
        if C == 'M':
            flush(); x, y = num() + ox, num() + oy; start = (x, y); add((x, y)); cmd = 'l' if rel else 'L'; lc = lq = None
        elif C == 'L':
            x, y = num() + ox, num() + oy; add((x, y)); lc = lq = None
        elif C == 'H':
            x = num() + ox; add((x, y)); lc = lq = None
        elif C == 'V':
            y = num() + (y if rel else 0.0); add((x, y)); lc = lq = None
        elif C in 'CS':
            if C == 'C':
                x1, y1 = num() + ox, num() + oy
            else:
                x1, y1 = (2 * x - lc[0], 2 * y - lc[1]) if lc else (x, y)
            x2, y2, ex, ey = num() + ox, num() + oy, num() + ox, num() + oy
            n = seg_n((x, y), (ex, ey)) * 2
            for k in range(1, n + 1):
                t = k / n; u = 1 - t
                add((u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex, u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey))
            lc, lq = (x2, y2), None; x, y = ex, ey
        elif C in 'QT':
            if C == 'Q':
                x1, y1 = num() + ox, num() + oy
            else:
                x1, y1 = (2 * x - lq[0], 2 * y - lq[1]) if lq else (x, y)
            ex, ey = num() + ox, num() + oy
            n = seg_n((x, y), (ex, ey)) * 2
            for k in range(1, n + 1):
                t = k / n; u = 1 - t
                add((u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey))
            lq, lc = (x1, y1), None; x, y = ex, ey
        elif C == 'A':
            rx, ry, rot, large, sweep = abs(num()), abs(num()), num(), num(), num()
            ex, ey = num() + ox, num() + oy
            for p in _arc_points(x, y, rx, ry, rot, large, sweep, ex, ey):
                add(p)
            x, y = ex, ey; lc = lq = None
        else:
            i += 1
    flush()
    return out


def _arc_points(x1, y1, rx, ry, phi, fa, fs, x2, y2):
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]
    ph = math.radians(phi); c, s = math.cos(ph), math.sin(ph)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num_ = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    co = math.sqrt(max(0, num_ / (rx * rx * yp * yp + ry * ry * xp * xp)))
    if fa == fs:
        co = -co
    cxp, cyp = co * rx * yp / ry, -co * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if not fs and dt > 0: dt -= 2 * math.pi
    elif fs and dt < 0: dt += 2 * math.pi
    n = max(4, int(abs(dt) / (math.pi / 32)))
    return [(cx + rx * math.cos(t1 + dt * k / n) * c - ry * math.sin(t1 + dt * k / n) * s,
             cy + rx * math.cos(t1 + dt * k / n) * s + ry * math.sin(t1 + dt * k / n) * c) for k in range(1, n + 1)]


def inside(p, rings):
    """even-odd point in polygon (rings = list of closed point lists)"""
    c = False
    for r in rings:
        j = len(r) - 1
        for k in range(len(r)):
            a, b = r[k], r[j]
            if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
                c = not c
            j = k
    return c


def _cuts(p, q, rings):
    out, dx, dy = [], q[0] - p[0], q[1] - p[1]
    for r in rings:
        j = len(r) - 1
        for k in range(len(r)):
            a, b = r[j], r[k]; j = k
            ex, ey = b[0] - a[0], b[1] - a[1]; den = dx * ey - dy * ex
            if abs(den) < 1e-12: continue
            t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den; u = ((a[0] - p[0]) * dy - (a[1] - p[1]) * dx) / den
            if 1e-9 < t < 1 - 1e-9 and -1e-9 <= u <= 1 + 1e-9:
                out.append(t)
    return sorted(out)


def clip_polyline(pts, rings, keep='outside'):
    """parts of a polyline inside / outside a region (even-odd)"""
    want, res, cur = keep == 'inside', [], None
    lerp = lambda p, q, t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    if len(pts) == 1:
        return [pts] if inside(pts[0], rings) == want else []
    for k in range(1, len(pts)):
        p, q = pts[k - 1], pts[k]; ts = [0.0] + _cuts(p, q, rings) + [1.0]
        for a in range(1, len(ts)):
            if inside(lerp(p, q, (ts[a - 1] + ts[a]) / 2), rings) == want:
                if cur is None:
                    cur = [lerp(p, q, ts[a - 1])]; res.append(cur)
                cur.append(lerp(p, q, ts[a]))
            else:
                cur = None
    return [r for r in res if len(r) > 1 and poly_len(r) > 1e-4]


def hatch_lines(rings, spacing=1.0, angle=45.0, offset=0.0):
    """parallel lines filling a region (even-odd), alternating direction (short travel)"""
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    rot = [[(p[0] * c + p[1] * s, -p[0] * s + p[1] * c) for p in r] for r in rings]
    ys = [p[1] for r in rot for p in r]
    if not ys:
        return []
    out, y, flip = [], min(ys) + (offset % spacing or spacing / 2), False
    while y < max(ys):
        xs = []
        for r in rot:
            for k in range(1, len(r)):
                p, q = r[k - 1], r[k]
                if (p[1] > y) != (q[1] > y):
                    xs.append(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]))
        xs.sort()
        segs = [(xs[k], xs[k + 1]) for k in range(0, len(xs) - 1, 2)]
        if flip:
            segs = [(b, a_) for a_, b in reversed(segs)]
        for x0, x1 in segs:
            out.append([(x0 * c - y * s, x0 * s + y * c), (x1 * c - y * s, x1 * s + y * c)])
        y += spacing; flip = not flip
    return out


def circle_pts(cx, cy, r, n=None, a0=0.0, a1=360.0):
    n = n or max(12, min(180, int(abs(a1 - a0) / 360 * (2 * math.pi * r) / 0.6)))
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def ellipse_pts(cx, cy, rx, ry, rot=0.0, n=None):
    n = n or max(16, min(180, int(math.pi * (rx + ry) / 0.6)))
    r = math.radians(rot); c, s = math.cos(r), math.sin(r)
    pts = []
    for k in range(n + 1):
        t = 2 * math.pi * k / n; x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def rect_pts(x, y, w, h, r=0.0):
    r = max(0.0, min(r, w / 2, h / 2))
    if r <= 0.01:
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        pts += circle_pts(cx, cy, r, 8, a0, a0 + 90)
    pts.append(pts[0])
    return pts


def unit_shape(d, cx, cy, scale, rot=0.0, flip=False):
    """path data drawn in its own units around (0,0) → polylines placed at (cx, cy), scaled"""
    m = parse_transform(f'translate({cx} {cy}) rotate({rot}) scale({-scale if flip else scale} {scale})')
    return flatten_path(d, m, tol=0.08 / max(scale, 1e-6))


# ---------------------------------------------------------------- the sheet
class Element:
    __slots__ = ('kind', 'polys', 'pen', 'tag', 'text', 'attrs', 'bbox', 'svg_d')

    def __init__(self, kind, polys=None, pen=None, tag=None, text=None, attrs=None, bbox=None):
        self.kind, self.polys, self.pen, self.tag, self.text, self.attrs = kind, polys or [], pen, tag, text, attrs or {}
        self.bbox = bbox or box_of(self.polys)
        self.svg_d = None


class Sheet:
    def __init__(self, size='A4', landscape=False, margin=10.0, pen='black', title='', seed=1):
        if isinstance(size, (tuple, list)):
            self.w, self.h = float(size[0]), float(size[1])
        else:
            w, h = SIZES[size]
            self.w, self.h = (max(w, h), min(w, h)) if landscape else (min(w, h), max(w, h))
        self.margin, self.pen, self.title = margin, pen, title
        self.items, self.reserved, self.warnings = [], [], []   # warnings: text that did not fit its box
        self.rng = random.Random(seed)

    # ---- areas
    @property
    def page(self): return Box(0, 0, self.w, self.h)
    @property
    def inner(self): return self.page.inset(self.margin)

    def reserve(self, box, pad=1.5):
        """keep scattered decorations (confetti, stars …) out of this box (e.g. around a text)"""
        b = box.bbox if isinstance(box, Element) else box
        self.reserved.append(b.inset(-pad)); return b

    def free(self, x, y, pad=0.0):
        return not any(r.inset(-pad).contains(x, y) for r in self.reserved)

    # ---- raw elements
    def lines(self, polys, pen=None, tag=None):
        polys = [list(map(tuple, p)) for p in polys if len(p) > 0]
        e = Element('line', polys, color_of(pen or self.pen), tag)
        self.items.append(e); return e

    def cover(self, rings, tag='cover'):
        """white fill, no stroke: hides lines drawn before it. rings: one closed point list or a list of them"""
        if rings and isinstance(rings[0][0], (int, float)):
            rings = [rings]
        e = Element('cover', [list(map(tuple, r)) for r in rings], None, tag)
        self.items.append(e); return e

    def polyline(self, pts, pen=None, closed=False, tag=None):
        pts = list(pts)
        if closed and pts[0] != pts[-1]:
            pts.append(pts[0])
        return self.lines([pts], pen, tag)

    def line(self, x1, y1, x2, y2, pen=None, tag=None):
        return self.lines([[(x1, y1), (x2, y2)]], pen, tag)

    def rect(self, x, y, w, h, r=0.0, pen=None, cover=False, tag=None):
        pts = rect_pts(x, y, w, h, r)
        if cover: self.cover(pts)
        return self.lines([pts], pen, tag)

    def circle(self, cx, cy, r, pen=None, cover=False, tag=None):
        pts = circle_pts(cx, cy, r)
        if cover: self.cover(pts)
        return self.lines([pts], pen, tag)

    def ellipse(self, cx, cy, rx, ry, rot=0.0, pen=None, cover=False, tag=None):
        pts = ellipse_pts(cx, cy, rx, ry, rot)
        if cover: self.cover(pts)
        return self.lines([pts], pen, tag)

    def arc(self, cx, cy, r, a0, a1, pen=None, tag=None):
        """degrees, 0 = right, 90 = down (y points down)"""
        return self.lines([circle_pts(cx, cy, r, None, a0, a1)], pen, tag)

    def path(self, d, pen=None, transform='', cover=False, tag=None):
        """any SVG path data (mm), e.g. hand-drawn shapes; transform like 'translate(20 30) scale(0.5)'"""
        subs = flatten_path(d, parse_transform(transform))
        if cover:
            closed = [p for p, c in subs if c]
            if closed: self.cover(closed)
        return self.lines([p for p, _ in subs], pen, tag)

    def shape(self, d, cx, cy, scale=1.0, rot=0.0, pen=None, cover=True, flip=False, tag=None):
        """path data in its own units around (0,0), placed at (cx, cy) – closed parts make the cover"""
        subs = unit_shape(d, cx, cy, scale, rot, flip)
        if cover:
            closed = [p for p, c in subs if c]
            if closed: self.cover(closed)
        return self.lines([p for p, _ in subs], pen, tag)

    # ---- text (stays <text>: Stiftwerk draws it in a single-line plotter font you choose per text)
    def text(self, s, x, y, size=5.0, family='sans', anchor='start', pen=None, bold=False, italic=False, spacing=0.0, rot=0.0, tag=None):
        """one line; (x, y) = baseline at the anchor (start | middle | end); size = font-size in mm (cap height 0.7 × size)"""
        s = str(s); w = text_width(s, size, family, spacing); cap = CAP * size
        x0 = x - w / 2 if anchor == 'middle' else x - w if anchor == 'end' else x
        bb = Box(x0, y - cap, w, cap + 0.3 * size)
        if rot:   # rotated around (x, y): bounding box of the rotated corners
            r = math.radians(rot); c, sn = math.cos(r), math.sin(r)
            pts = [(x + (px - x) * c - (py - y) * sn, y + (px - x) * sn + (py - y) * c) for px, py in ((bb.x, bb.y), (bb.x1, bb.y), (bb.x, bb.y1), (bb.x1, bb.y1))]
            bb = box_of([pts])
        e = Element('text', [], color_of(pen or self.pen), tag, s,
                    dict(x=x, y=y, size=size, family=family, anchor=anchor, bold=bold, italic=italic, spacing=spacing, rot=rot), bb)
        self.items.append(e); return e

    def wrap(self, s, width, size, family='sans'):
        lines = []
        for para in str(s).split('\n'):
            words, cur = para.split(' '), ''
            for wd in words:
                t = (cur + ' ' + wd) if cur else wd
                if cur and text_width(t, size, family) > width:
                    lines.append(cur); cur = wd
                else:
                    cur = t
            lines.append(cur)
        return lines

    def text_block(self, s, box, size=4.0, family='sans', leading=1.45, align='left', pen=None, max_lines=None, tag=None, _flow=False):
        """wrapped paragraph(s) inside a box, one <text> per line. Returns (elements, bottom y, overflow text);
        text that does not fit is reported as a warning"""
        lines, lh = self.wrap(s, box.w * 0.97, size, family), size * leading
        y, out, used = box.y + CAP * size, [], 0
        for ln in lines:
            if y + 0.3 * size > box.y1 + 1e-6 or (max_lines and used >= max_lines):
                break
            x = box.cx if align == 'center' else box.x1 if align == 'right' else box.x
            if ln:
                out.append(self.text(ln, x, y, size, family, {'center': 'middle', 'right': 'end'}.get(align, 'start'), pen, tag=tag))
            y += lh; used += 1
        rest = ' '.join(lines[used:]).strip()
        if rest and not _flow:
            self.warnings.append(f'text did not fit its box – cut off: "…{rest[:50]}"')
        return out, y - lh + 0.3 * size, rest

    def capacity(self, box, size, family='sans', leading=1.45):
        """about how many characters of running text fit in a box – write content to this length"""
        lines = max(0, int((box.h - CAP * size - 0.3 * size) / (size * leading)) + 1)
        return int(lines * box.w / text_width('the quick brown fox jumps over a lazy dog', size, family) * 41)

    def flow_text(self, s, boxes, size=3.2, family='sans', leading=1.4, align='left', pen=None):
        """fill several boxes (newspaper columns) in order → (text that did not fit, y below the last line)"""
        y = boxes[0].y if boxes else 0.0
        for b in boxes:
            if not s: break
            _, y, s = self.text_block(s, b, size, family, leading, align, pen, _flow=True)
        if s:
            self.warnings.append(f'text did not fit its columns – cut off: "…{s[:50]}"')
        return s, y

    def fit_text(self, s, x, y, width, max_size=20.0, min_size=2.0, family='sans', anchor='middle', pen=None, **kw):
        """largest font size ≤ max_size whose line fits `width`"""
        size = max_size
        while size > min_size and text_width(s, size, family) > width:
            size *= 0.96
        return self.text(s, x, y, size, family, anchor, pen, **kw)

    # ---- fills
    def hatch(self, rings, spacing=1.0, angle=45.0, pen=None, cross=False, tag=None):
        """hatching inside a region (keep spacing ≥ 0.6 mm – pens are ~0.3–0.5 mm wide)"""
        if rings and isinstance(rings[0][0], (int, float)):
            rings = [rings]
        ls = hatch_lines(rings, spacing, angle)
        if cross: ls += hatch_lines(rings, spacing, angle + 90)
        return self.lines(ls, pen, tag)

    # ---- frames and lines
    def border(self, style='simple', box=None, pen=None, gap=2.0, r=4.0, amp=1.2, period=6.0, corner=12.0):
        """simple | double | rounded | dashed | dotted | wave | zigzag | scallop | ticket | corners | deco"""
        b = box or self.inner; x, y, w, h = b.tup()
        L = lambda polys: self.lines(polys, pen, 'border')
        if style == 'double': return L([rect_pts(x, y, w, h), rect_pts(x + gap, y + gap, w - 2 * gap, h - 2 * gap)])
        if style == 'rounded': return L([rect_pts(x, y, w, h, r)])
        if style in ('dashed', 'dotted'):
            return L(dash(rect_pts(x, y, w, h, r if style == 'dashed' else 0), [period * .55, period * .45] if style == 'dashed' else [0.01, period / 3]))
        if style in ('wave', 'zigzag', 'scallop'):
            a = amp; c = [(x + a, y + a), (x + w - a, y + a), (x + w - a, y + h - a), (x + a, y + h - a), (x + a, y + a)]
            pts = []
            for k in range(4):
                pts += _edge(c[k], c[k + 1], a, period, style)[(1 if k else 0):]
            return L([pts])
        if style == 'ticket':   # notched corners like a cinema ticket
            n = r   # quarter circles cut into each corner, clockwise from the top-right
            pts = circle_pts(x + w, y, n, 10, 180, 90) + circle_pts(x + w, y + h, n, 10, 270, 180) + circle_pts(x, y + h, n, 10, 360, 270) + circle_pts(x, y, n, 10, 90, 0)
            pts.append(pts[0]); return L([pts])
        if style == 'corners':
            k = min(corner, w / 3, h / 3)
            return L([[(x, y + k), (x, y), (x + k, y)], [(x + w - k, y), (x + w, y), (x + w, y + k)],
                      [(x + w, y + h - k), (x + w, y + h), (x + w - k, y + h)], [(x + k, y + h), (x, y + h), (x, y + h - k)]])
        if style == 'deco':     # art-deco: double frame, stepped corners, small diamonds
            g, k = gap, min(corner, w / 4, h / 4)
            out = [rect_pts(x, y, w, h)]
            ix, iy, iw, ih = x + g, y + g, w - 2 * g, h - 2 * g
            out.append([(ix + k, iy), (ix + iw - k, iy), (ix + iw - k, iy + g), (ix + iw - g, iy + g), (ix + iw - g, iy + k), (ix + iw, iy + k),
                        (ix + iw, iy + ih - k), (ix + iw - g, iy + ih - k), (ix + iw - g, iy + ih - g), (ix + iw - k, iy + ih - g), (ix + iw - k, iy + ih),
                        (ix + k, iy + ih), (ix + k, iy + ih - g), (ix + g, iy + ih - g), (ix + g, iy + ih - k), (ix, iy + ih - k), (ix, iy + k),
                        (ix + g, iy + k), (ix + g, iy + g), (ix + k, iy + g), (ix + k, iy)])
            for cx, cy in ((x + w / 2, y + g / 2), (x + w / 2, y + h - g / 2)):
                d = g * 0.45; out.append([(cx - d * 2, cy), (cx, cy - d), (cx + d * 2, cy), (cx, cy + d), (cx - d * 2, cy)])
            return L(out)
        return L([rect_pts(x, y, w, h)])

    def rule(self, x1, x2, y, pen=None, double=False, gap=0.8, style='solid'):
        """horizontal rule (newspaper separators); style solid | dashed | dotted | wave"""
        if style == 'wave':
            return self.lines([_edge((x1, y), (x2, y), 0.6, 4, 'wave')], pen, 'rule')
        ln = [[(x1, y), (x2, y)]] + ([[(x1, y + gap), (x2, y + gap)]] if double else [])
        if style != 'solid':
            ln = [p for l in ln for p in dash(l, [2.2, 1.4] if style == 'dashed' else [0.01, 1.4])]
        return self.lines(ln, pen, 'rule')

    def vrule(self, x, y1, y2, pen=None):
        return self.lines([[(x, y1), (x, y2)]], pen, 'rule')

    def perforation(self, x1, y1, x2, y2, pen=None, dash_len=1.6, gap=1.2):
        """dashed tear-off line (keep text ≥ 4 mm away from it)"""
        return self.lines(dash([(x1, y1), (x2, y2)], [dash_len, gap]), pen, 'perforation')

    def columns(self, box, n, gutter=4.0, rules=True, pen=None):
        """newspaper columns; draws thin rules in the gutters"""
        cols = box.split_x(*([1] * n), gap=gutter)
        if rules:
            for c in cols[1:]:
                self.vrule(c.x - gutter / 2, box.y, box.y1, pen)
        return cols

    # ---- scattered decoration
    def scatter(self, box, n, make, seed=None, min_dist=6.0, avoid=True, tries=40):
        """call make(x, y, rng) at up to n random free spots in box (not in reserved boxes, not too close)"""
        rng = random.Random(seed) if seed is not None else self.rng
        pts = []
        for _ in range(n):
            for _ in range(tries):
                x, y = rng.uniform(box.x, box.x1), rng.uniform(box.y, box.y1)
                if (not avoid or self.free(x, y, 1.0)) and all(math.hypot(x - a, y - b) >= min_dist for a, b in pts):
                    pts.append((x, y)); make(x, y, rng); break
        return pts

    def confetti(self, box=None, n=30, seed=None, pens=('red', 'blue', 'gold'), size=2.2, kinds=('dash', 'dot', 'squiggle', 'star', 'ring')):
        def make(x, y, rng):
            k, p, a = rng.choice(kinds), rng.choice(pens), rng.uniform(0, 360)
            if k == 'dash': self.lines([[_rot((x - size, y), (x, y), a), _rot((x + size, y), (x, y), a)]], p, 'confetti')
            elif k == 'dot': self.lines([circle_pts(x, y, size * .25, 8)], p, 'confetti')
            elif k == 'ring': self.lines([circle_pts(x, y, size * .55, 14)], p, 'confetti')
            elif k == 'star': self.lines([star_pts(x, y, size * .8, 5, .45, a)], p, 'confetti')
            else: self.lines([[_rot((x - size + t * 2 * size / 12, y + math.sin(t / 12 * 2 * math.pi) * size * .35), (x, y), a) for t in range(13)]], p, 'confetti')
        return self.scatter(box or self.inner, n, make, seed, min_dist=size * 3)

    # ---- motifs (each puts a cover behind itself unless cover=False)
    def star(self, cx, cy, r, points=5, inner=0.45, rot=-90, pen=None, cover=False):
        pts = star_pts(cx, cy, r, points, inner, rot)
        if cover: self.cover(pts)
        return self.lines([pts], pen, 'star')

    def sparkle(self, cx, cy, r, pen=None):
        d = f'M0 -1 C0.1 -0.2 0.2 -0.1 1 0 C0.2 0.1 0.1 0.2 0 1 C-0.1 0.2 -0.2 0.1 -1 0 C-0.2 -0.1 -0.1 -0.2 0 -1 Z'
        return self.shape(d, cx, cy, r, pen=pen, cover=False, tag='sparkle')

    def heart(self, cx, cy, size, pen=None, cover=True, rot=0.0):
        d = 'M0 0.35 C-0.5 0 -0.55 -0.35 -0.27 -0.47 C-0.12 -0.53 0 -0.42 0 -0.3 C0 -0.42 0.12 -0.53 0.27 -0.47 C0.55 -0.35 0.5 0 0 0.35 Z'
        return self.shape(d, cx, cy, size, rot, pen, cover, tag='heart')

    def balloon(self, cx, cy, r, pen=None, string_pen='black', cover=True, sway=1.0):
        """(cx, cy) = centre of the balloon; the string hangs about 2.6 r below"""
        body = 'M0 -1.15 C0.62 -1.15 0.98 -0.62 0.98 -0.1 C0.98 0.48 0.48 0.98 0.06 1.04 L0 1.04 C-0.48 0.98 -0.98 0.48 -0.98 -0.1 C-0.98 -0.62 -0.62 -1.15 0 -1.15 Z'
        e = self.shape(body, cx, cy, r, pen=pen, cover=cover, tag='balloon')
        self.lines(unit_polys('M-0.12 1.16 L0.12 1.16 L0 1.03 Z', cx, cy, r) + unit_polys('M-0.55 -0.55 C-0.45 -0.75 -0.25 -0.85 -0.05 -0.88', cx, cy, r), pen, 'balloon')
        self.lines([[(cx + math.sin(t / 30 * math.pi * 2.2) * r * 0.16 * sway, cy + r * 1.16 + t / 30 * r * 2.4) for t in range(31)]], string_pen, 'string')
        return e

    def gift(self, x, y, w, h, pen=None, ribbon_pen=None, cover=True):
        """box with lid and bow; (x, y) = top-left of the box body (the bow sits above y)"""
        rp = ribbon_pen or pen; lid = h * 0.22
        if cover:
            self.cover(rect_pts(x - w * .05, y - lid, w * 1.1, h + lid))
        self.lines([rect_pts(x, y, w, h), rect_pts(x - w * .05, y - lid, w * 1.1, lid)], pen, 'gift')
        cx = x + w / 2
        self.lines([[(cx - w * .07, y - lid), (cx - w * .07, y + h)], [(cx + w * .07, y - lid), (cx + w * .07, y + h)]], rp, 'gift')
        bow = f'M0 0 C-0.25 -0.45 -0.65 -0.4 -0.55 -0.12 C-0.5 0 -0.2 0.02 0 0 C0.2 0.02 0.5 0 0.55 -0.12 C0.65 -0.4 0.25 -0.45 0 0 Z M0 0 L-0.25 0.25 M0 0 L0.25 0.25'
        return self.shape(bow, cx, y - lid, w * 0.55, pen=rp, cover=cover, tag='bow')

    def cake(self, cx, base_y, w, tiers=2, candles=3, pen=None, flame_pen='orange', cover=True):
        """layered cake standing on base_y, with wavy frosting and candles"""
        y, tw, th = base_y, w, w * 0.32
        polys, rings, top_w = [], [], w
        for t in range(tiers):
            x0 = cx - tw / 2
            rings.append(rect_pts(x0, y - th, tw, th)); polys.append(rect_pts(x0, y - th, tw, th))
            polys.append(_edge((x0, y - th * 0.62), (x0 + tw, y - th * 0.62), th * 0.12, tw / 5, 'scallop'))
            top_w = tw; y -= th; tw *= 0.72; th *= 0.9
        if cover: self.cover(rings)
        self.lines([[(cx - w * .6, base_y), (cx + w * .6, base_y)]] + polys, pen, 'cake')
        ch = w * 0.22
        for k in range(candles):   # spread over the top tier
            x = cx - top_w / 2 + top_w / (candles + 1) * (k + 1)
            self.lines([rect_pts(x - w * .025, y - ch, w * .05, ch)], pen, 'candle')
            self.shape('M0 -1 C0.5 -0.3 0.45 0.4 0 0.45 C-0.45 0.4 -0.5 -0.3 0 -1 Z', x, y - ch - w * 0.05, w * 0.05, pen=flame_pen, cover=False, tag='flame')
        return Element('line', bbox=Box(cx - w * .6, y - w * .35, w * 1.2, base_y - y + w * .35))

    def party_hat(self, cx, base_y, w, h, pen=None, stripe_pen=None, cover=True):
        tri = [(cx - w / 2, base_y), (cx, base_y - h), (cx + w / 2, base_y), (cx - w / 2, base_y)]
        if cover: self.cover(tri)
        self.lines([tri], pen, 'hat')
        stripes = [clip_polyline([(cx - w, base_y - h * f + h * .25), (cx + w, base_y - h * f - h * .25)], [tri], 'inside') for f in (.25, .5, .75)]
        self.lines([p for s in stripes for p in s], stripe_pen or pen, 'hat')
        return self.circle(cx, base_y - h - w * .1, w * .1, pen=stripe_pen or pen, cover=cover)

    def bunting(self, x1, x2, y, sag=8.0, flags=9, pens=('red', 'blue', 'gold'), flag_h=None, string_pen='black'):
        """string of triangular flags hanging between (x1, y) and (x2, y)"""
        q = lambda t: (x1 + (x2 - x1) * t, y + 4 * sag * t * (1 - t))
        self.lines([[q(k / 60) for k in range(61)]], string_pen, 'bunting')
        fw = (x2 - x1) / flags * 0.8; fh = flag_h or fw * 1.25
        for k in range(flags):
            t0, t1 = (k + 0.1) / flags, (k + 0.9) / flags
            a, b = q(t0), q(t1); m = q((t0 + t1) / 2)
            tri = [a, b, (m[0], m[1] + fh), a]
            self.cover(tri); self.lines([tri], pens[k % len(pens)], 'flag')

    def ribbon(self, cx, cy, w, h, pen=None, cover=True, text=None, text_pen=None, family='script'):
        """a title ribbon (banner with folded tails); text= puts a title in it, sized so it stays inside"""
        x0, x1, y0, y1, t = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, h * .8
        front = rect_pts(x0, y0, w, h)
        lt = [(x0 + t * .1, y0 + h * .35), (x0 - t, y0 + h * .35), (x0 - t * .55, y1 + h * .1), (x0 - t, y1 + h * .55), (x0 + t * .1, y1 + h * .55)]
        rt = [(x1 - t * .1, y0 + h * .35), (x1 + t, y0 + h * .35), (x1 + t * .55, y1 + h * .1), (x1 + t, y1 + h * .55), (x1 - t * .1, y1 + h * .55)]
        if cover: self.cover([lt + [lt[0]]]); self.cover([rt + [rt[0]]])
        self.lines([lt, rt, [(x0, y1), (x0 + t * .1, y1 + h * .55)], [(x1, y1), (x1 - t * .1, y1 + h * .55)]], pen, 'ribbon')
        if cover: self.cover(front)
        e = self.lines([front], pen, 'ribbon')
        if text:   # caps centred; descenders (0.3 × size) stay above the bottom edge
            size = min((h / 2 - 0.6) / 0.65, 30)
            while size > 1.5 and text_width(text, size, family) > w * 0.88: size *= 0.96
            self.text(text, cx, cy + CAP * size / 2, size, family, 'middle', text_pen or pen)
        return e

    def flower(self, cx, cy, r, petals=6, pen=None, center_pen=None, cover=True):
        polys = []
        for k in range(petals):
            a = 360 / petals * k
            polys.append(ellipse_pts(cx + math.cos(math.radians(a)) * r * .55, cy + math.sin(math.radians(a)) * r * .55, r * .48, r * .26, a))
        if cover: self.cover([circle_pts(cx, cy, r * 1.0)])
        self.lines(polys, pen, 'flower')
        return self.circle(cx, cy, r * .25, pen=center_pen or pen, cover=True)

    def sun(self, cx, cy, r, rays=12, pen=None):
        self.circle(cx, cy, r, pen, cover=True)
        return self.lines([[(cx + math.cos(a) * r * 1.3, cy + math.sin(a) * r * 1.3), (cx + math.cos(a) * r * 1.75, cy + math.sin(a) * r * 1.75)]
                           for a in (2 * math.pi * k / rays for k in range(rays))], pen, 'sun')

    def cloud(self, cx, cy, w, pen=None, cover=True):
        d = 'M-0.5 0.2 C-0.62 0.2 -0.62 -0.05 -0.45 -0.08 C-0.45 -0.3 -0.2 -0.35 -0.1 -0.2 C-0.02 -0.42 0.3 -0.42 0.32 -0.15 C0.5 -0.2 0.62 0.05 0.5 0.2 Z'
        return self.shape(d, cx, cy, w, pen=pen, cover=cover, tag='cloud')

    # cats
    def cat_face(self, cx, cy, size, mood='awake', pen=None, cover=True, whiskers=True):
        """cat head, `size` = width in mm; mood awake | happy | sleepy | wink"""
        head = ('M-46 10 C-50 -10 -46 -24 -38 -32 L-40 -62 L-16 -42 C-6 -45 6 -45 16 -42 L40 -62 L38 -32 '
                'C46 -24 50 -10 46 10 C42 34 20 44 0 44 C-20 44 -42 34 -46 10 Z')
        k = size / 100
        e = self.shape(head, cx, cy, k, pen=pen, cover=cover, tag='cat')
        d = 'M-34 -40 L-36 -54 L-23 -43 M34 -40 L36 -54 L23 -43 M-5 8 L5 8 L0 13 Z M0 13 C0 19 -7 22 -12 18 M0 13 C0 19 7 22 12 18'
        if mood == 'happy': d += ' M-24 -2 Q-17 -12 -10 -2 M10 -2 Q17 -12 24 -2'
        elif mood == 'sleepy': d += ' M-24 -4 Q-17 2 -10 -4 M10 -4 Q17 2 24 -4'
        elif mood == 'wink': d += ' M-24 -4 Q-17 2 -10 -4 M17 -14 C23 -14 23 2 17 2 C11 2 11 -14 17 -14 Z M17 -11 L17 -1'
        else: d += ' M-17 -14 C-11 -14 -11 2 -17 2 C-23 2 -23 -14 -17 -14 Z M-17 -11 L-17 -1 M17 -14 C23 -14 23 2 17 2 C11 2 11 -14 17 -14 Z M17 -11 L17 -1'
        if whiskers: d += ' M-22 12 L-52 6 M-22 16 L-54 16 M-22 20 L-50 26 M22 12 L52 6 M22 16 L54 16 M22 20 L50 26'
        self.lines([p for p, _ in unit_shape(d, cx, cy, k)], pen, 'cat')
        return e

    def cat_sitting(self, cx, base_y, height, mood='awake', pen=None, cover=True, flip=False):
        """sitting cat seen from the front, paws on base_y; `height` incl. ears; flip = tail on the left"""
        k = height / 210; f = -1 if flip else 1
        body = 'M-24 -100 C-48 -82 -56 -32 -44 0 L44 0 C56 -32 48 -82 24 -100 Z'
        tail = 'M42 -6 C78 -2 90 -40 70 -62 C62 -70 52 -63 58 -56'
        self.shape(body, cx, base_y, k, pen=pen, cover=cover, flip=flip, tag='cat')
        self.lines([p for p, _ in unit_shape(tail + ' M-10 0 L-12 -44 M10 0 L12 -44 M-22 0 C-22 -7 -10 -7 -10 0 M10 0 C10 -7 22 -7 22 0',
                                               cx, base_y, k, flip=flip)], pen, 'cat')
        return self.cat_face(cx, base_y - 132 * k, 92 * k, mood, pen, cover)

    def cat_sleeping(self, cx, cy, width, pen=None, cover=True, flip=False):
        """curled-up sleeping cat, `width` in mm"""
        k = width / 140
        body = 'M-40 -20 C-28 -44 42 -46 62 -10 C72 14 52 34 4 35 C-30 35 -56 30 -62 14 Z'
        self.shape(body, cx, cy, k, pen=pen, cover=cover, flip=flip, tag='cat')
        self.lines([p for p, _ in unit_shape('M60 6 C68 32 18 46 -30 27 M20 -38 C30 -30 34 -18 30 -8', cx, cy, k, flip=flip)], pen, 'cat')
        head = 'M-70 4 C-74 -10 -70 -18 -64 -22 L-70 -42 L-52 -28 C-46 -30 -40 -30 -36 -28 L-24 -42 L-24 -20 C-18 -12 -18 2 -24 10 C-34 22 -62 22 -70 4 Z'
        self.shape(head, cx, cy, k, pen=pen, cover=cover, flip=flip, tag='cat')
        return self.lines([p for p, _ in unit_shape('M-62 -4 Q-57 1 -52 -4 M-42 -4 Q-37 1 -32 -4 M-49 3 L-45 3 L-47 6 Z M-66 -26 L-66 -34 M-28 -26 L-28 -34',
                                                   cx, cy, k, flip=flip)], pen, 'cat')

    def paw(self, cx, cy, size, pen=None, rot=0.0):
        d = ('M0 0.05 C0.28 0.05 0.36 0.38 0.18 0.45 C0.08 0.49 -0.08 0.49 -0.18 0.45 C-0.36 0.38 -0.28 0.05 0 0.05 Z '
             'M-0.42 -0.12 m-0.1 0 a0.1 0.14 0 1 0 0.2 0 a0.1 0.14 0 1 0 -0.2 0 Z M-0.15 -0.36 m-0.1 0 a0.1 0.14 0 1 0 0.2 0 a0.1 0.14 0 1 0 -0.2 0 Z '
             'M0.15 -0.36 m-0.1 0 a0.1 0.14 0 1 0 0.2 0 a0.1 0.14 0 1 0 -0.2 0 Z M0.42 -0.12 m-0.1 0 a0.1 0.14 0 1 0 0.2 0 a0.1 0.14 0 1 0 -0.2 0 Z')
        return self.shape(d, cx, cy, size, rot, pen, cover=False, tag='paw')

    def fish(self, cx, cy, size, pen=None, cover=True, rot=0.0):
        d = 'M-20 0 C-10 -12 10 -12 20 0 C10 12 -10 12 -20 0 Z M20 0 L32 -10 L29 0 L32 10 Z'
        e = self.shape(d, cx, cy, size / 52, rot, pen, cover, tag='fish')
        self.lines([p for p, _ in unit_shape('M-12 -3 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M-5 -7 C-2 -2 -2 2 -5 7', cx, cy, size / 52, rot)], pen, 'fish')
        return e

    def cardboard_box(self, x, y, w, h, pen=None, open_flaps=True, cover=True):
        """an open cardboard box (front face x, y, w, h) – draw a cat first, then this: the box hides its lower half"""
        f = h * 0.35
        left = [(x, y), (x - w * .12, y - f), (x + w * .25, y - f * .8), (x + w * .3, y)]
        right = [(x + w, y), (x + w * 1.12, y - f), (x + w * .75, y - f * .8), (x + w * .7, y)]
        if cover:
            if open_flaps: self.cover([left + [left[0]], right + [right[0]]])
            self.cover(rect_pts(x, y, w, h))
        polys = [rect_pts(x, y, w, h), [(x + w * .5, y), (x + w * .5, y + h * .25)], [(x + w * .2, y + h * .65), (x + w * .45, y + h * .65)]]
        if open_flaps: polys += [left, right]
        return self.lines(polys, pen, 'box')

    def yarn(self, cx, cy, r, pen=None, cover=True):
        """ball of yarn: two families of wound strands and a loose end"""
        self.circle(cx, cy, r, pen, cover=cover)
        ball = [circle_pts(cx, cy, r * .97)]
        arcs = [circle_pts(cx + r * 1.9, cy - r * .3, r * k, 40, 120, 240) for k in (1.25, 1.55, 1.85, 2.15)]
        arcs += [circle_pts(cx - r * .4, cy + r * 1.9, r * k, 40, 220, 320) for k in (1.3, 1.6, 1.9)]
        arcs = [p for a in arcs for p in clip_polyline(a, ball, 'inside')]
        a0 = math.radians(40); sx, sy = cx + r * math.cos(a0), cy + r * math.sin(a0)
        tail = [(sx + t * r * .05, sy + t * r * .02 + math.sin(t * .35) * r * .12) for t in range(31)]
        return self.lines(arcs + [tail], pen, 'yarn')

    # ---- generative fields
    def flow_field(self, box, n=120, seed=None, length=40.0, step=0.8, scale=0.035, pen=None, avoid=True, sep=1.2):
        """curved lines following a smooth field; sep = minimum distance between lines in mm (they stop instead of merging)"""
        rng = random.Random(seed) if seed is not None else self.rng
        ph = [rng.uniform(0, 6.28) for _ in range(6)]
        ang = lambda x, y: (math.sin(x * scale + ph[0]) + math.sin(y * scale * 1.3 + ph[1]) + math.sin((x + y) * scale * .7 + ph[2])) * 1.6
        grid, polys = {}, []
        cell = lambda x, y: (int(x // sep), int(y // sep))
        def taken(x, y, me):
            cx, cy = cell(x, y)
            return any(grid.get((cx + i, cy + j), me) != me for i in (-1, 0, 1) for j in (-1, 0, 1))
        for line_no in range(n):
            x, y = rng.uniform(box.x, box.x1), rng.uniform(box.y, box.y1)
            if taken(x, y, line_no) or (avoid and not self.free(x, y)): continue
            pts = [(x, y)]
            for _ in range(int(length / step)):
                a = ang(x, y); x += math.cos(a) * step; y += math.sin(a) * step
                if not box.contains(x, y) or (avoid and not self.free(x, y)) or taken(x, y, line_no): break
                pts.append((x, y))
            if poly_len(pts) >= max(3.0, length * 0.15):   # short stubs cost a pen lift each and look like noise
                for q in pts: grid[cell(*q)] = line_no
                polys.append(pts)
        return self.lines(polys, pen, 'flow')

    def truchet(self, box, cell=8.0, seed=None, pen=None, style='arcs'):
        rng = random.Random(seed) if seed is not None else self.rng
        polys = []
        for j in range(int(box.h // cell)):
            for i in range(int(box.w // cell)):
                x, y, f = box.x + i * cell, box.y + j * cell, rng.random() < .5
                if style == 'diag':
                    polys.append([(x, y), (x + cell, y + cell)] if f else [(x + cell, y), (x, y + cell)])
                elif f:
                    polys += [circle_pts(x, y, cell / 2, 8, 0, 90), circle_pts(x + cell, y + cell, cell / 2, 8, 180, 270)]
                else:
                    polys += [circle_pts(x + cell, y, cell / 2, 8, 90, 180), circle_pts(x, y + cell, cell / 2, 8, 270, 360)]
        return self.lines(polys, pen, 'truchet')

    def spiral(self, cx, cy, r, turns=8, pen=None):
        n = int(turns * 90)
        return self.lines([[(cx + r * k / n * math.cos(k / n * turns * 2 * math.pi), cy + r * k / n * math.sin(k / n * turns * 2 * math.pi)) for k in range(n + 1)]], pen, 'spiral')

    def ridgelines(self, box, rows=30, seed=None, amp=None, pen=None):
        """'Unknown Pleasures' – each row covers the rows behind it (cover + line)"""
        rng = random.Random(seed) if seed is not None else self.rng
        amp = amp or box.h / rows * 4; gap = box.h / rows
        for r in range(rows):
            y = box.y + amp + r * (box.h - amp) / rows; peaks = [(rng.uniform(.3, .7), rng.uniform(.02, .08), rng.uniform(.3, 1)) for _ in range(4)]
            pts = []
            for k in range(121):
                t = k / 120; v = sum(h * math.exp(-((t - c) ** 2) / (2 * s * s)) for c, s, h in peaks) * math.exp(-((t - .5) ** 2) / .05)
                pts.append((box.x + t * box.w, y - v * amp + rng.uniform(-.05, .05) * gap))
            self.cover([pts + [(box.x1, y + gap), (box.x, y + gap), pts[0]]])
            self.lines([pts], pen, 'ridge')

    # ---- output
    def _d(self, polys, close=False):
        """close=True ends every subpath with Z – Stiftwerk only treats closed shapes as covers"""
        out = []
        for p in polys:
            if len(p) == 1:   # a dot: tiny circle so it shows in previews too
                x, y = p[0]; out.append(f'M{x - .2:.2f} {y:.2f}a.2 .2 0 1 0 .4 0a.2 .2 0 1 0 -.4 0')
            else:
                out.append('M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in p) + ('Z' if close else ''))
        return ''.join(out)

    def svg(self):
        o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w:g}mm" height="{self.h:g}mm" viewBox="0 0 {self.w:g} {self.h:g}">']
        if self.title: o.append(f'<title>{sx.escape(self.title)}</title>')
        o.append('<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.35">')
        for e in self.items:
            if e.kind == 'line' and e.polys:
                o.append(f'<path d="{self._d(e.polys)}" stroke="{e.pen}"/>')
            elif e.kind == 'cover':
                o.append(f'<path d="{self._d(e.polys, close=True)}" fill="#ffffff" stroke="none"/>')
            elif e.kind == 'text':
                a = e.attrs; fam = FAMILIES.get(a['family'], a['family'])
                extra = (' font-weight="bold"' if a['bold'] else '') + (' font-style="italic"' if a['italic'] else '') + \
                        (f' letter-spacing="{a["spacing"]:g}"' if a['spacing'] else '') + (f' transform="rotate({a["rot"]:g} {a["x"]:.2f} {a["y"]:.2f})"' if a['rot'] else '')
                o.append(f'<text x="{a["x"]:.2f}" y="{a["y"]:.2f}" font-size="{a["size"]:.2f}" font-family="{sx.escape(fam)}" text-anchor="{a["anchor"]}" '
                         f'fill="{e.pen}" stroke="none"{extra}>{sx.escape(e.text)}</text>')
        o.append('</g></svg>')
        return '\n'.join(o)

    def save(self, path):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(self.svg())
        return path

    def report(self, quiet=False):
        return analyze(self.w, self.h, self.margin, self.items, quiet=quiet, extra=self.warnings)


# ---------------------------------------------------------------- shape helpers
def star_pts(cx, cy, r, n=5, inner=0.45, rot=-90):
    pts = []
    for k in range(2 * n + 1):
        rr = r if k % 2 == 0 else r * inner; a = math.radians(rot + 180 / n * k)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def unit_polys(d, cx, cy, scale, rot=0.0):
    return [p for p, _ in unit_shape(d, cx, cy, scale, rot)]


def _rot(p, c, deg):
    a = math.radians(deg); x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


def _edge(a, b, amp, period, style):
    L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, round(L / period)); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    out, steps = [], n * (2 if style == 'zigzag' else 16)
    for k in range(steps + 1):
        t = k / steps
        if style == 'zigzag': s = 0.0 if k in (0, steps) else (amp if k % 2 else -amp)
        elif style == 'scallop': s = -abs(math.sin(t * n * math.pi)) * amp * 1.4
        else: s = math.sin(t * n * 2 * math.pi) * amp
        out.append((a[0] + ux * L * t - uy * s, a[1] + uy * L * t + ux * s))
    return out


def dash(pts, pattern, offset=0.0):
    """split a polyline into dashes; pattern = [on, off, …] in mm"""
    out, cur, on, k, left = [], [pts[0]], True, 0, pattern[0] - offset
    for i in range(1, len(pts)):
        p, q = pts[i - 1], pts[i]; seg = math.hypot(q[0] - p[0], q[1] - p[1]); pos = 0.0
        while seg - pos > left:
            pos += left; t = pos / seg; m = (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
            if on: cur.append(m); out.append(cur)
            else: cur = [m]
            on = not on; k = (k + 1) % len(pattern); left = pattern[k]
        left -= seg - pos
        if on: cur.append(q)
    if on and len(cur) > 1: out.append(cur)
    return out


# ---------------------------------------------------------------- analysis (also used by check_plot.py)
def analyze(w, h, margin, items, quiet=False, draw_f=2000, travel_f=8000, extra=()):
    """what Stiftwerk will plot: hidden parts removed, per-pen length, a time estimate and layout warnings"""
    covers_after = []
    vis = []          # (index, pen, polys)
    for i, e in enumerate(items):
        if e.kind == 'cover':
            covers_after.append((i, e.polys, box_of(e.polys)))
    for i, e in enumerate(items):
        if e.kind != 'line':
            continue
        polys = e.polys
        for j, rings, cb in covers_after:
            if j > i and e.bbox.overlaps(cb):
                polys = [part for p in polys for part in clip_polyline(p, rings, 'outside')]
        vis.append((i, e, polys))
    pens, strokes, warn, info = {}, 0, list(extra), []
    for i, e, polys in vis:
        pens[e.pen] = pens.get(e.pen, 0.0) + sum(poly_len(p) for p in polys); strokes += len(polys)
    texts = [(i, e) for i, e in enumerate(items) if e.kind == 'text']
    chars = 0
    for i, e in texts:
        n = len(e.text.replace(' ', '')); chars += n; fm = METRICS.get(e.attrs['family'], METRICS['sans']); k = 2 if e.attrs.get('bold') else 1
        pens[e.pen] = pens.get(e.pen, 0.0) + n * CAP * e.attrs['size'] * fm['ink'] * k     # measured per font (metrics.json)
        strokes += int(n * fm['strokes'] * k)
        b = e.bbox
        if b.x < -0.01 or b.y < -0.01 or b.x1 > w + 0.01 or b.y1 > h + 0.01: warn.append(f'text off the sheet: "{e.text[:40]}"')
        elif margin and (b.x < margin - .5 or b.y < margin - .5 or b.x1 > w - margin + .5 or b.y1 > h - margin + .5):
            warn.append(f'text in the margin: "{e.text[:40]}"')
        if CAP * e.attrs['size'] < 1.6: warn.append(f'tiny text (cap height {CAP * e.attrs["size"]:.1f} mm, under 1.6 mm gets hard to read with a pen): "{e.text[:30]}"')
        # hidden by a later cover?
        for j, rings, cb in covers_after:
            if j > i and cb.overlaps(b) and inside((b.cx, b.cy), rings):
                warn.append(f'text lies under a cover drawn after it – move the text after the cover: "{e.text[:40]}"'); break
        # lines crossing the text box
        tb = b.inset(0.2)
        for _, le, polys in vis:
            if le.tag in ('border',) or not le.bbox.overlaps(tb): continue
            if any(_seg_hits_box(p[k - 1], p[k], tb) for p in polys for k in range(1, len(p))) or any(len(p) == 1 and tb.contains(*p[0]) for p in polys):
                warn.append(f'lines run through text "{e.text[:40]}" ({le.tag or "lines"}) – add a cover behind the text or move things apart'); break
    for a in range(len(texts)):
        for b_ in range(a + 1, len(texts)):
            A, B = texts[a][1], texts[b_][1]
            if A.bbox.inset(0.3).overlaps(B.bbox.inset(0.3)):
                warn.append(f'texts overlap: "{A.text[:25]}" / "{B.text[:25]}"')
    for i, e, polys in vis:
        bb = box_of(polys) if polys else None
        if bb and (bb.x < -0.01 or bb.y < -0.01 or bb.x1 > w + 0.01 or bb.y1 > h + 0.01):
            warn.append(f'lines off the sheet ({e.tag or "lines"}: {bb}) – Stiftwerk cuts them at the edge')
    draw = sum(pens.values())
    # like Stiftwerk's estimate (iDraw defaults): +15 % for acceleration, ~0.19 s per pen down/up, short hops inside text
    travel = strokes * 2.5 + sum(1 for i, e, p in vis for _ in p) * 15
    t = (draw / draw_f * 60 + travel / travel_f * 60) * 1.15 + strokes * 0.19
    if len(pens) > 4: info.append(f'{len(pens)} pens – every pen is a pen change')
    names = {v: k for k, v in PALETTE.items()}
    rep = {'size_mm': (w, h), 'pens': {names.get(k, k): round(v / 1000, 2) for k, v in pens.items()}, 'texts': len(texts), 'chars': chars,
           'strokes': strokes, 'draw_m': round(draw / 1000, 2), 'minutes': round(t / 60, 1), 'warnings': list(dict.fromkeys(warn)), 'info': info}
    if not quiet:
        print(f"sheet {w:g} × {h:g} mm · {len(pens)} pen(s): " + ', '.join(f'{k} {v} m' for k, v in rep['pens'].items()))
        print(f"{len(texts)} texts ({chars} letters) · ~{rep['strokes']} strokes · ~{rep['draw_m']} m of line · about {rep['minutes']} min to plot (estimate)")
        for m in rep['warnings'][:40]: print('  ⚠', m)
        if len(rep['warnings']) > 40: print(f"  … {len(rep['warnings']) - 40} more warnings")
        for m in info: print('  ·', m)
        if not rep['warnings']: print('  ✓ no layout problems found')
    return rep


def _seg_hits_box(p, q, b):
    if b.contains(*p) or b.contains(*q): return True
    edges = [((b.x, b.y), (b.x1, b.y)), ((b.x1, b.y), (b.x1, b.y1)), ((b.x1, b.y1), (b.x, b.y1)), ((b.x, b.y1), (b.x, b.y))]
    for a, c in edges:
        d = (q[0] - p[0]) * (c[1] - a[1]) - (q[1] - p[1]) * (c[0] - a[0])
        if abs(d) < 1e-12: continue
        t = ((a[0] - p[0]) * (c[1] - a[1]) - (a[1] - p[1]) * (c[0] - a[0])) / d; u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d
        if 0 <= t <= 1 and 0 <= u <= 1: return True
    return False


# ---------------------------------------------------------------- reading any SVG (check_plot.py, preview.py --plot)
NAMED = {'black': '#000000', 'white': '#ffffff', 'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00', 'orange': '#ffa500',
         'purple': '#800080', 'pink': '#ffc0cb', 'brown': '#a52a2a', 'gray': '#808080', 'grey': '#808080', 'navy': '#000080', 'teal': '#008080',
         'gold': '#ffd700', 'silver': '#c0c0c0', 'maroon': '#800000', 'darkred': '#8b0000', 'darkgreen': '#006400', 'darkblue': '#00008b'}
INHERIT = ('stroke', 'fill', 'stroke-dasharray', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'display', 'visibility', 'letter-spacing',
           'fill-opacity', 'stroke-opacity')
UNITS = {'mm': 1.0, 'cm': 10.0, 'in': 25.4, 'pt': 25.4 / 72, 'pc': 25.4 / 6, 'px': 25.4 / 96, '': 25.4 / 96}


def parse_color(v):
    v = (v or '').strip().lower()
    if not v or v in ('none', 'transparent') or v.startswith('url('): return None
    if v in NAMED: return NAMED[v]
    m = re.match(r'#([0-9a-f]{3})$', v)
    if m: return '#' + ''.join(c * 2 for c in m.group(1))
    if re.match(r'#[0-9a-f]{6}$', v): return v
    m = re.match(r'rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?', v)
    if m: return '#' + ''.join(f'{min(255, int(float(c))):02x}' for c in m.groups())
    return '#000000' if v == 'currentcolor' else None


def is_paper(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    return min(r, g, b) >= 240 and max(r, g, b) - min(r, g, b) <= 12


def _len(v, default=0.0):
    m = re.match(r'\s*([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)\s*([a-z%]*)', str(v or ''), re.I)
    if not m: return default
    n, u = float(m.group(1)), m.group(2).lower()
    return n * (UNITS.get(u, 1.0) / UNITS['px'] if u in ('mm', 'cm', 'in', 'pt', 'pc') else 1.0)   # in user units ≈ px


def guess_family(fam):
    """the plotter font Stiftwerk picks for a CSS font-family (same rules as guessFont in src/app/22-fonts.js)"""
    f = (fam or '').split(',')[0].replace('"', '').replace("'", '').strip().lower()
    if re.search(r'hershey.*goth', f): return 'gothic'
    if re.search(r'hershey.*script', f): return 'script'
    if re.search(r'hershey.*(serif|roman|duplex|triplex)', f): return 'serif'
    if re.search(r'hershey|simplex', f): return 'sans'
    if re.search(r'script|cursive|handwrit|brush|calligraph|lobster|pacifico|dancing|marker', f): return 'script'
    if re.search(r'^serif$|times|georgia|garamond|palatino|bookman|cambria|baskerville|didot|merriweather|playfair', f): return 'serif'
    return 'plain'


def load_svg(path):
    """→ (w_mm, h_mm, items, notes): items like Sheet.items (lines, covers, texts) in document order, all in mm"""
    import xml.etree.ElementTree as ET
    tree = ET.parse(path); root = tree.getroot()
    tag = lambda el: el.tag.split('}')[-1]
    vb = [float(v) for v in re.split(r'[\s,]+', root.get('viewBox', '').strip()) if v] or None
    def dim(attr, vbv):
        v = root.get(attr)
        if v and not v.strip().endswith('%'):
            m = re.match(r'\s*([\d.]+)\s*([a-z]*)', v)
            return float(m.group(1)) * UNITS.get(m.group(2), 25.4 / 96)
        return vbv * 25.4 / 96 if vbv else 210.0
    w_mm, h_mm = dim('width', vb[2] if vb else None), dim('height', vb[3] if vb else None)
    if vb: base = (w_mm / vb[2], 0, 0, h_mm / vb[3], -vb[0] * w_mm / vb[2], -vb[1] * h_mm / vb[3])
    else: base = (25.4 / 96, 0, 0, 25.4 / 96, 0, 0)
    # very small CSS: .class, tag, #id and comma lists
    rules = []
    for st in root.iter():
        if tag(st) == 'style' and st.text:
            for sel, body in re.findall(r'([^{}]+)\{([^}]*)\}', re.sub(r'/\*.*?\*/', '', st.text, flags=re.S)):
                decl = dict((k.strip().lower(), v.strip()) for k, v in (d.split(':', 1) for d in body.split(';') if ':' in d))
                for s1 in sel.split(','):
                    rules.append((s1.strip(), decl))
    ids = {el.get('id'): el for el in root.iter() if el.get('id')}
    items, notes = [], []
    def style_of(el, parent):
        st = {k: v for k, v in parent.items() if k in INHERIT}
        for k in INHERIT + ('opacity', 'transform'):
            if el.get(k) is not None and k != 'transform': st[k] = el.get(k)
        classes = (el.get('class') or '').split()
        for sel, decl in rules:
            if sel == tag(el) or (sel.startswith('.') and sel[1:] in classes) or (sel.startswith('#') and sel[1:] == el.get('id')):
                st.update(decl)
        for d in (el.get('style') or '').split(';'):
            if ':' in d: k, v = d.split(':', 1); st[k.strip().lower()] = v.strip()
        return st
    def scale_of(m): return math.sqrt(abs(m[0] * m[3] - m[1] * m[2]))
    def walk(el, m, parent, depth=0):
        t = tag(el)
        if t in ('defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'metadata', 'title', 'desc', 'style', 'linearGradient', 'radialGradient', 'filter'):
            return
        st = style_of(el, parent)
        if st.get('display') == 'none' or st.get('visibility') == 'hidden' or float(st.get('opacity', 1) or 1) == 0:
            return
        m = mat_mul(m, parse_transform(el.get('transform'))) if el.get('transform') else m
        if t == 'use' and depth < 6:
            ref = ids.get((el.get('href') or el.get('{http://www.w3.org/1999/xlink}href') or '').lstrip('#'))
            if ref is not None:
                m2 = mat_mul(m, (1, 0, 0, 1, _len(el.get('x')), _len(el.get('y'))))
                if tag(ref) == 'symbol':
                    for c in ref: walk(c, m2, st, depth + 1)
                else: walk(ref, m2, st, depth + 1)
            return
        if t == 'image':
            notes.append('raster image skipped – pen plotters only draw lines'); return
        if t == 'text':
            fs = _len(st.get('font-size', '16')) * scale_of(m)
            runs = [(el.get('x'), el.get('y'), (el.text or ''))]
            for ts in el:
                if tag(ts) == 'tspan':
                    if ts.get('x') is not None or ts.get('y') is not None: runs.append((ts.get('x'), ts.get('y'), ts.text or ''))
                    else: runs[-1] = (runs[-1][0], runs[-1][1], runs[-1][2] + (ts.text or ''))
                if ts.tail: runs[-1] = (runs[-1][0], runs[-1][1], runs[-1][2] + ts.tail)
            col = parse_color(st.get('stroke')) or parse_color(st.get('fill', 'black'))
            fam = (st.get('font-family') or 'sans').split(',')[0].strip().strip('"\'').lower()
            family = guess_family(fam)
            lx = ly = 0.0
            for rx, ry, txt in runs:
                lx = _len(str(rx).split()[0]) if rx is not None else lx; ly = _len(str(ry).split()[0]) if ry is not None else ly
                txt = re.sub(r'\s+', ' ', txt).strip()
                if not txt or col is None: continue
                x, y = apply(m, (lx, ly)); size = fs; anchor = st.get('text-anchor', 'start')
                rot = math.degrees(math.atan2(m[1], m[0]))
                w = text_width(txt, size, family); cap = CAP * size
                x0 = x - w / 2 if anchor == 'middle' else x - w if anchor == 'end' else x
                bb = Box(x0, y - cap, w, cap + 0.3 * size)
                if abs(rot) > 0.5:
                    r_ = math.radians(rot); c_, s_ = math.cos(r_), math.sin(r_)
                    bb = box_of([[(x + (px - x) * c_ - (py - y) * s_, y + (px - x) * s_ + (py - y) * c_) for px, py in ((bb.x, bb.y), (bb.x1, bb.y), (bb.x, bb.y1), (bb.x1, bb.y1))]])
                bold = str(st.get('font-weight', '')).strip() in ('bold', 'bolder', '600', '700', '800', '900')
                items.append(Element('text', [], col, 'text', txt, dict(x=x, y=y, size=size, family=family, anchor=anchor, bold=bold,
                                                                     italic='italic' in str(st.get('font-style', '')), spacing=0, rot=rot, raw_family=st.get('font-family', '')), bb))
                lx += w / max(scale_of(m), 1e-9)
            return
        d = None
        if t == 'path': d = el.get('d')
        elif t == 'rect':
            x, y, w, h = (_len(el.get(k)) for k in ('x', 'y', 'width', 'height')); rx = _len(el.get('rx') or el.get('ry'))
            if w > 0 and h > 0:
                d = 'M' + 'L'.join(f'{px} {py}' for px, py in rect_pts(x, y, w, h, rx)) + 'Z'
        elif t == 'circle':
            cx, cy, r = (_len(el.get(k)) for k in ('cx', 'cy', 'r'))
            if r > 0: d = f'M{cx - r} {cy}A{r} {r} 0 1 0 {cx + r} {cy}A{r} {r} 0 1 0 {cx - r} {cy}Z'
        elif t == 'ellipse':
            cx, cy, rx, ry = (_len(el.get(k)) for k in ('cx', 'cy', 'rx', 'ry'))
            if rx > 0 and ry > 0: d = f'M{cx - rx} {cy}A{rx} {ry} 0 1 0 {cx + rx} {cy}A{rx} {ry} 0 1 0 {cx - rx} {cy}Z'
        elif t == 'line':
            d = f'M{_len(el.get("x1"))} {_len(el.get("y1"))}L{_len(el.get("x2"))} {_len(el.get("y2"))}'
        elif t in ('polyline', 'polygon'):
            nums = re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?', el.get('points') or '', re.I)
            if len(nums) >= 4: d = 'M' + ' '.join(nums) + ('Z' if t == 'polygon' else '')
        if d is not None:
            subs = flatten_path(d, m)
            stroke = parse_color(st.get('stroke')); fill = None if t == 'line' else parse_color(st.get('fill', 'black'))
            if fill and float(st.get('fill-opacity', 1) or 1) * float(st.get('opacity', 1) or 1) >= 0.5:
                closed = [p for p, c in subs if c]
                if closed: items.append(Element('cover', closed, None, 'cover'))
            pen = stroke or (fill if fill and not is_paper(fill) else None)
            if pen:
                polys = [p for p, _ in subs]
                da = st.get('stroke-dasharray')
                if stroke and da and da != 'none':
                    pat = [float(v) * scale_of(m) for v in re.split(r'[\s,]+', da.strip()) if v]
                    if any(pat): polys = [q for p in polys for q in dash(p, pat * (2 if len(pat) % 2 else 1))]
                items.append(Element('line', polys, pen, el.get('class') or t))
            return
        for c in el:
            walk(c, m, st, depth)
    walk(root, base, {'fill': 'black'})
    return w_mm, h_mm, items, list(dict.fromkeys(notes))
