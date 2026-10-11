/* ---------------- icons ----------------
 * Simple 1.5px line icons (24×24, currentColor), partly after Lucide/Tabler. swIcon(name, cls?) → inline <svg> string.
 * Static markup: <button data-icon="undo"> gets the icon prepended at load. */
const SWICON = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.5A1.5 1.5 0 0 1 10.500 3h3A1.500 1.500 0 0 1 15 4.500V7"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  shapes: '<path d="M8.5 10 12 4l3.500 6z"/><rect x="3.500" y="14" width="7" height="6.500" rx="1.500"/><circle cx="17.500" cy="17" r="3.500"/>',
  ruler: '<path d="M20.500 14.500 14.500 20.500a2 2 0 0 1-2.800 0L3.500 12.300a2 2 0 0 1 0-2.800l6-6a2 2 0 0 1 2.800 0l8.200 8.200a2 2 0 0 1 0 2.800z"/><path d="m8 8 2 2M11 5l2 2M14 12l2 2M11 15l2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.500"/><path d="m8.500 12.200 2.500 2.500 4.500-5"/>',
  alert: '<path d="M10.300 4.100 2.700 17.500A2 2 0 0 0 4.400 20.500h15.200a2 2 0 0 0 1.700-3L13.700 4.100a2 2 0 0 0-3.400 0z"/><path d="M12 9.500v4M12 17h.01"/>',
  xCircle: '<circle cx="12" cy="12" r="9.500"/><path d="m9 9 6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9.500"/><path d="M12 11v5M12 7.800h.01"/>',
  clock: '<circle cx="12" cy="12" r="9.500"/><path d="M12 7v5.200l3 1.800"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  play: '<path d="M7 4.500v15l12-7.500z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.200"/><rect x="14" y="5" width="4" height="14" rx="1.200"/>',
  plug: '<path d="M12 22v-5M9 8V2.500M15 8V2.500M18 8v4a6 6 0 0 1-12 0V8z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.400-5.700L20 8.500"/><path d="M20 3.500v5h-5"/>',
  center: '<circle cx="12" cy="12" r="2.200"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  maximize: '<path d="M4 9V5.500A1.500 1.500 0 0 1 5.500 4H9M15 4h3.500A1.500 1.500 0 0 1 20 5.500V9M20 15v3.500a1.500 1.500 0 0 1-1.500 1.500H15M9 20H5.500A1.500 1.500 0 0 1 4 18.500V15"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  sparkle: '<path d="M12 3.500c.6 4.600 3.400 7.400 8 8-4.600.6-7.400 3.400-8 8-.6-4.600-3.400-7.400-8-8 4.600-.6 7.400-3.400 8-8z"/>',
  pen: '<path d="M16.500 3.500a2.100 2.100 0 0 1 3 3L8 18l-4.500 1.200L4.700 14.700z"/><path d="m14.500 5.500 3 3"/>',
  portrait: '<rect x="6.500" y="3.500" width="11" height="17" rx="2"/>',
  landscape: '<rect x="3.500" y="6.500" width="17" height="11" rx="2"/>',
  rows: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  angle: '<path d="M5 19 17 7"/><path d="M5 19h12"/><path d="M10.500 19a5.500 5.500 0 0 0-1.600-3.900"/>',
  pointer: '<path d="M5 4.500 11 20l2.200-6.600L20 11.200z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  frame: '<path d="M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4"/>',
  skip: '<path d="M5 4.500v15l10-7.500z"/><path d="M19 5v14"/>',
  alignLeft: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  alignCenter: '<path d="M4 6h16M7 12h10M5.500 18h13"/>',
  alignRight: '<path d="M4 6h16M10 12h10M7 18h13"/>'
};
function swIcon(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SWICON[name] || ''}</svg>`;
}
/* static markup: <… data-icon="name"> gets its icon prepended (once) */
function hydrateIcons(root) {
  for (const el of (root || document).querySelectorAll('[data-icon]')) {
    if (el.firstElementChild && el.firstElementChild.classList.contains('ic')) continue;
    el.insertAdjacentHTML('afterbegin', swIcon(el.dataset.icon));
  }
}
hydrateIcons();
