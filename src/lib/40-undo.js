/* Undo/redo history of document snapshots. The caller decides what a snapshot is and provides a signature
 * string per snapshot (identical signatures = no change, nothing recorded).
 *   commit(snap, sig, {kind}) – record the state AFTER a change; same kind within coalesceMs merges into one step
 *   undo() / redo() → snapshot to restore (or null) */
const SWUndo = (() => {
  function create({ limit = 100, coalesceMs = 700, now = () => Date.now() } = {}) {
    let states = [], i = -1, lastKind = null, lastAt = 0;
    const api = {
      reset(snap, sig) { states = [{ snap, sig }]; i = 0; lastKind = null; },
      commit(snap, sig, meta = {}) {
        if (i < 0) { api.reset(snap, sig); return false; }
        if (states[i].sig === sig) return false;
        const t = now(), kind = meta.kind || null;
        if (kind && kind === lastKind && t - lastAt <= coalesceMs && i > 0 && i === states.length - 1) states[i] = { snap, sig };
        else {
          states = states.slice(0, i + 1); states.push({ snap, sig }); i++;
          if (states.length > limit) { states.shift(); i--; }
        }
        lastKind = kind; lastAt = t; return true;
      },
      /* replace the current state without creating a step (system updates: font loads, migrations) */
      amend(snap, sig) { if (i >= 0) states[i] = { snap, sig }; },
      undo() { if (i <= 0) return null; i--; lastKind = null; return states[i].snap; },
      redo() { if (i >= states.length - 1) return null; i++; lastKind = null; return states[i].snap; },
      get canUndo() { return i > 0; },
      get canRedo() { return i >= 0 && i < states.length - 1; },
      get size() { return states.length; }
    };
    return api;
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = SWUndo;
