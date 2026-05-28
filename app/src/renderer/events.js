import { state, els, initEls, initExtraEls, extra, modalState } from './state.js';
import { ICONS } from './icons.js';
import { showToast } from './toast.js';
import { groupNameFromFilename, importCsvFiles } from './import.js';
import { renderStatsCharts } from './charts.js';
import {
	set_modal_visible,
	show_view,
	updateToggleIcons,
	renderGroups,
	clearEditor,
	loadGroups,
	loadSnippets,
	loadSettings,
	loadStats,
	loadHelperStatus,
	notifyHelperHealth,
	snippetFormToPayload,
	rangeFromUi,
	applyHelperStatus
} from './render.js';

// --- Group modal helpers ---

function openGroupModalForCreate() {
	modalState.groupModalMode = 'create';
	modalState.groupModalEditingId = null;
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
	modalState.groupModalMode = 'edit';
	modalState.groupModalEditingId = group.id;
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
	if (state.selectedGroupId === group.id) state.selectedGroupId = 'default';
	await loadSnippets();
	renderGroups();
	showToast('Group deleted.', 'success');
}

function wireEvents() {
	const statusCard = document.getElementById('statusCard');
	const chevron = document.getElementById('statusChevron');
	const iconNewSnippet = document.getElementById('iconNewSnippet');
	const iconNewGroup = document.getElementById('iconNewGroup');
	const saveIcon = document.getElementById('saveIcon');
	const deleteIcon = document.getElementById('deleteIcon');
	const groupModal = document.getElementById('groupModal');
	const groupBackdrop = document.getElementById('groupBackdrop');
	const groupNameInput = document.getElementById('groupNameInput');
	const groupCancelBtn = document.getElementById('groupCancelBtn');
	const groupCreateBtn = document.getElementById('groupCreateBtn');
	const openLibraryBtn = document.getElementById('openLibraryBtn');
	const openSettingsViewBtn = document.getElementById('openSettingsViewBtn');
	const openStatsViewBtn = document.getElementById('openStatsViewBtn');

	const closeGroupModal = () => set_modal_visible(groupModal, false);

	async function submitNewGroup() {
		const name = groupNameInput && groupNameInput.value ? groupNameInput.value.trim() : '';
		if (!name) {
			showToast('Please enter a group name.', 'warning', 2600);
			if (groupNameInput) groupNameInput.focus();
			return;
		}
		if ('edit' === modalState.groupModalMode && modalState.groupModalEditingId) {
			await window.snipsApi.saveGroup({ id: modalState.groupModalEditingId, name });
			await loadGroups();
			await loadSnippets();
			renderGroups();
			closeGroupModal();
			showToast('Group updated.', 'success');
			return;
		}
		const created = await window.snipsApi.saveGroup({ name });
		await loadGroups();
		if (created && created.id) state.selectedGroupId = created.id;
		await loadSnippets();
		renderGroups();
		closeGroupModal();
		showToast('Group created.', 'success');
	}

	if (iconNewSnippet) iconNewSnippet.innerHTML = ICONS.plusCircle;
	if (iconNewGroup) iconNewGroup.innerHTML = ICONS.plusCircle;
	if (saveIcon) {
		saveIcon.innerHTML = ICONS.check;
		saveIcon.style.color = 'var(--muted)';
	}
	if (deleteIcon) {
		deleteIcon.innerHTML = ICONS.trash;
		deleteIcon.style.color = 'var(--muted)';
	}
	if (chevron) chevron.innerHTML = ICONS.chevronClosed;

	if (openLibraryBtn) {
		openLibraryBtn.onclick = async (e) => {
			e.preventDefault();
			state.selectedGroupId = '__all__';
			state.selectedSnippetId = null;
			show_view('libraryView');
			await loadSnippets();
			renderGroups();
		};
	}
	if (openSettingsViewBtn) {
		openSettingsViewBtn.onclick = async (e) => {
			e.preventDefault();
			show_view('settingsView');
			await loadSettings();
		};
	}
	if (openStatsViewBtn) {
		openStatsViewBtn.onclick = async (e) => {
			e.preventDefault();
			show_view('statsView');
			await loadStats();
		};
	}

	// Avatar
	const settingAvatarFileEl = document.getElementById('settingAvatarFile');
	if (settingAvatarFileEl) {
		settingAvatarFileEl.onchange = () => {
			const file = settingAvatarFileEl.files && settingAvatarFileEl.files[0];
			if (!file) return;
			if (!file.type || 0 !== file.type.indexOf('image/')) {
				showToast('Please choose an image file.', 'warning', 2600);
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				extra.pendingAvatarDataUrl = String(reader.result || '');
				const avp = document.getElementById('settingAvatarPreview');
				if (avp) avp.innerHTML = `<img src="${extra.pendingAvatarDataUrl}" alt="" />`;
				state.settings.userAvatar = extra.pendingAvatarDataUrl;
				if (extra.sidebarAvatarEl)
					extra.sidebarAvatarEl.innerHTML = `<img src="${extra.pendingAvatarDataUrl}" alt="" />`;
			};
			reader.readAsDataURL(file);
		};
	}

	// CSV import
	if (extra.importCsvFileEl) {
		extra.importCsvFileEl.onchange = () => {
			const files = extra.importCsvFileEl.files ? Array.from(extra.importCsvFileEl.files) : [];
			if (!files.length || !extra.importCsvGroupNameEl) return;
			if (1 === files.length) {
				const name = groupNameFromFilename(files[0].name);
				if (name && !extra.importCsvGroupNameEl.value) extra.importCsvGroupNameEl.value = name;
			}
		};
	}

	if (extra.importCsvBtnEl) {
		extra.importCsvBtnEl.onclick = async (e) => {
			e.preventDefault();
			const files =
				extra.importCsvFileEl && extra.importCsvFileEl.files ? Array.from(extra.importCsvFileEl.files) : [];
			if (!files.length) {
				showToast('Choose one or more CSV files to import.', 'warning', 2600);
				return;
			}
			extra.importCsvBtnEl.disabled = true;
			try {
				if (1 === files.length) {
					const groupName = extra.importCsvGroupNameEl
						? String(extra.importCsvGroupNameEl.value || '').trim()
						: '';
					if (!groupName) {
						showToast('Enter a group name for this import.', 'warning', 2600);
						if (extra.importCsvGroupNameEl) extra.importCsvGroupNameEl.focus();
						return;
					}
					await importCsvFiles(files, { groupName });
				} else {
					await importCsvFiles(files, { groupName: null });
				}
				await loadGroups();
				await loadSnippets();
				renderGroups();
				show_view('libraryView');
			} catch (err) {
				showToast(err && err.message ? err.message : 'Import failed.', 'error', 4200);
			} finally {
				extra.importCsvBtnEl.disabled = false;
			}
		};
	}

	if (extra.importCsvDropZoneEl) {
		const prevent = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};
		extra.importCsvDropZoneEl.addEventListener('dragenter', (e) => {
			prevent(e);
			extra.importCsvDropZoneEl.classList.add('drag-over');
		});
		extra.importCsvDropZoneEl.addEventListener('dragover', (e) => {
			prevent(e);
			extra.importCsvDropZoneEl.classList.add('drag-over');
		});
		extra.importCsvDropZoneEl.addEventListener('dragleave', (e) => {
			prevent(e);
			extra.importCsvDropZoneEl.classList.remove('drag-over');
		});
		extra.importCsvDropZoneEl.addEventListener('drop', async (e) => {
			prevent(e);
			extra.importCsvDropZoneEl.classList.remove('drag-over');
			const dt = e.dataTransfer;
			const files = dt && dt.files ? Array.from(dt.files) : [];
			const csvs = files.filter(
				(f) => f && (/\.csv$/i.test(f.name) || (f.type && 0 === f.type.indexOf('text/')))
			);
			if (!csvs.length) {
				showToast('Drop one or more .csv files.', 'warning', 2600);
				return;
			}
			if (extra.importCsvBtnEl) extra.importCsvBtnEl.disabled = true;
			try {
				await importCsvFiles(csvs, { groupName: null });
				await loadGroups();
				await loadSnippets();
				renderGroups();
				show_view('libraryView');
			} finally {
				if (extra.importCsvBtnEl) extra.importCsvBtnEl.disabled = false;
			}
		});
	}

	// Stats
	if (extra.statsRangeSelectEl) {
		extra.statsRangeSelectEl.onchange = async () => {
			const isCustom = 'custom' === extra.statsRangeSelectEl.value;
			if (extra.statsCustomRangeEl) extra.statsCustomRangeEl.classList.toggle('is-hidden', !isCustom);
			if (!isCustom) await loadStats();
		};
	}
	if (extra.statsApplyBtnEl) {
		extra.statsApplyBtnEl.onclick = async (e) => {
			e.preventDefault();
			const range = rangeFromUi();
			if (!range) {
				showToast('Choose both From and To dates.', 'warning', 2600);
				return;
			}
			if (range.fromTs > range.toTs) {
				showToast('From date must be before To date.', 'warning', 2600);
				return;
			}
			await loadStats(range);
		};
	}

	window.addEventListener('resize', () => {
		const statsView = document.getElementById('statsView');
		if (!statsView || statsView.classList.contains('is-hidden')) return;
		if (!extra.lastStatsForCharts) return;
		renderStatsCharts(
			{ bar: extra.statsBarChartEl, pie: extra.statsPieChartEl, legend: extra.statsPieLegendEl },
			extra.lastStatsForCharts
		);
	});

	if (els.searchInput) {
		els.searchInput.addEventListener('keydown', (event) => {
			if ('Escape' === event.key) {
				event.preventDefault();
				els.searchInput.value = '';
				loadSnippets();
			}
		});
	}
	if (els.snippetSortSelect) {
		els.snippetSortSelect.onchange = async () => {
			await loadSnippets();
		};
	}

	const enabledToggle = document.getElementById('enabledToggle');
	const favoriteToggle = document.getElementById('favoriteToggle');
	if (enabledToggle) {
		enabledToggle.onclick = () => {
			els.enabledInput.checked = !els.enabledInput.checked;
			updateToggleIcons();
		};
	}
	if (favoriteToggle) {
		favoriteToggle.onclick = () => {
			els.favoriteInput.checked = !els.favoriteInput.checked;
			updateToggleIcons();
		};
	}

	if (groupBackdrop) groupBackdrop.onclick = () => closeGroupModal();
	if (groupModal)
		groupModal.addEventListener('keydown', (e) => {
			if ('Escape' === e.key) {
				e.preventDefault();
				closeGroupModal();
			}
		});
	if (groupCancelBtn)
		groupCancelBtn.onclick = (e) => {
			e.preventDefault();
			closeGroupModal();
		};
	if (groupCreateBtn)
		groupCreateBtn.onclick = (e) => {
			e.preventDefault();
			submitNewGroup();
		};
	if (groupNameInput)
		groupNameInput.addEventListener('keydown', (e) => {
			if ('Enter' === e.key) {
				e.preventDefault();
				submitNewGroup();
			}
		});

	// Status card
	const statusHeader = document.getElementById('statusHeader');
	if (statusHeader) {
		statusHeader.onclick = () => {
			const collapsed = statusCard.classList.toggle('collapsed');
			if (chevron) chevron.innerHTML = collapsed ? ICONS.chevronClosed : ICONS.chevronOpen;
		};
	}

	// Status action buttons
	const btns = {
		openA11y: document.getElementById('openA11yBtn'),
		revealHelper: document.getElementById('revealHelperBtn'),
		requestA11y: document.getElementById('requestA11yBtn'),
		requestInput: document.getElementById('requestInputBtn'),
		copyHelperPath: document.getElementById('copyHelperPathBtn'),
		restartHelper: document.getElementById('restartHelperBtn'),
		newGroup: document.getElementById('newGroupBtn'),
		newSnippet: document.getElementById('newSnippetBtn'),
		saveSnippet: document.getElementById('saveSnippetBtn'),
		deleteSnippet: document.getElementById('deleteSnippetBtn'),
		saveSettings: document.getElementById('saveSettingsBtn')
	};

	if (btns.openA11y) {
		btns.openA11y.onclick = async () => {
			await window.snipsApi.openAccessibilitySettings();
			showToast(
				'Opened Accessibility settings. If SnipsHelper is missing, click "Reveal SnipsHelper" and add it with the + button.',
				'warning',
				6500
			);
		};
	}
	if (btns.revealHelper) {
		btns.revealHelper.onclick = async () => {
			const result = await window.snipsApi.revealHelperBinary();
			if (result && result.ok)
				showToast(
					'Finder opened to SnipsHelper (inside SnipsHelper.app). Add SnipsHelper.app in Accessibility using the + button, then return here.',
					'warning',
					6500
				);
			else showToast('Could not find SnipsHelper inside the app bundle.', 'error', 5000);
		};
	}
	if (btns.requestA11y) {
		btns.requestA11y.onclick = async () => {
			const result = await window.snipsApi.requestAccessibility();
			if (result && result.ok && result.accessibilityEnabled)
				showToast('Accessibility granted to helper.', 'success', 3000);
			else
				showToast(
					'Accessibility still not granted. Use Accessibility settings to add/enable SnipsHelper.',
					'warning',
					6500
				);
			await loadHelperStatus();
		};
	}
	if (btns.requestInput) {
		btns.requestInput.onclick = async () => {
			const result = await window.snipsApi.requestInputMonitoring();
			if (result && result.ok && result.listenEventAccess)
				showToast('Input Monitoring granted to helper.', 'success', 3000);
			else
				showToast(
					'Input Monitoring still not granted. Enable SnipsHelper in System Settings \u2192 Privacy & Security \u2192 Input Monitoring.',
					'warning',
					7000
				);
			await loadHelperStatus();
		};
	}
	if (btns.copyHelperPath) {
		btns.copyHelperPath.onclick = async () => {
			const status = await window.snipsApi.getHelperStatus();
			if (status && status.helperExecutable) {
				navigator.clipboard.writeText(status.helperExecutable);
				showToast('Copied helper path to clipboard.', 'success', 1800);
			} else showToast('Helper path not available.', 'warning', 2500);
		};
	}
	if (btns.restartHelper) {
		btns.restartHelper.onclick = async () => {
			showToast('Restarting helper...', 'success', 1400);
			let restartResult;
			try {
				restartResult = await window.snipsApi.restartHelper();
			} catch (_err) {
				showToast('Failed to restart helper (IPC error).', 'error', 4500);
				return;
			}
			if (restartResult && false === restartResult.ok) {
				const pathHint = restartResult.helperBinary ? ` Helper: ${restartResult.helperBinary}` : '';
				showToast((restartResult.message || 'Helper failed to start.') + pathHint, 'warning', 7000);
			}
			await loadHelperStatus();
			const status = await window.snipsApi.getHelperStatus();
			if (!status || !status.running) {
				showToast(
					'Helper is still offline. Try quitting SnipsHelper (pkill) and clicking Restart Helper again.',
					'warning',
					6500
				);
				return;
			}
			await notifyHelperHealth('');
		};
	}
	if (btns.newGroup) {
		btns.newGroup.onclick = async (e) => {
			e.preventDefault();
			openGroupModalForCreate();
		};
	}
	if (btns.newSnippet) {
		btns.newSnippet.onclick = () => {
			show_view('libraryView');
			clearEditor();
		};
	}
	if (btns.saveSnippet) {
		btns.saveSnippet.onclick = async () => {
			await window.snipsApi.saveSnippet(snippetFormToPayload());
			await loadSnippets();
			await notifyHelperHealth('Snippet saved.');
		};
	}
	if (btns.deleteSnippet) {
		btns.deleteSnippet.onclick = async () => {
			if (!state.selectedSnippetId) return;
			await window.snipsApi.deleteSnippet(state.selectedSnippetId);
			clearEditor();
			await loadSnippets();
			showToast('Snippet deleted.', 'success');
		};
	}
	if (btns.saveSettings) {
		btns.saveSettings.onclick = async () => {
			const excluded = els.settingExcluded.value
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean);
			const swEl = document.getElementById('settingWpm');
			const wpm = swEl ? Number(swEl.value || 0) : 0;
			if (swEl && (!wpm || wpm < 60 || wpm > 500)) {
				showToast('Words per minute must be between 60 and 500.', 'warning', 3200);
				swEl.focus();
				return;
			}
			const snEl = document.getElementById('settingName');
			await window.snipsApi.saveSettings({
				userAvatar: extra.pendingAvatarDataUrl || state.settings.userAvatar || '',
				userName: snEl ? snEl.value : 'Local',
				wpm: swEl ? String(swEl.value || '220') : '220',
				hotkeyOpenSnips: extra.settingHotkeyOpenSnipsEl ? extra.settingHotkeyOpenSnipsEl.value : '',
				hotkeyNewSnippet: extra.settingHotkeyNewSnippetEl ? extra.settingHotkeyNewSnippetEl.value : '',
				hotkeyOpenSettings: extra.settingHotkeyOpenSettingsEl ? extra.settingHotkeyOpenSettingsEl.value : '',
				hotkeyOpenStats: extra.settingHotkeyOpenStatsEl ? extra.settingHotkeyOpenStatsEl.value : '',
				enabled: String(els.settingEnabled.checked),
				globalHotkey: els.settingHotkey.value,
				maxBufferLength: String(els.settingBuffer.value),
				excludedApps: JSON.stringify(excluded)
			});
			await loadSettings();
			await notifyHelperHealth('Settings saved.');
		};
	}

	els.searchInput.oninput = async () => {
		await loadSnippets();
	};

	// Macro tools
	document.querySelectorAll('.macro-tools button').forEach((btn) => {
		btn.onclick = () => {
			const macro = btn.getAttribute('data-macro');
			const start = els.contentInput.selectionStart;
			const end = els.contentInput.selectionEnd;
			els.contentInput.value = els.contentInput.value.slice(0, start) + macro + els.contentInput.value.slice(end);
		};
	});

	// Custom events
	document.addEventListener('group:edit', (e) => {
		openGroupModalForEdit(e.detail);
	});
	document.addEventListener('group:delete', async (e) => {
		await deleteGroupWithConfirm(e.detail);
	});
	document.addEventListener('snippet:delete', async (e) => {
		const snippet = e.detail;
		const ok = window.confirm(`Delete snippet "${snippet.name}"?`);
		if (!ok) return;
		await window.snipsApi.deleteSnippet(snippet.id);
		if (state.selectedSnippetId === snippet.id) clearEditor();
		await loadSnippets();
		showToast('Snippet deleted.', 'success', 1800);
	});

	// IPC listeners
	window.snipsApi.onStatsUpdated(() => {
		loadStats();
	});
	window.snipsApi.onHelperStatus((status) => {
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
	});
	window.snipsApi.onNavShow(async (payload) => {
		if (!payload) return;
		if (payload.view) {
			show_view(payload.view);
			if ('settingsView' === payload.view) await loadSettings();
			if ('statsView' === payload.view) await loadStats();
		}
		if ('newSnippet' === payload.action) clearEditor();
	});
}

export async function boot() {
	initEls();
	initExtraEls();
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
