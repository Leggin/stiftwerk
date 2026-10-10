/* tabs */
$$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) { $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === t)); $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== t); try { sessionStorage.setItem('sw-tab', t); } catch (e) { } if (t === 'plot') getJob(); }

