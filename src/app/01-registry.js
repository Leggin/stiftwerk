/* ---------------- UI registry ----------------
 * Shared surfaces that several feature files contribute to, so they never edit each other's code:
 *   SWUI.inspector.register({ id, order, applies(it), render(it) → html, bind(it, root), light?(it) })  – selection panel sections
 *   SWUI.preflight.register({ id, order, check() → { state:'ok'|'warn'|'block'|'info', label, detail?, action? } })
 *   SWUI.overlays.register({ id, order, draw(ctx, V) })   – canvas drawing on top of the content (V = mm→px affine)
 *   SWUI.on(event, f) / SWUI.emit(event, ...)             – 'job' (rebuilt), 'select', 'items', 'conn', 'plot', 'history', 'doc'
 *   SWUI.onRender(f)                                     – full re-render (language switch, undo/redo)
 * See docs/contract.md. */
const SWUI = {
  renderers: [],
  onRender(f) { this.renderers.push(f); },
  inspector: { sections: [], register(s) { this.sections = this.sections.filter(x => x.id !== s.id).concat(s).sort((a, b) => a.order - b.order); } },
  preflight: { checks: [], register(c) { this.checks = this.checks.filter(x => x.id !== c.id).concat(c).sort((a, b) => a.order - b.order); } },
  overlays: { list: [], register(o) { this.list = this.list.filter(x => x.id !== o.id).concat(o).sort((a, b) => a.order - b.order); } },
  hooks: {},
  on(ev, f) { (this.hooks[ev] = this.hooks[ev] || []).push(f); },
  emit(ev, ...a) { for (const f of this.hooks[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } },
  machine: { open() { }, close() { }, get isOpen() { return false; } }
};
function renderAll() { I18N.apply(document); for (const f of SWUI.renderers) { try { f(); } catch (e) { console.error(e); } } render(); }
I18N.onChange(() => renderAll());
