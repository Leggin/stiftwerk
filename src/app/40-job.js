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
  if (fresh.length) SWPens.assignNew(doc, layerMeta, fresh.map(k => ({ key: k, weight: lens.get(k) })));
  job = SWJob.buildJob(col, SWPens.plan(doc, layerMeta, col.by.keys()), S);
  job.colorLengths = lens; job.usedKeys = [...col.by.keys()];
  jobDirty = false;
  render(); SWUI.emit('job', job);
}
function getJob() { if (jobDirty || !job) rebuild(); return job; }

