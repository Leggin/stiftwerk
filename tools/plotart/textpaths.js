// Texts as single strokes, exactly as Stiftwerk draws them (its own font code from src/core.js):
//   node textpaths.js <path/to/src/core.js> [fontDir] < texts.json > polylines.json
// input [{ str, x, y, size, anchor, italic, bold, spacing, font }] in mm (baseline at y); font = 'builtin' or a Hershey
// font id whose SVG file lies in fontDir (<id>.svg). Output: [[polyline, …], …]
const fs = require('fs'), path = require('path');
const SW = require(process.argv[2]), dir = process.argv[3];
const fonts = new Map();
const fontOf = id => {
  if (!id || id === 'builtin' || !dir) return SW.BUILTIN;
  if (!fonts.has(id)) { const f = path.join(dir, id + '.svg'); fonts.set(id, fs.existsSync(f) ? SW.parseSvgFont(fs.readFileSync(f, 'utf8'), id) : SW.BUILTIN); }
  return fonts.get(id);
};
let buf = ''; process.stdin.on('data', d => buf += d); process.stdin.on('end', () => {
  const out = JSON.parse(buf).map(t => {
    const font = fontOf(t.font), capH = t.size * 0.7, extra = (t.spacing || 0) / (capH / 10), w = SW.textWidth(t.str, capH, extra, font);
    const dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0;
    const polys = SW.renderText(t.str, capH, 1.7, 'left', t.italic ? 12 : 0, extra, font).map(g => g.map(([px, py]) => [t.x + dx + px, t.y - capH + py]));
    if (t.bold) for (const g of polys.slice()) polys.push(g.map(([x, y]) => [x + capH * 0.06, y]));
    return polys;
  });
  process.stdout.write(JSON.stringify(out));
});
