/* ---------------- machine profiles: switching, creating, import / export ----------------
 * The UI (picker, "Dein Plotter" card, editor) calls these; every change saves and emits 'profile'.
 * Template names/descriptions are translated via t('machine.tpl.<template>.name' | '.desc'). */
const machineList = () => machines.list;
const tplName = id => I18N.has('machine.tpl.' + id + '.name') ? t('machine.tpl.' + id + '.name') : ((SWMachine.template(id) || {}).name || id);
/* apply the active profile to S and tell everyone (work area, pen, speeds may have changed) */
function machineApplied() {
  const p = activeMachine();
  for (const k of SWMachine.KEYS) S[k] = p[k];
  DEFAULTS = Object.assign({}, PLOT_DEFAULTS, SWMachine.template(p.template) || SWMachine.DEFAULTS);
  mcZeroSet = false;
  if (page.fmt === 'machine') pageDims();
  if (typeof renderPage === 'function') renderPage();
  if (typeof jobDirty !== 'undefined') invalidate(true, { sys: true });
  SWUI.emit('profile', p); SWUI.emit('origin');
}
function switchMachine(id) {
  if (plotting || !machines.list.some(p => p.id === id) || id === machines.active) return false;
  saveS(); machines.active = id; store.set('machines', machines); machineApplied();
  if (serial.connected && serial.port && activeMachine().baud !== serial.baud) toast(t('machine.toast.reconnect'));
  return true;
}
/* new profile (from a template, a duplicate or an import) – becomes active unless activate === false */
function addMachine(profile, activate = true) {
  const p = SWMachine.validate(Object.assign({}, profile, { id: SWMachine.uid() }));
  machines.list.push(p); store.set('machines', machines);
  if (activate) switchMachine(p.id); else SWUI.emit('profile', activeMachine());
  return p;
}
const addMachineFromTemplate = (tpl, activate = true) => addMachine(SWMachine.fromTemplate(tpl, tplName(tpl)), activate);
function duplicateMachine(id) { const src = machines.list.find(p => p.id === id); if (!src) return null; saveS(); return addMachine(Object.assign({}, src, { name: t('machine.copyName', { name: src.name }) })); }
function removeMachine(id) {
  if (plotting || machines.list.length < 2) return false;
  const i = machines.list.findIndex(p => p.id === id); if (i < 0) return false;
  const [gone] = machines.list.splice(i, 1);
  if (machines.active === id) { machines.active = machines.list[Math.max(0, i - 1)].id; store.set('machines', machines); machineApplied(); }
  else { store.set('machines', machines); SWUI.emit('profile', activeMachine()); }
  return gone;
}
function renameMachine(id, name) { const p = machines.list.find(x => x.id === id); if (!p) return; p.name = String(name || '').trim().slice(0, 80) || p.name; if (id === machines.active) S.name = p.name; store.set('machines', machines); SWUI.emit('profile', activeMachine()); }
/* back to the template's values (name and id stay) */
function resetMachineToTemplate(id) {
  const p = machines.list.find(x => x.id === id); if (!p) return;
  const fresh = SWMachine.fromTemplate(p.template, p.name);
  Object.assign(p, fresh, { id: p.id, name: p.name }); store.set('machines', machines);
  if (id === machines.active) machineApplied(); else SWUI.emit('profile', activeMachine());
}
/* export / import as JSON files */
function exportMachine(id) {
  const p = machines.list.find(x => x.id === id); if (!p) return null;
  if (id === machines.active) saveS();
  const data = Object.assign({ stiftwerkMachine: 1 }, p); delete data.id;
  return { filename: (p.name || 'plotter').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '-') + '.stiftwerk-plotter.json', text: JSON.stringify(data, null, 2) };
}
function importMachine(text) {
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error(t('machine.err.notJson')); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(t('machine.err.notProfile'));
  return addMachine(o);
}
/* after connecting: does the firmware look like a different family than the active profile? → suggestion */
function machineDetected(text) {
  const d = SWMachine.detect(text); if (!d) return;
  serial.family = d.family;
  if (d.family === SWMachine.familyOf(activeMachine())) return;
  const mine = machines.list.find(p => SWMachine.familyOf(p) === d.family);
  toast(t('machine.toast.detected', { name: tplName(d.template) }), { duration: 9000, action: { label: mine ? t('machine.toast.use', { name: mine.name }) : t('machine.toast.create'), run: () => { if (mine) switchMachine(mine.id); else addMachineFromTemplate(d.template); } } });
}
