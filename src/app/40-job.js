/* ---------------- job ---------------- */
let job = null, jobDirty = true, jobTimer = 0;
/* call after every document change. meta.sys = not a user edit (no undo step) */
function invalidate(now, meta) { jobDirty = true; clearTimeout(jobTimer); if (now) rebuild(); else jobTimer = setTimeout(rebuild, 120); render(); persist(meta); }
function rebuild() {
  clearTimeout(jobTimer);
  const col = SWJob.collect(items, page, plottedTextPolys);
  const lens = SWJob.lengths(col);
  for (const k of col.by.keys()) ensureLayer(k);
  const fresh = [...col.by.keys()].filter(k => !SWPens.penById(doc, layerMeta[k].pen));
  const joined = fresh.length ? SWPens.assignNew(doc, layerMeta, fresh.map(k => ({ key: k, weight: lens.get(k) }))) : [];
  job = SWJob.buildJob(col, libApply(SWPens.plan(doc, layerMeta, col.by.keys())), S);   // libApply: pen library (58-penlib.js)
  // byKey: the page-mm polylines of every design colour (also disabled ones) – the pens step highlights them on hover
  job.colorLengths = lens; job.usedKeys = [...col.by.keys()]; job.byKey = col.by;
  // display names (also used in the pen dialog and G-code comments)
  for (const L of job.layers) L.name = L.ghost ? colorLabel(L.keys[0]) : L.single ? penLabel(doc.single) : penLabel(SWPens.penById(doc, L.pen)) || colorLabel(L.keys[0]);
  jobDirty = false;
  render(); SWUI.emit('job', job);
  // several pens + new colours that were grouped with a near-identical one → tell the user once (61-pens.js)
  if (joined.length && doc.penMode !== SWPens.SINGLE) pnAnnounceJoined(joined);
}
function getJob() { if (jobDirty || !job) rebuild(); return job; }
