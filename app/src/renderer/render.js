import { state, els, extra } from './state.js';
import { ICONS } from './icons.js';
import { showToast } from './toast.js';
import { formatDurationMs, renderStatsCharts } from './charts.js';

// --- View helpers ---

export function set_modal_visible(modalEl, visible) {
	if (!modalEl) return;
	if (visible) {
		modalEl.classList.remove('is-hidden');
	} else {
		modalEl.classList.add('is-hidden');
	}
}

export function show_view(viewId) {
	const library = document.getElementById('libraryView');
	const settings = document.getElementById('settingsView');
	const stats = document.getElementById('statsView');
	if (library) library.classList.toggle('is-hidden', 'libraryView' !== viewId);
	if (settings) settings.classList.toggle('is-hidden', 'settingsView' !== viewId);
	if (stats) stats.classList.toggle('is-hidden', 'statsView' !== viewId);
}

// --- Snippet counts ---

export async function loadSnippetCounts() {
	try {
		const counts = await window.snipsApi.getSnippetCounts();
		if (counts && typeof counts.total !== 'undefined' && counts.byGroup) {
			state.snippetCounts = {
				total: Number(counts.total || 0),
				byGroup: counts.byGroup || {}
			};
		}
	} catch (_err) {
		state.snippetCounts = { total: 0, byGroup: {} };
	}
}

export function updateSnippetCountLabel() {
	if (!els.snippetCountLabel) return;
	const shown = Array.isArray(state.snippets) ? state.snippets.length : 0;
	let total = state.snippetCounts.total || 0;
	if ('__all__' !== state.selectedGroupId) {
		total = Number((state.snippetCounts.byGroup || {})[state.selectedGroupId] || 0);
	}
	if (els.searchInput && String(els.searchInput.value || '').trim()) {
		els.snippetCountLabel.textContent = `Snippets (${shown}/${total})`;
		return;
	}
	els.snippetCountLabel.textContent = `Snippets (${total})`;
}

// --- Toggles ---

export function updateToggleIcons() {
	const enabledIcon = document.getElementById('enabledIcon');
	const favoriteIcon = document.getElementById('favoriteIcon');
	if (enabledIcon) {
		enabledIcon.innerHTML = els.enabledInput.checked ? ICONS.enabledOn : ICONS.enabledOff;
		enabledIcon.style.color = els.enabledInput.checked ? 'var(--accent)' : 'var(--muted)';
	}
	if (favoriteIcon) {
		favoriteIcon.innerHTML = els.favoriteInput.checked ? ICONS.favoriteOn : ICONS.favoriteOff;
		favoriteIcon.style.color = els.favoriteInput.checked ? 'var(--accent)' : 'var(--muted)';
	}
}

// --- Groups ---

export function renderGroups() {
	els.groups.innerHTML = '';
	for (const group of state.groups) {
		const row = document.createElement('div');
		row.className = `group-item${state.selectedGroupId === group.id ? ' active' : ''}`;
		const groupCount = Number((state.snippetCounts.byGroup || {})[group.id] || 0);
		row.innerHTML = `
			<div class="group-row">
				<div class="group-name"></div>
				<div class="group-right">
					<div class="group-count" aria-label="Snippet count">${groupCount}</div>
					<div class="group-actions">
						<button class="group-action" data-action="edit" title="Edit group" aria-label="Edit group">${ICONS.edit}</button>
						<button class="group-action" data-action="delete" title="Delete group" aria-label="Delete group">${ICONS.trash}</button>
					</div>
				</div>
			</div>
		`;
		const nameEl = row.querySelector('.group-name');
		if (nameEl) nameEl.textContent = group.name;
		row.onclick = async () => {
			state.selectedGroupId = group.id;
			state.selectedSnippetId = null;
			show_view('libraryView');
			await loadSnippets();
			renderGroups();
		};
		const editBtn = row.querySelector('button[data-action="edit"]');
		if (editBtn) {
			editBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				document.dispatchEvent(new CustomEvent('group:edit', { detail: group }));
			};
		}
		const delBtn = row.querySelector('button[data-action="delete"]');
		if (delBtn) {
			if ('default' === group.id) {
				delBtn.disabled = true;
				delBtn.style.opacity = '0.35';
				delBtn.style.cursor = 'not-allowed';
			}
			delBtn.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();
				document.dispatchEvent(new CustomEvent('group:delete', { detail: group }));
			};
		}
		els.groups.appendChild(row);
	}
	els.groupSelect.innerHTML = state.groups
		.map((group) => `<option value="${group.id}">${group.name}</option>`)
		.join('');
}

// --- Snippets ---

export function renderSnippets() {
	els.snippetList.innerHTML = '';
	for (const snippet of state.snippets) {
		const item = document.createElement('div');
		item.className = `snippet-item${snippet.id === state.selectedSnippetId ? ' active' : ''}`;
		item.innerHTML = `
			<div class="snippet-row">
				<div class="snippet-meta">
					<div class="snippet-name"><strong></strong></div>
					<div class="snippet-abbr"></div>
				</div>
				<div class="snippet-actions" aria-hidden="true">
					<button class="snippet-action" data-action="copy" title="Copy snippet" aria-label="Copy snippet">${ICONS.copy}</button>
					<button class="snippet-action" data-action="delete" title="Delete snippet" aria-label="Delete snippet">${ICONS.trash}</button>
				</div>
			</div>
		`;
		const strong = item.querySelector('.snippet-name strong');
		if (strong) strong.textContent = snippet.name || '';
		const abbr = item.querySelector('.snippet-abbr');
		if (abbr) abbr.textContent = snippet.abbreviation || '';
		item.onclick = () => selectSnippet(snippet.id);
		const copyBtn = item.querySelector('button[data-action="copy"]');
		if (copyBtn) {
			copyBtn.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();
				try {
					const full = await window.snipsApi.getSnippet(snippet.id);
					const text = full && typeof full.content === 'string' ? full.content : '';
					await navigator.clipboard.writeText(text);
					showToast('Copied snippet content.', 'success', 1800);
				} catch (_err) {
					showToast('Could not copy snippet.', 'warning', 2600);
				}
			};
		}
		const delBtn = item.querySelector('button[data-action="delete"]');
		if (delBtn) {
			delBtn.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();
				document.dispatchEvent(new CustomEvent('snippet:delete', { detail: snippet }));
			};
		}
		els.snippetList.appendChild(item);
	}
}

export async function selectSnippet(id) {
	state.selectedSnippetId = id;
	const snippet = await window.snipsApi.getSnippet(id);
	if (!snippet) return;
	els.nameInput.value = snippet.name || '';
	els.abbrInput.value = snippet.abbreviation || '';
	els.groupSelect.value = snippet.groupId || 'default';
	els.enabledInput.checked = !!snippet.enabled;
	els.favoriteInput.checked = !!snippet.favorite;
	updateToggleIcons();
	els.triggerInput.value = snippet.triggerMode || 'immediate';
	els.contentInput.value = snippet.content || '';
	els.tagsInput.value = (snippet.tags || []).join(', ');
	els.notesInput.value = snippet.notes || '';
	renderSnippets();
}

export function clearEditor() {
	state.selectedSnippetId = null;
	els.nameInput.value = '';
	els.abbrInput.value = '';
	els.groupSelect.value = '__all__' === state.selectedGroupId ? 'default' : state.selectedGroupId || 'default';
	els.enabledInput.checked = true;
	els.favoriteInput.checked = false;
	updateToggleIcons();
	els.triggerInput.value = 'immediate';
	els.contentInput.value = '';
	els.tagsInput.value = '';
	els.notesInput.value = '';
	renderSnippets();
}

// --- Data loading ---

export async function loadGroups() {
	try {
		state.groups = await window.snipsApi.listGroups();
		await loadSnippetCounts();
		if (!state.selectedGroupId && state.groups.length) {
			state.selectedGroupId = state.groups[0].id;
		}
		renderGroups();
	} catch (_err) {
		showToast('Could not load groups.', 'error', 4200);
	}
}

export async function loadSnippets() {
	await loadSnippetCounts();
	const sort = els.snippetSortSelect
		? String(els.snippetSortSelect.value || state.snippetSort || 'updated_desc')
		: state.snippetSort || 'updated_desc';
	state.snippetSort = sort;
	state.snippets = await window.snipsApi.listSnippets({
		query: els.searchInput.value,
		groupId: '__all__' === state.selectedGroupId ? null : state.selectedGroupId,
		sort
	});
	renderSnippets();
	renderGroups();
	updateSnippetCountLabel();
	if (state.snippets.length && !state.selectedSnippetId) {
		selectSnippet(state.snippets[0].id);
	}
}

export async function loadSettings() {
	state.settings = await window.snipsApi.getSettings();
	els.settingEnabled.checked = 'true' === state.settings.enabled;
	els.settingHotkey.value = state.settings.globalHotkey || 'CommandOrControl+Shift+Space';
	els.settingBuffer.value = state.settings.maxBufferLength || '200';
	els.settingExcluded.value = JSON.parse(state.settings.excludedApps || '[]').join(', ');
	const snEl = document.getElementById('settingName');
	const swEl = document.getElementById('settingWpm');
	if (snEl) snEl.value = state.settings.userName || 'Local';
	if (swEl) swEl.value = state.settings.wpm || '220';
	const hk0 = document.getElementById('settingHotkeyOpenSnips');
	const hk1 = document.getElementById('settingHotkeyNewSnippet');
	const hk2 = document.getElementById('settingHotkeyOpenSettings');
	const hk3 = document.getElementById('settingHotkeyOpenStats');
	if (hk0) hk0.value = state.settings.hotkeyOpenSnips || '';
	if (hk1) hk1.value = state.settings.hotkeyNewSnippet || '';
	if (hk2) hk2.value = state.settings.hotkeyOpenSettings || '';
	if (hk3) hk3.value = state.settings.hotkeyOpenStats || '';
	extra.pendingAvatarDataUrl = null;
	applyUserCardFromSettings();
	applyAvatarPreviewFromSettings();
}

// --- User card ---

function applyUserCardFromSettings() {
	const avatar = (state.settings.userAvatar || '').trim();
	const name = (state.settings.userName || 'Local').trim() || 'Local';
	if (extra.sidebarAvatarEl) {
		if (avatar && 0 === avatar.indexOf('data:image/')) {
			extra.sidebarAvatarEl.innerHTML = `<img src="${avatar}" alt="" />`;
		} else {
			extra.sidebarAvatarEl.textContent = avatar || '\u{1F464}';
		}
	}
	if (extra.sidebarNameEl) extra.sidebarNameEl.textContent = name;
}

function applyAvatarPreviewFromSettings() {
	if (!extra.settingAvatarPreviewEl) return;
	const avatar = (extra.pendingAvatarDataUrl || state.settings.userAvatar || '').trim();
	if (avatar && 0 === avatar.indexOf('data:image/')) {
		extra.settingAvatarPreviewEl.innerHTML = `<img src="${avatar}" alt="" />`;
		return;
	}
	extra.settingAvatarPreviewEl.textContent = '\u{1F464}';
}

// --- Stats helpers ---

function startOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfDay(d) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function rangeFromUi() {
	const now = new Date();
	const choice = extra.statsRangeSelectEl ? extra.statsRangeSelectEl.value : '7d';
	let from, to, label;
	if ('30d' === choice) {
		to = now;
		from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		label = 'Last 30 days';
	} else if ('last_month' === choice) {
		const first = startOfMonth(now);
		const end = new Date(first.getTime() - 1);
		from = startOfMonth(end);
		to = endOfDay(end);
		label = 'Last month';
	} else if ('this_month' === choice) {
		from = startOfMonth(now);
		to = now;
		label = 'This month';
	} else if ('custom' === choice) {
		const fs = extra.statsFromEl ? extra.statsFromEl.value : '';
		const ts = extra.statsToEl ? extra.statsToEl.value : '';
		if (!fs || !ts) return null;
		from = new Date(fs + 'T00:00:00');
		to = endOfDay(new Date(ts + 'T00:00:00'));
		label = 'Custom range';
	} else {
		to = now;
		from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		label = 'Last 7 days';
	}
	return { fromTs: from.getTime(), toTs: to.getTime(), label };
}

export async function loadStats(rangeOverride) {
	const range = rangeOverride ||
		rangeFromUi() || {
			fromTs: Date.now() - 7 * 24 * 60 * 60 * 1000,
			toTs: Date.now(),
			label: 'Last 7 days'
		};
	const stats = await window.snipsApi.getStats({ fromTs: range.fromTs, toTs: range.toTs });
	extra.lastStatsForCharts = stats;
	const summary = stats.summary || { expansions: 0, timeSavedMs: 0 };
	els.weeklyStats.textContent = `${range.label}: ${summary.expansions || 0} expansions \u2022 ${formatDurationMs(summary.timeSavedMs || 0)} saved`;
	renderStatsCharts(
		{ bar: extra.statsBarChartEl, pie: extra.statsPieChartEl, legend: extra.statsPieLegendEl },
		stats
	);
	const rows = (stats.perSnippet || [])
		.slice(0, 12)
		.map((row) => {
			return `<tr><td>${row.abbreviation}</td><td>${row.expansionCount}</td><td>${formatDurationMs(row.timeSavedMsTotal || 0)}</td></tr>`;
		})
		.join('');
	els.topStats.innerHTML = `<table class="stats-table"><thead><tr><th>Snippet</th><th>Uses</th><th>Saved</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No stats yet</td></tr>'}</tbody></table>`;
}

// --- Helper status ---

export async function loadHelperStatus() {
	const status = await window.snipsApi.getHelperStatus();
	applyHelperStatus(status);
	if (
		!extra.helperStatusLast ||
		extra.helperStatusLast.running !== status.running ||
		extra.helperStatusLast.accessibilityEnabled !== status.accessibilityEnabled ||
		extra.helperStatusLast.secureInput !== status.secureInput
	) {
		extra.helperStatusLast = status;
		if (!status.running) showToast('Helper is offline. Snippets cannot expand.', 'warning', 4200);
		else if (!status.accessibilityEnabled)
			showToast('Enable Accessibility for helper to allow expansion.', 'warning', 4200);
		else if (status.secureInput) showToast('Secure Input active. Expansion paused.', 'warning', 3000);
	}
}

export function applyHelperStatus(status) {
	const secure = status.secureInput ? 'Secure Input active' : 'Secure Input clear';
	const access = status.accessibilityEnabled ? 'Accessibility granted' : 'Accessibility missing';
	const input = status.listenEventAccess ? 'Input Monitoring granted' : 'Input Monitoring missing';
	const tap = status.eventTapActive ? 'Event tap active' : 'Event tap inactive';
	const running = status.running ? 'Helper online' : 'Helper offline';
	els.helperStatus.textContent = `${running} \u2022 ${access} \u2022 ${input} \u2022 ${tap} \u2022 ${secure}`;
	if (extra.helperPathEl) {
		extra.helperPathEl.textContent = status.helperExecutable ? `Helper: ${status.helperExecutable}` : '';
	}
}

// --- Notifications ---

export async function notifyHelperHealth(prefix) {
	const lead = prefix ? prefix + ' ' : '';
	const status = await window.snipsApi.getHelperStatus();
	if (!status.running) {
		showToast(`${lead}Helper is offline.`, 'warning', 4200);
		return;
	}
	if (!status.accessibilityEnabled) {
		showToast(`${lead}Accessibility is not active for helper yet.`, 'warning', 4200);
		return;
	}
	if (!status.listenEventAccess) {
		showToast(`${lead}Input Monitoring is missing; SnipsHelper cannot read your keystrokes.`, 'warning', 6500);
		return;
	}
	if (!status.eventTapActive) {
		showToast(`${lead}Event tap is inactive (permission or OS restriction).`, 'warning', 6500);
		return;
	}
	if (status.secureInput) {
		showToast(`${lead}Secure Input is active in current app.`, 'warning', 4200);
		return;
	}
	showToast(`${lead}Ready to expand.`, 'success', 1800);
}

// --- Form serialization ---

export function snippetFormToPayload() {
	return {
		id: state.selectedSnippetId,
		name: els.nameInput.value,
		abbreviation: els.abbrInput.value,
		groupId: els.groupSelect.value,
		enabled: els.enabledInput.checked,
		favorite: els.favoriteInput.checked,
		triggerMode: els.triggerInput.value,
		content: els.contentInput.value,
		tags: els.tagsInput.value
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean),
		notes: els.notesInput.value
	};
}
