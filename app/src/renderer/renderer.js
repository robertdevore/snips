let state = {
	groups: [],
	snippets: [],
	selectedGroupId: null,
	selectedSnippetId: null,
	settings: {}
};

const els = {
	groups: document.getElementById('groups'),
	helperStatus: document.getElementById('helperStatus'),
	searchInput: document.getElementById('searchInput'),
	snippetList: document.getElementById('snippetList'),
	groupSelect: document.getElementById('groupSelect'),
	nameInput: document.getElementById('nameInput'),
	abbrInput: document.getElementById('abbrInput'),
	enabledInput: document.getElementById('enabledInput'),
	favoriteInput: document.getElementById('favoriteInput'),
	triggerInput: document.getElementById('triggerInput'),
	contentInput: document.getElementById('contentInput'),
	tagsInput: document.getElementById('tagsInput'),
	notesInput: document.getElementById('notesInput'),
	weeklyStats: document.getElementById('weeklyStats'),
	topStats: document.getElementById('topStats'),
	settingEnabled: document.getElementById('settingEnabled'),
	settingHotkey: document.getElementById('settingHotkey'),
	settingBuffer: document.getElementById('settingBuffer'),
	settingExcluded: document.getElementById('settingExcluded')
};

const helperPathEl = document.getElementById('helperPath');

let helperStatusLast = null;

function set_modal_visible(modal_el, visible) {
	if (!modal_el) return;
	if (visible) {
		modal_el.classList.remove('is-hidden');
	} else {
		modal_el.classList.add('is-hidden');
	}
}

const ICONS = {
	chevronOpen: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 11l-3 3l-3 -3" /><path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" /></svg>',
	chevronClosed: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 13l3 -3l3 3" /><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /></svg>',
	search: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>',
	edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-edit"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" /><path d="M16 5l3 3" /></svg>',
	trash: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-trash"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>',
	enabledOff: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-eye-off"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>',
	enabledOn: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-eye"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>',
	favoriteOff: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-star"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" /></svg>',
	favoriteOn: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="icon icon-tabler icons-tabler-filled icon-tabler-star"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z" /></svg>',
	plusCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M9 12h6" /><path d="M12 9v6" /></svg>'
};

let groupModalMode = 'create';
let groupModalEditingId = null;

function updateToggleIcons() {
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

function formatDurationMs(durationMs) {
	const totalSeconds = Math.max(0, Math.round((durationMs || 0) / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts = [];
	if (days) parts.push(`${days}d`);
	if (hours || parts.length) parts.push(`${hours}h`);
	if (minutes || parts.length) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);
	return parts.join(' ');
}

function showToast(message, type = 'success', timeoutMs = 2600) {
	const container = document.getElementById('toastContainer');
	if (!container) {
		return;
	}
	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	toast.textContent = message;
	container.appendChild(toast);
	requestAnimationFrame(() => {
		toast.classList.add('show');
	});
	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => {
			toast.remove();
		}, 180);
	}, timeoutMs);
}

async function notifyHelperHealth(prefixMessage) {
	const status = await window.snipsApi.getHelperStatus();
	if (!status.running) {
		showToast(`${prefixMessage} Helper is offline.`, 'warning', 4200);
		return;
	}
	if (!status.accessibilityEnabled) {
		showToast(`${prefixMessage} Accessibility is not active for helper yet.`, 'warning', 4200);
		return;
	}
	if (!status.listenEventAccess) {
		showToast(`${prefixMessage} Input Monitoring is missing; SnipsHelper cannot read your keystrokes.`, 'warning', 6500);
		return;
	}
	if (!status.eventTapActive) {
		showToast(`${prefixMessage} Event tap is inactive (permission or OS restriction).`, 'warning', 6500);
		return;
	}
	if (status.secureInput) {
		showToast(`${prefixMessage} Secure Input is active in current app.`, 'warning', 4200);
		return;
	}
	showToast(`${prefixMessage} Ready to expand.`, 'success', 1800);
}

function snippetFormToPayload() {
	const id = state.selectedSnippetId;
	return {
		id,
		name: els.nameInput.value,
		abbreviation: els.abbrInput.value,
		groupId: els.groupSelect.value,
		enabled: els.enabledInput.checked,
		favorite: els.favoriteInput.checked,
		triggerMode: els.triggerInput.value,
		content: els.contentInput.value,
		tags: els.tagsInput.value.split(',').map((v) => v.trim()).filter(Boolean),
		notes: els.notesInput.value
	};
}

function renderGroups() {
	els.groups.innerHTML = '';
	for (const group of state.groups) {
		const row = document.createElement('div');
		row.className = `group-item${state.selectedGroupId === group.id ? ' active' : ''}`;
		row.innerHTML = `
			<div class="group-row">
				<div class="group-name"></div>
				<div class="group-actions">
					<button class="group-action" data-action="edit" title="Edit group" aria-label="Edit group">${ICONS.edit}</button>
					<button class="group-action" data-action="delete" title="Delete group" aria-label="Delete group">${ICONS.trash}</button>
				</div>
			</div>
		`;
		row.querySelector('.group-name').textContent = group.name;
		row.onclick = async () => {
			state.selectedGroupId = group.id;
			await loadSnippets();
			renderGroups();
		};
		const editBtn = row.querySelector('button[data-action="edit"]');
		if (editBtn) {
			editBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				openGroupModalForEdit(group);
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
				await deleteGroupWithConfirm(group);
			};
		}
		els.groups.appendChild(row);
	}
	els.groupSelect.innerHTML = state.groups.map((group) => `<option value="${group.id}">${group.name}</option>`).join('');
}

function openGroupModalForCreate() {
	groupModalMode = 'create';
	groupModalEditingId = null;
	const groupModal = document.getElementById('groupModal');
	const groupNameInput = document.getElementById('groupNameInput');
	const groupTitle = document.querySelector('#groupModal .modal-title');
	const groupCreateBtn = document.getElementById('groupCreateBtn');
	if (groupTitle) groupTitle.textContent = 'New group';
	if (groupCreateBtn) groupCreateBtn.textContent = 'Create';
	set_modal_visible(groupModal, true);
	if (groupNameInput) {
		groupNameInput.value = '';
		groupNameInput.focus();
		groupNameInput.select();
	}
}

function openGroupModalForEdit(group) {
	groupModalMode = 'edit';
	groupModalEditingId = group.id;
	const groupModal = document.getElementById('groupModal');
	const groupNameInput = document.getElementById('groupNameInput');
	const groupTitle = document.querySelector('#groupModal .modal-title');
	const groupCreateBtn = document.getElementById('groupCreateBtn');
	if (groupTitle) groupTitle.textContent = 'Edit group';
	if (groupCreateBtn) groupCreateBtn.textContent = 'Save';
	set_modal_visible(groupModal, true);
	if (groupNameInput) {
		groupNameInput.value = group.name || '';
		groupNameInput.focus();
		groupNameInput.select();
	}
}

async function deleteGroupWithConfirm(group) {
	if (!group || !group.id) return;
	if ('default' === group.id) {
		showToast('The General group cannot be deleted.', 'warning', 3200);
		return;
	}
	const ok = window.confirm(`Delete group "${group.name}"? Snippets in it will be moved to General.`);
	if (!ok) return;
	await window.snipsApi.deleteGroup(group.id);
	await loadGroups();
	if (state.selectedGroupId === group.id) {
		state.selectedGroupId = 'default';
	}
	await loadSnippets();
	renderGroups();
	showToast('Group deleted.', 'success');
}

function renderSnippets() {
	els.snippetList.innerHTML = '';
	for (const snippet of state.snippets) {
		const item = document.createElement('div');
		item.className = `snippet-item${snippet.id === state.selectedSnippetId ? ' active' : ''}`;
		item.innerHTML = `
			<div><strong>${snippet.name}</strong></div>
			<div>${snippet.abbreviation}</div>
		`;
		item.onclick = () => selectSnippet(snippet.id);
		els.snippetList.appendChild(item);
	}
}

async function selectSnippet(id) {
	state.selectedSnippetId = id;
	const snippet = await window.snipsApi.getSnippet(id);
	if (!snippet) {
		return;
	}
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

function clearEditor() {
	state.selectedSnippetId = null;
	els.nameInput.value = '';
	els.abbrInput.value = '';
	els.groupSelect.value = state.selectedGroupId || 'default';
	els.enabledInput.checked = true;
	els.favoriteInput.checked = false;
	updateToggleIcons();
	els.triggerInput.value = 'immediate';
	els.contentInput.value = '';
	els.tagsInput.value = '';
	els.notesInput.value = '';
	renderSnippets();
}

async function loadGroups() {
	state.groups = await window.snipsApi.listGroups();
	if (!state.selectedGroupId && state.groups.length) {
		state.selectedGroupId = state.groups[0].id;
	}
	renderGroups();
}

async function loadSnippets() {
	state.snippets = await window.snipsApi.listSnippets({
		query: els.searchInput.value,
		groupId: state.selectedGroupId
	});
	renderSnippets();
	if (state.snippets.length && !state.selectedSnippetId) {
		selectSnippet(state.snippets[0].id);
	}
}

async function loadSettings() {
	state.settings = await window.snipsApi.getSettings();
	els.settingEnabled.checked = 'true' === state.settings.enabled;
	els.settingHotkey.value = state.settings.globalHotkey || 'CommandOrControl+Shift+Space';
	els.settingBuffer.value = state.settings.maxBufferLength || '200';
	els.settingExcluded.value = JSON.parse(state.settings.excludedApps || '[]').join(', ');
}

async function loadStats() {
	const stats = await window.snipsApi.getStats();
	els.weeklyStats.textContent = `This week: ${stats.weekly.expansions || 0} expansions • ${formatDurationMs(stats.weekly.timeSavedMs || 0)} saved`;
	const rows = stats.perSnippet.slice(0, 12).map((row) => {
		return `<tr><td>${row.abbreviation}</td><td>${row.expansionCount}</td><td>${formatDurationMs(row.timeSavedMsTotal || 0)}</td></tr>`;
	}).join('');
	els.topStats.innerHTML = `
		<table class="stats-table">
			<thead><tr><th>Snippet</th><th>Uses</th><th>Saved</th></tr></thead>
			<tbody>${rows || '<tr><td colspan="3">No stats yet</td></tr>'}</tbody>
		</table>
	`;
}

async function loadHelperStatus() {
	const status = await window.snipsApi.getHelperStatus();
	applyHelperStatus(status);
	if (!helperStatusLast || helperStatusLast.running !== status.running || helperStatusLast.accessibilityEnabled !== status.accessibilityEnabled || helperStatusLast.secureInput !== status.secureInput) {
		helperStatusLast = status;
		if (!status.running) {
			showToast('Helper is offline. Snippets cannot expand.', 'warning', 4200);
		} else if (!status.accessibilityEnabled) {
			showToast('Enable Accessibility for helper to allow expansion.', 'warning', 4200);
		} else if (status.secureInput) {
			showToast('Secure Input active. Expansion paused.', 'warning', 3000);
		}
	}
}

function applyHelperStatus(status) {
	const secure = status.secureInput ? 'Secure Input active' : 'Secure Input clear';
	const access = status.accessibilityEnabled ? 'Accessibility granted' : 'Accessibility missing';
	const input = status.listenEventAccess ? 'Input Monitoring granted' : 'Input Monitoring missing';
	const tap = status.eventTapActive ? 'Event tap active' : 'Event tap inactive';
	const running = status.running ? 'Helper online' : 'Helper offline';
	els.helperStatus.textContent = `${running} • ${access} • ${input} • ${tap} • ${secure}`;
	if (helperPathEl) {
		helperPathEl.textContent = status.helperExecutable ? `Helper: ${status.helperExecutable}` : '';
	}
}

function wireEvents() {
	const statusCard = document.getElementById('statusCard');
	const chevron = document.getElementById('statusChevron');
	const iconNewSnippet = document.getElementById('iconNewSnippet');
	const iconNewGroup = document.getElementById('iconNewGroup');

	const groupModal = document.getElementById('groupModal');
	const groupBackdrop = document.getElementById('groupBackdrop');
	const groupNameInput = document.getElementById('groupNameInput');
	const groupCancelBtn = document.getElementById('groupCancelBtn');
	const groupCreateBtn = document.getElementById('groupCreateBtn');

	const openGroupModal = () => openGroupModalForCreate();
	const closeGroupModal = () => set_modal_visible(groupModal, false);

	async function submitNewGroup() {
		const name = (groupNameInput && groupNameInput.value) ? groupNameInput.value.trim() : '';
		if (!name) {
			showToast('Please enter a group name.', 'warning', 2600);
			if (groupNameInput) groupNameInput.focus();
			return;
		}
		if ('edit' === groupModalMode && groupModalEditingId) {
			await window.snipsApi.saveGroup({ id: groupModalEditingId, name });
			await loadGroups();
			await loadSnippets();
			renderGroups();
			closeGroupModal();
			showToast('Group updated.', 'success');
			return;
		}
		const created = await window.snipsApi.saveGroup({ name });
		await loadGroups();
		if (created && created.id) {
			state.selectedGroupId = created.id;
		}
		await loadSnippets();
		renderGroups();
		closeGroupModal();
		showToast('Group created.', 'success');
	}
	if (iconNewSnippet) {
		iconNewSnippet.innerHTML = ICONS.plusCircle;
	}
	if (iconNewGroup) {
		iconNewGroup.innerHTML = ICONS.plusCircle;
	}
	if (chevron) {
		chevron.innerHTML = ICONS.chevronClosed;
	}

	if (els.searchInput) {
		els.searchInput.addEventListener('keydown', (event) => {
			if ('Escape' === event.key) {
				event.preventDefault();
				els.searchInput.value = '';
				loadSnippets();
			}
		});
	}

	document.getElementById('enabledToggle').onclick = () => {
		els.enabledInput.checked = !els.enabledInput.checked;
		updateToggleIcons();
	};

	document.getElementById('favoriteToggle').onclick = () => {
		els.favoriteInput.checked = !els.favoriteInput.checked;
		updateToggleIcons();
	};
	if (groupBackdrop) {
		groupBackdrop.onclick = () => closeGroupModal();
	}
	if (groupModal) {
		groupModal.addEventListener('keydown', (e) => {
			if ('Escape' === e.key) {
				e.preventDefault();
				closeGroupModal();
			}
		});
	}
	if (groupCancelBtn) {
		groupCancelBtn.onclick = (e) => {
			e.preventDefault();
			closeGroupModal();
		};
	}
	if (groupCreateBtn) {
		groupCreateBtn.onclick = (e) => {
			e.preventDefault();
			submitNewGroup();
		};
	}
	if (groupNameInput) {
		groupNameInput.addEventListener('keydown', (e) => {
			if ('Enter' === e.key) {
				e.preventDefault();
				submitNewGroup();
			}
		});
	}

	document.getElementById('statusHeader').onclick = () => {
		const collapsed = statusCard.classList.toggle('collapsed');
		chevron.innerHTML = collapsed ? ICONS.chevronClosed : ICONS.chevronOpen;
	};

	document.getElementById('openA11yBtn').onclick = async () => {
		await window.snipsApi.openAccessibilitySettings();
		showToast('Opened Accessibility settings. If SnipsHelper is missing, click "Reveal SnipsHelper" and add it with the + button.', 'warning', 6500);
	};

	document.getElementById('revealHelperBtn').onclick = async () => {
		const result = await window.snipsApi.revealHelperBinary();
		if (result && result.ok) {
			showToast('Finder opened to SnipsHelper (inside SnipsHelper.app). Add SnipsHelper.app in Accessibility using the + button, then return here.', 'warning', 6500);
		} else {
			showToast('Could not find SnipsHelper inside the app bundle.', 'error', 5000);
		}
	};

	document.getElementById('requestA11yBtn').onclick = async () => {
		const result = await window.snipsApi.requestAccessibility();
		if (result && result.ok && result.accessibilityEnabled) {
			showToast('Accessibility granted to helper.', 'success', 3000);
		} else {
			showToast('Accessibility still not granted. Use Accessibility settings to add/enable SnipsHelper.', 'warning', 6500);
		}
		await loadHelperStatus();
	};

	document.getElementById('requestInputBtn').onclick = async () => {
		const result = await window.snipsApi.requestInputMonitoring();
		if (result && result.ok && result.listenEventAccess) {
			showToast('Input Monitoring granted to helper.', 'success', 3000);
		} else {
			showToast('Input Monitoring still not granted. Enable SnipsHelper in System Settings → Privacy & Security → Input Monitoring.', 'warning', 7000);
		}
		await loadHelperStatus();
	};

	document.getElementById('copyHelperPathBtn').onclick = async () => {
		const status = await window.snipsApi.getHelperStatus();
		if (status && status.helperExecutable) {
			navigator.clipboard.writeText(status.helperExecutable);
			showToast('Copied helper path to clipboard.', 'success', 1800);
		} else {
			showToast('Helper path not available.', 'warning', 2500);
		}
	};

	document.getElementById('restartHelperBtn').onclick = async () => {
		showToast('Restarting helper...', 'success', 1400);
		await window.snipsApi.restartHelper();
		await loadHelperStatus();
	};

	document.getElementById('newGroupBtn').onclick = async (e) => {
		e.preventDefault();
		openGroupModal();
	};
	
	document.getElementById('newSnippetBtn').onclick = () => {
		clearEditor();
	};
	
	document.getElementById('saveSnippetBtn').onclick = async () => {
		await window.snipsApi.saveSnippet(snippetFormToPayload());
		await loadSnippets();
		await notifyHelperHealth('Snippet saved.');
	};

	document.getElementById('testSnippetBtn').onclick = async () => {
		const payload = snippetFormToPayload();
		const result = await window.snipsApi.testRenderSnippet(payload);
		window.alert(result.rendered || 'No output');
	};

	document.getElementById('deleteSnippetBtn').onclick = async () => {
		if (!state.selectedSnippetId) {
			return;
		}
		await window.snipsApi.deleteSnippet(state.selectedSnippetId);
		clearEditor();
		await loadSnippets();
		showToast('Snippet deleted.', 'success');
	};

	document.getElementById('saveSettingsBtn').onclick = async () => {
		const excluded = els.settingExcluded.value.split(',').map((v) => v.trim()).filter(Boolean);
		await window.snipsApi.saveSettings({
			enabled: String(els.settingEnabled.checked),
			globalHotkey: els.settingHotkey.value,
			maxBufferLength: String(els.settingBuffer.value),
			excludedApps: JSON.stringify(excluded)
		});
		await loadSettings();
		await notifyHelperHealth('Settings saved.');
	};

	els.searchInput.oninput = async () => {
		await loadSnippets();
	};

	document.querySelectorAll('.macro-tools button').forEach((btn) => {
		btn.onclick = () => {
			const macro = btn.getAttribute('data-macro');
			const start = els.contentInput.selectionStart;
			const end = els.contentInput.selectionEnd;
			const value = els.contentInput.value;
			els.contentInput.value = value.slice(0, start) + macro + value.slice(end);
		};
	});

	window.snipsApi.onStatsUpdated(() => {
		loadStats();
	});
	window.snipsApi.onHelperStatus((status) => {
		applyHelperStatus(status);
		if (!helperStatusLast || helperStatusLast.running !== status.running || helperStatusLast.accessibilityEnabled !== status.accessibilityEnabled || helperStatusLast.secureInput !== status.secureInput) {
			helperStatusLast = status;
			if (!status.running) {
				showToast('Helper is offline. Snippets cannot expand.', 'warning', 4200);
			} else if (!status.accessibilityEnabled) {
				showToast('Enable Accessibility for helper to allow expansion.', 'warning', 4200);
			} else if (status.secureInput) {
				showToast('Secure Input active. Expansion paused.', 'warning', 3000);
			}
		}
	});
}

async function boot() {
	wireEvents();
	await loadGroups();
	await loadSnippets();
	await loadSettings();
	await loadStats();
	await loadHelperStatus();
	setInterval(() => {
		loadHelperStatus();
	}, 5000);
}

boot();
