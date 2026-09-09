import { state, els, extra } from './state.js';
import { ICONS } from './icons.js';
import { showToast } from './toast.js';
import { formatDurationMs, renderStatsCharts } from './charts.js';

export function isDirty() {
	if (!state.lastSavedSnapshot) return false;
	return JSON.stringify(snippetFormToPayload()) !== JSON.stringify(state.lastSavedSnapshot);
}
export function mayDiscard() {
	return !isDirty() || window.confirm('Discard unsaved snippet edits?');
}
export function updateDirtyIndicator() {
	const dirty = isDirty();
	document.title = dirty ? 'Snips • Unsaved' : 'Snips';
	const title = document.getElementById('editorTitle');
	if (title) title.textContent = dirty ? 'Snippet Editor • Unsaved' : 'Snippet Editor';
}
export function markSaved() {
	state.lastSavedSnapshot = snippetFormToPayload();
	updateDirtyIndicator();
}

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
	for (const id of ['libraryView', 'settingsView', 'statsView', 'statusView']) {
		document.getElementById(id)?.classList.toggle('is-hidden', id !== viewId);
	}
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
	} catch (err) {
		console.error('loadSnippetCounts failed:', err);
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
	if (!els.groups) return;
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
			if (!mayDiscard()) return;
			state.lastSavedSnapshot = null;
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
	const selectedGroup = els.groupSelect.value;
	els.groupSelect.replaceChildren(
		...state.groups.map((group) => {
			const option = document.createElement('option');
			option.value = group.id;
			option.textContent = group.name;
			return option;
		})
	);
	els.groupSelect.value = state.groups.some((group) => group.id === selectedGroup) ? selectedGroup : 'default';
}

// --- Snippets ---

export function renderSnippets() {
	if (!els.snippetList) return;
	els.snippetList.innerHTML = '';
	const visibleIds = new Set(state.snippets.map((snippet) => snippet.id));
	state.bulkIds = new Set([...(state.bulkIds || [])].filter((id) => visibleIds.has(id)));
	updateBulkActions();

	if (!state.snippets.length) {
		const hasSearch = els.searchInput && String(els.searchInput.value || '').trim();
		els.snippetList.innerHTML = hasSearch
			? '<div class="empty-state">No snippets match your search.</div>'
			: '<div class="empty-state">No snippets yet. Create one with the + Snippet button.</div>';
		return;
	}

	for (const snippet of state.snippets) {
		const item = document.createElement('div');
		item.className = `snippet-item${snippet.id === state.selectedSnippetId ? ' active' : ''}`;
		item.innerHTML = `
			<div class="snippet-row">
				<div class="snippet-meta">
					<div class="snippet-name"><strong></strong></div>
					<div class="snippet-abbr"></div>
				</div>
				<div class="snippet-actions">
					<button class="snippet-action" data-action="copy" title="Copy snippet" aria-label="Copy snippet">${ICONS.copy}</button>
					<button class="snippet-action" data-action="delete" title="Delete snippet" aria-label="Delete snippet">${ICONS.trash}</button>
				</div>
			</div>
		`;
		const strong = item.querySelector('.snippet-name strong');
		if (strong) strong.textContent = snippet.name || '';
		const abbr = item.querySelector('.snippet-abbr');
		if (abbr) abbr.textContent = snippet.abbreviation || '';
		item.tabIndex = 0;
		item.setAttribute('role', 'option');
		item.onkeydown = (e) => {
			if (e.key === 'Enter') selectSnippet(snippet.id);
		};
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.setAttribute('aria-label', 'Select ' + snippet.name);
		checkbox.checked = state.bulkIds?.has(snippet.id) || false;
		checkbox.onclick = (e) => e.stopPropagation();
		checkbox.onchange = () => {
			state.bulkIds ??= new Set();
			if (checkbox.checked) state.bulkIds.add(snippet.id);
			else state.bulkIds.delete(snippet.id);
			updateBulkActions();
		};
		item.prepend(checkbox);
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
	if (id !== state.selectedSnippetId && !mayDiscard()) return;
	state.selectedSnippetId = id;
	const snippet = await window.snipsApi.getSnippet(id);
	if (state.selectedSnippetId !== id) return;
	if (!snippet) {
		clearEditor();
		return;
	}
	state.revision = snippet.revision;
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
	markSaved();
	renderSnippets();
}

export function clearEditor() {
	state.revision = undefined;
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
	markSaved();
	renderSnippets();
}

// --- Loading states ---

/**
 * Shows skeleton loading placeholders in the snippet list.
 */
function showSkeletonLoader() {
	if (!els.snippetList) return;
	els.snippetList.classList.add('is-loading');
	els.snippetList.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('');
}

/**
 * Removes skeleton loading placeholders.
 */
function hideSkeletonLoader() {
	if (!els.snippetList) return;
	els.snippetList.classList.remove('is-loading');
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
	} catch (err) {
		console.error('loadGroups failed:', err);
		showToast('Could not load groups.', 'error', 4200);
	}
}

export async function loadSnippets() {
	showSkeletonLoader();
	try {
		await loadSnippetCounts();
		const sort = els.snippetSortSelect
			? String(els.snippetSortSelect.value || state.snippetSort || 'updated_desc')
			: state.snippetSort || 'updated_desc';
		state.snippetSort = sort;
		state.snippets = await window.snipsApi.listSnippets({
			query: els.searchInput.value,
			groupId: '__all__' === state.selectedGroupId ? null : state.selectedGroupId,
			sort,
			limit: 500,
			metadata: true
		});
		renderSnippets();
		renderGroups();
		updateSnippetCountLabel();
		hideSkeletonLoader();
		if (state.snippets.length && !state.selectedSnippetId) {
			selectSnippet(state.snippets[0].id);
		}
	} catch (err) {
		console.error('loadSnippets failed:', err);
		hideSkeletonLoader();
		showToast('Could not load snippets. The database may be busy.', 'error', 4200);
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
			const image = document.createElement('img');
			image.src = avatar;
			image.alt = '';
			extra.sidebarAvatarEl.replaceChildren(image);
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
		const image = document.createElement('img');
		image.src = avatar;
		image.alt = '';
		extra.settingAvatarPreviewEl.replaceChildren(image);
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
	els.weeklyStats.innerHTML = `${range.label}: ${summary.expansions || 0} expansions \u2022 ${formatDurationMs(summary.timeSavedMs || 0)} saved <span style="font-size:11px;color:var(--muted)">(est.)</span>`;
	renderStatsCharts(
		{ bar: extra.statsBarChartEl, pie: extra.statsPieChartEl, legend: extra.statsPieLegendEl },
		stats
	);
	const table = document.createElement('table');
	table.className = 'stats-table';
	const head = table.createTHead().insertRow();
	for (const label of ['Snippet', 'Uses', 'Saved'])
		head.appendChild(document.createElement('th')).textContent = label;
	const body = table.createTBody();
	const topRows = (stats.perSnippet || []).slice(0, 12);
	if (!topRows.length) {
		const cell = body.insertRow().insertCell();
		cell.colSpan = 3;
		cell.className = 'empty-state';
		cell.textContent = 'No usage data yet. Start using snippets to see stats.';
	} else {
		for (const row of topRows) {
			const tr = body.insertRow();
			for (const value of [
				row.abbreviation || '',
				row.expansionCount || 0,
				formatDurationMs(row.timeSavedMsTotal || 0)
			]) {
				tr.insertCell().textContent = String(value);
			}
		}
	}
	els.topStats.replaceChildren(table);
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
	const issues = [
		...(status.hotkeyFailures || []),
		...(status.lastError ? [status.lastError] : []),
		...(status.upgradeRequired ? ['Helper update required — use Upgrade helper'] : [])
	];
	els.helperStatus.textContent =
		issues.join(' • ') + ' ' + `${running} \u2022 ${access} \u2022 ${input} \u2022 ${tap} \u2022 ${secure}`;
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
		ifRevision: state.revision,
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

function updateBulkActions() {
	const actions = document.getElementById('bulkActions');
	if (actions) actions.hidden = !state.bulkIds?.size;
}
