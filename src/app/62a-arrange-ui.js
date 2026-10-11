/* ---------------- ① Motiv: "Anordnen" section – align, distribute, order, snapping ----------------
 * Works on selectedItems() (34-arrange.js). selId stays the primary selection the inspector shows; selMore holds the rest.
 * The rotate / mirror row belongs to the basics section (62-inspector.js). Icons for this file are registered here. */
Object.assign(SWICON, {
  alignObjLeft: '<path d="M3 4v16"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',
  alignObjHCenter: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  alignObjRight: '<path d="M21 4v16"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>',
  alignObjTop: '<path d="M4 3h16"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>',
  alignObjVCenter: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  alignObjBottom: '<path d="M4 21h16"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>',
  distH: '<path d="M3 4v16M21 4v16"/><rect x="10" y="7" width="4" height="10" rx="1"/>',
  distV: '<path d="M4 3h16M4 21h16"/><rect x="7" y="10" width="10" height="4" rx="1"/>',
  stepUp: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 20h14"/>',
  stepDown: '<path d="M12 9v11M7.5 15.5 12 20l4.5-4.5"/><path d="M5 4h14"/>',
  toFront: '<rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2" fill="currentColor"/>',
  toBack: '<rect x="3" y="3" width="11" height="11" rx="2" fill="currentColor"/><rect x="10" y="10" width="11" height="11" rx="2"/>',
  rotL: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 3.5v5h5"/>',
  flipH: '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 6 3 18h6z"/><path d="M15 6l6 12h-6z"/>',
  flipV: '<path d="M3 12h18" stroke-dasharray="2 2.5"/><path d="M6 9h12l-6-6z"/><path d="M6 15h12l-6 6z"/>',
  magnet: '<path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>'
});

let arToSheet = false; // "Am Blatt ausrichten" for several objects; kept while the selection changes

/* would this order button change anything? Mirrors orderSelected (34-arrange.js). canOrder there has no callers and
 * gets 'back' / 'down' wrong when the selection has gaps. */
function arCanOrder(dir) {
  const list = selectedItems(), sel = new Set(list.map(i => i.id)), n = items.length, k = list.length, on = it => sel.has(it.id);
  if (!k) return false;
  if (dir === 'front') return !items.slice(n - k).every(on);
  if (dir === 'back') return !items.slice(0, k).every(on);
  if (dir === 'up') return items.some((it, i) => on(it) && i + 1 < n && !on(items[i + 1]));
  return items.some((it, i) => on(it) && i > 0 && !on(items[i - 1]));
}

/* one button of the section. key = "op:arg" (data-ar, read by the click handler in bind). text: a labelled button, else icon only */
function arBtn(key, icon, label, dis, text) {
  const id = 'ar-' + key.replace(/[^a-z]+/gi, '-'), lb = tHtml(label);
  return `<button class="btn sm${text ? '' : ' icon'}" id="${id}" data-ar="${key}"${dis ? ' disabled' : ''} title="${lb}" aria-label="${lb}">${swIcon(icon, 'sm')}${text ? lb : ''}</button>`;
}

/* the mirror toggles of the basics row follow the item (light updates skip full re-renders) */
function arFlipState(it) {
  for (const [id, on] of [['pFlipX', it.flipX], ['pFlipY', it.flipY]]) { const el = $('#' + id); if (el) el.setAttribute('aria-pressed', String(!!on)); }
}

/* full re-render of the selection panel, keeping keyboard focus on the same control (or on its group when that one is disabled now) */
function arRedraw() {
  const box = $('#props'), fa = document.activeElement, inBox = !!fa && box.contains(fa);
  const key = inBox ? fa.id : '', g = inBox ? fa.closest('[data-ar-grp]') : null, grp = g ? g.dataset.arGrp : '';
  renderProps();
  let el = key ? document.getElementById(key) : null;
  if (!el || el.disabled) el = grp ? box.querySelector(`[data-ar-grp="${grp}"] button:not(:disabled)`) : null;
  if (el) el.focus({ preventScroll: true });
}

SWUI.inspector.register({
  id: 'arrange', order: 15, applies: () => true,
  render() {
    const list = selectedItems(), n = list.length, many = n > 1, few = n < 3;
    const b = (key, icon, label, no = false, text = false) => arBtn(key, icon, label, plotting || no, text);
    const alignBtns = [
      ['left', 'alignObjLeft', 'arrange.align.left'], ['hcenter', 'alignObjHCenter', 'arrange.align.hcenter'], ['right', 'alignObjRight', 'arrange.align.right'],
      ['top', 'alignObjTop', 'arrange.align.top'], ['vcenter', 'alignObjVCenter', 'arrange.align.vcenter'], ['bottom', 'alignObjBottom', 'arrange.align.bottom']
    ].map(([m, ic, lb]) => b('align:' + m, ic, lb)).join('');
    return `<div class="ar">
      ${many ? `<div class="note"><strong>${tnHtml('arrange.sel.count', n)}</strong><div class="row">${b('only', 'pointer', 'arrange.sel.only', false, true)}</div></div>
      <p class="hint">${tHtml('arrange.sel.hint')}</p>` : ''}
      <div class="fgroup"><span class="cap">${tHtml('arrange.align')}</span>
        <div class="ar-icons" role="group" aria-label="${tHtml('arrange.align')}" data-ar-grp="align">${alignBtns}</div>
        ${many ? `<label class="check"><input type="checkbox" id="arToSheet"${arToSheet ? ' checked' : ''}${plotting ? ' disabled' : ''}><span>${tHtml('arrange.align.toSheet')}</span></label>` : ''}
        <p class="hint">${tHtml(many ? 'arrange.align.hintMany' : 'arrange.align.hintOne')}</p>
      </div>
      <div class="fgroup"><span class="cap">${tHtml('arrange.dist')}</span>
        <div class="ar-grid2" data-ar-grp="dist">${b('dist:x', 'distH', 'arrange.dist.h', few, true)}${b('dist:y', 'distV', 'arrange.dist.v', few, true)}</div>
        ${few ? `<p class="hint">${tHtml('arrange.dist.need')}</p>` : ''}
      </div>
      <div class="fgroup"><span class="cap">${tHtml('arrange.order')}</span>
        <div class="ar-grid2" data-ar-grp="order">${b('order:up', 'stepUp', 'arrange.order.up', !arCanOrder('up'), true)}${b('order:front', 'toFront', 'arrange.order.front', !arCanOrder('front'), true)}${b('order:down', 'stepDown', 'arrange.order.down', !arCanOrder('down'), true)}${b('order:back', 'toBack', 'arrange.order.back', !arCanOrder('back'), true)}</div>
      </div>
      <div class="fgroup ar-snap">
        <label class="check"><input type="checkbox" id="arSnap"${snapOn ? ' checked' : ''}${plotting ? ' disabled' : ''}><span>${swIcon('magnet', 'sm')}${tHtml('arrange.snap')}</span></label>
        <p class="hint">${tHtml('arrange.snap.hint')}</p>
      </div>
    </div>`;
  },
  light(it) { setNum('pRotDeg', it.rot || 0); arFlipState(it); },
  bind(it, root) {
    bindEl(root, 'arSnap', 'change', e => setSnap(e.target.checked));
    bindEl(root, 'arToSheet', 'change', e => { arToSheet = e.target.checked; });
    root.addEventListener('click', e => {
      const btn = e.target.closest('button[data-ar]');
      if (!btn || btn.disabled || plotting) return;
      const [op, arg] = btn.dataset.ar.split(':');
      if (op === 'only') select(selId);
      else if (op === 'align') alignSelected(arg, arToSheet);
      else if (op === 'dist') distributeSelected(arg);
      else if (op === 'order') { orderSelected(arg); arRedraw(); }
    });
  }
});

/* snapping, a new selection or a changed order: the section follows (the checkbox keeps its focus) */
SWUI.on('arrange', () => arRedraw());
