import { ICONS } from './icons.js';

export function initSidebar() {
	const shell = document.querySelector('.app-shell');
	const sidebar = document.getElementById('sidebar');
	const toggle = document.getElementById('sidebarToggle');
	const icon = document.getElementById('sidebarToggleIcon');
	let collapsed = false;
	try {
		collapsed = window.localStorage.getItem('snips.sidebarCollapsed') === 'true';
	} catch (_error) {
		// The toggle still works when local storage is unavailable.
	}
	const apply = () => {
		shell.classList.toggle('sidebar-collapsed', collapsed);
		sidebar.hidden = collapsed;
		toggle.setAttribute('aria-expanded', String(!collapsed));
		toggle.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
		toggle.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
		icon.innerHTML = collapsed ? ICONS.chevronRight : ICONS.chevronLeft;
		window.dispatchEvent(new Event('resize'));
	};
	apply();
	toggle.onclick = () => {
		collapsed = !collapsed;
		apply();
		try {
			window.localStorage.setItem('snips.sidebarCollapsed', String(collapsed));
		} catch (_error) {
			// Persistence is optional.
		}
	};
}
