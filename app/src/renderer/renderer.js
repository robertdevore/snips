let state = {
	groups: [],
	snippets: [],
	selectedGroupId: '__all__',
	selectedSnippetId: null,
	settings: {},
	snippetCounts: { total: 0, byGroup: {} },
	snippetSort: 'updated_desc'
};

const els = {
	groups: document.getElementById('groups'),
	helperStatus: document.getElementById('helperStatus'),
	searchInput: document.getElementById('searchInput'),
	snippetList: document.getElementById('snippetList'),
	snippetCountLabel: document.getElementById('snippetCountLabel'),
	snippetSortSelect: document.getElementById('snippetSortSelect'),
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

async function loadSnippetCounts() {
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

function updateSnippetCountLabel() {
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

const sidebarAvatarEl = document.getElementById('sidebarAvatar');
const sidebarNameEl = document.getElementById('sidebarName');

const settingAvatarFileEl = document.getElementById('settingAvatarFile');
const settingAvatarPreviewEl = document.getElementById('settingAvatarPreview');
const settingNameEl = document.getElementById('settingName');
const settingWpmEl = document.getElementById('settingWpm');

const settingHotkeyOpenSnipsEl = document.getElementById('settingHotkeyOpenSnips');
const settingHotkeyNewSnippetEl = document.getElementById('settingHotkeyNewSnippet');
const settingHotkeyOpenSettingsEl = document.getElementById('settingHotkeyOpenSettings');
const settingHotkeyOpenStatsEl = document.getElementById('settingHotkeyOpenStats');

const statsRangeSelectEl = document.getElementById('statsRangeSelect');
const statsCustomRangeEl = document.getElementById('statsCustomRange');
const statsFromEl = document.getElementById('statsFrom');
const statsToEl = document.getElementById('statsTo');
const statsApplyBtnEl = document.getElementById('statsApplyBtn');

const statsBarChartEl = document.getElementById('statsBarChart');
const statsPieChartEl = document.getElementById('statsPieChart');
const statsPieLegendEl = document.getElementById('statsPieLegend');

const importCsvFileEl = document.getElementById('importCsvFile');
const importCsvGroupNameEl = document.getElementById('importCsvGroupName');
const importCsvBtnEl = document.getElementById('importCsvBtn');
const importCsvDropZoneEl = document.getElementById('importCsvDropZone');

function groupNameFromFilename(filename) {
	const base = String(filename || '').replace(/\.csv$/i, '').trim();
	return base || 'Imported';
}

function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(new Error('Failed to read file.'));
		reader.readAsText(file);
	});
}

async function importCsvFiles(files, options) {
	const fileList = Array.from(files || []).filter(Boolean);
	if (!fileList.length) {
		showToast('No CSV files found to import.', 'warning', 2600);
		return;
	}

	let totalCreated = 0;
	let totalUpdated = 0;
	let totalSkipped = 0;
	let failed = 0;

	for (const file of fileList) {
		try {
			const groupName = (options && options.groupName)
				? String(options.groupName).trim()
				: groupNameFromFilename(file.name);
			const csvText = await readFileAsText(file);
			const result = await window.snipsApi.importCsv({ groupName, csvText });
			if (!result || !result.ok) {
				failed++;
				continue;
			}
			totalCreated += Number(result.created || 0);
			totalUpdated += Number(result.updated || 0);
			totalSkipped += Number(result.skipped || 0);
		} catch (_err) {
			failed++;
		}
	}

	await loadGroups();
	await loadSnippets();
	renderGroups();
	show_view('libraryView');

	if (failed) {
		showToast(`Imported: ${totalCreated} new, ${totalUpdated} updated. (${failed} failed)`, 'warning', 5200);
	} else {
		showToast(`Imported: ${totalCreated} new, ${totalUpdated} updated.`, 'success', 4200);
	}
}

const helperPathEl = document.getElementById('helperPath');

let helperStatusLast = null;

let pendingAvatarDataUrl = null;

function set_modal_visible(modal_el, visible) {
	if (!modal_el) return;
	if (visible) {
		modal_el.classList.remove('is-hidden');
	} else {
		modal_el.classList.add('is-hidden');
	}
}

function show_view(view_id) {
	const library = document.getElementById('libraryView');
	const settings = document.getElementById('settingsView');
	const stats = document.getElementById('statsView');

	if (library) library.classList.toggle('is-hidden', 'libraryView' !== view_id);
	if (settings) settings.classList.toggle('is-hidden', 'settingsView' !== view_id);
	if (stats) stats.classList.toggle('is-hidden', 'statsView' !== view_id);
}

const ICONS = {
	chevronOpen: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 11l-3 3l-3 -3" /><path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" /></svg>',
	chevronClosed: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 13l3 -3l3 3" /><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /></svg>',
	search: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>',
	copy: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>',
	edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-edit"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" /><path d="M16 5l3 3" /></svg>',
	trash: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-trash"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>',
	check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-check"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>',
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

let lastStatsForCharts = null;

function getCssVarValue(name, fallback) {
	try {
		const value = getComputedStyle(document.documentElement).getPropertyValue(name);
		return (value || '').trim() || fallback;
	} catch (_e) {
		return fallback;
	}
}

function hexToRgb(hex) {
	const raw = String(hex || '').trim().replace('#', '');
	if (3 === raw.length) {
		const r = parseInt(raw.charAt(0) + raw.charAt(0), 16);
		const g = parseInt(raw.charAt(1) + raw.charAt(1), 16);
		const b = parseInt(raw.charAt(2) + raw.charAt(2), 16);
		return { r, g, b };
	}
	if (6 !== raw.length) return null;
	const r = parseInt(raw.slice(0, 2), 16);
	const g = parseInt(raw.slice(2, 4), 16);
	const b = parseInt(raw.slice(4, 6), 16);
	if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
	return { r, g, b };
}

function rgbaFromHex(hex, alpha) {
	const rgb = hexToRgb(hex);
	if (!rgb) return `rgba(0,0,0,${alpha})`;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function prepareCanvas(canvasEl) {
	if (!canvasEl) return null;
	const rect = canvasEl.getBoundingClientRect();
	const cssWidth = Math.max(10, Math.floor(rect.width));
	const cssHeight = Math.max(10, Math.floor(rect.height));
	const dpr = window.devicePixelRatio || 1;
	const width = Math.floor(cssWidth * dpr);
	const height = Math.floor(cssHeight * dpr);
	if (canvasEl.width !== width) canvasEl.width = width;
	if (canvasEl.height !== height) canvasEl.height = height;
	const ctx = canvasEl.getContext('2d');
	if (!ctx) return null;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return { ctx, width: cssWidth, height: cssHeight };
}

function drawEmptyChart(canvasEl, message) {
	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = getCssVarValue('--muted', '#64748b');
	ctx.font = '12px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(message || 'No data', Math.floor(width / 2), Math.floor(height / 2));
}

function truncateLabel(label, maxLen) {
	const text = String(label || '');
	if (text.length <= maxLen) return text;
	return text.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function renderBarChart(canvasEl, rows) {
	if (!canvasEl) return;
	const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
	if (!items.length) {
		drawEmptyChart(canvasEl, 'No snippet usage yet');
		return;
	}
	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);

	const accent = getCssVarValue('--accent', '#f97316');
	const border = getCssVarValue('--border', '#e5e7ef');
	const text = getCssVarValue('--text', '#0f172a');
	const muted = getCssVarValue('--muted', '#64748b');

	const paddingTop = 10;
	const paddingRight = 10;
	const paddingBottom = 28;
	const paddingLeft = 34;
	const plotW = Math.max(10, width - paddingLeft - paddingRight);
	const plotH = Math.max(10, height - paddingTop - paddingBottom);
	const maxValue = Math.max.apply(null, items.map((row) => Number(row.expansionCount || 0)));
	const safeMax = Math.max(1, maxValue);

	// Axes
	ctx.strokeStyle = border;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(paddingLeft, paddingTop);
	ctx.lineTo(paddingLeft, paddingTop + plotH);
	ctx.lineTo(paddingLeft + plotW, paddingTop + plotH);
	ctx.stroke();

	// Y ticks
	ctx.fillStyle = muted;
	ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	const ticks = 4;
	for (let i = 0; i <= ticks; i++) {
		const t = i / ticks;
		const y = paddingTop + plotH - (t * plotH);
		const v = Math.round(t * safeMax);
		ctx.fillText(String(v), paddingLeft - 6, y);
		ctx.strokeStyle = rgbaFromHex(border, 0.55);
		ctx.beginPath();
		ctx.moveTo(paddingLeft, y);
		ctx.lineTo(paddingLeft + plotW, y);
		ctx.stroke();
	}

	const barCount = items.length;
	const gap = 8;
	const barW = Math.max(10, Math.floor((plotW - (gap * (barCount - 1))) / barCount));
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillStyle = text;
	ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

	for (let i = 0; i < barCount; i++) {
		const row = items[i];
		const value = Number(row.expansionCount || 0);
		const h = Math.round((value / safeMax) * plotH);
		const x = paddingLeft + (i * (barW + gap));
		const y = paddingTop + plotH - h;
		ctx.fillStyle = rgbaFromHex(accent, 0.85);
		ctx.fillRect(x, y, barW, h);
		ctx.fillStyle = text;
		const label = truncateLabel(row.abbreviation || row.name || '', 10);
		ctx.fillText(label, x + (barW / 2), paddingTop + plotH + 6);
	}
}

function renderPieLegend(legendEl, slices) {
	if (!legendEl) return;
	const items = Array.isArray(slices) ? slices.filter(Boolean) : [];
	if (!items.length) {
		legendEl.innerHTML = '';
		return;
	}
	legendEl.innerHTML = items.map((slice) => {
		const label = String(slice.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return `
			<div class="legend-row">
				<span class="swatch" style="background:${slice.color}"></span>
				<span class="legend-label">${label}</span>
				<span class="legend-value">${slice.percent}%</span>
			</div>
		`;
	}).join('');
}

function renderPieChart(canvasEl, perSnippet, legendEl) {
	if (!canvasEl) return;
	const rows = Array.isArray(perSnippet) ? perSnippet.filter(Boolean) : [];
	const total = rows.reduce((acc, r) => acc + Number(r.expansionCount || 0), 0);
	if (!total) {
		drawEmptyChart(canvasEl, 'No usage to chart');
		if (legendEl) legendEl.innerHTML = '';
		return;
	}

	const top = rows.slice().sort((a, b) => Number(b.expansionCount || 0) - Number(a.expansionCount || 0)).slice(0, 5);
	const topTotal = top.reduce((acc, r) => acc + Number(r.expansionCount || 0), 0);
	const rest = Math.max(0, total - topTotal);

	const accent = getCssVarValue('--accent', '#f97316');
	const muted = getCssVarValue('--muted', '#64748b');
	const border = getCssVarValue('--border', '#e5e7ef');
	const colors = [
		rgbaFromHex(accent, 0.90),
		rgbaFromHex(accent, 0.72),
		rgbaFromHex(accent, 0.58),
		rgbaFromHex(accent, 0.46),
		rgbaFromHex(accent, 0.34),
		rgbaFromHex(muted, 0.35)
	];

	const slices = [];
	for (let i = 0; i < top.length; i++) {
		const value = Number(top[i].expansionCount || 0);
		const percent = Math.round((value / total) * 100);
		slices.push({
			label: top[i].abbreviation || top[i].name || 'Snippet',
			value,
			percent,
			color: colors[i] || rgbaFromHex(accent, 0.5)
		});
	}
	if (rest) {
		slices.push({
			label: 'Other',
			value: rest,
			percent: Math.max(1, 100 - slices.reduce((acc, s) => acc + Number(s.percent || 0), 0)),
			color: colors[colors.length - 1]
		});
	}

	const prepared = prepareCanvas(canvasEl);
	if (!prepared) return;
	const { ctx, width, height } = prepared;
	ctx.clearRect(0, 0, width, height);

	const centerX = Math.floor(width / 2);
	const centerY = Math.floor(height / 2);
	const radius = Math.max(10, Math.floor(Math.min(width, height) / 2) - 12);
	let start = -Math.PI / 2;
	for (const slice of slices) {
		const angle = (slice.value / total) * (Math.PI * 2);
		ctx.beginPath();
		ctx.moveTo(centerX, centerY);
		ctx.arc(centerX, centerY, radius, start, start + angle);
		ctx.closePath();
		ctx.fillStyle = slice.color;
		ctx.fill();
		start += angle;
	}
	ctx.strokeStyle = rgbaFromHex(border, 0.6);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
	ctx.stroke();

	renderPieLegend(legendEl, slices);
}

function renderStatsCharts(statsPayload) {
	if (!statsPayload) return;
	const per = Array.isArray(statsPayload.perSnippet) ? statsPayload.perSnippet : [];
	renderBarChart(statsBarChartEl, per.slice(0, 8));
	renderPieChart(statsPieChartEl, per, statsPieLegendEl);
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
	const prefix = prefixMessage ? String(prefixMessage).trim() : '';
	const lead = prefix ? (prefix + ' ') : '';
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
		row.querySelector('.group-name').textContent = group.name;
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
				const ok = window.confirm(`Delete snippet "${snippet.name}"?`);
				if (!ok) return;
				await window.snipsApi.deleteSnippet(snippet.id);
				if (state.selectedSnippetId === snippet.id) {
					clearEditor();
				}
				await loadSnippets();
				showToast('Snippet deleted.', 'success', 1800);
			};
		}
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
	els.groupSelect.value = ('__all__' === state.selectedGroupId) ? 'default' : (state.selectedGroupId || 'default');
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
	await loadSnippetCounts();
	if (!state.selectedGroupId && state.groups.length) {
		state.selectedGroupId = state.groups[0].id;
	}
	renderGroups();
}

async function loadSnippets() {
	await loadSnippetCounts();
	const sort = els.snippetSortSelect ? String(els.snippetSortSelect.value || state.snippetSort || 'updated_desc') : (state.snippetSort || 'updated_desc');
	state.snippetSort = sort;
	state.snippets = await window.snipsApi.listSnippets({
		query: els.searchInput.value,
		groupId: ('__all__' === state.selectedGroupId) ? null : state.selectedGroupId,
		sort
	});
	renderSnippets();
	renderGroups();
	updateSnippetCountLabel();
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
	if (settingNameEl) settingNameEl.value = state.settings.userName || 'Local';
	if (settingWpmEl) settingWpmEl.value = state.settings.wpm || '220';
	if (settingHotkeyOpenSnipsEl) settingHotkeyOpenSnipsEl.value = state.settings.hotkeyOpenSnips || '';
	if (settingHotkeyNewSnippetEl) settingHotkeyNewSnippetEl.value = state.settings.hotkeyNewSnippet || '';
	if (settingHotkeyOpenSettingsEl) settingHotkeyOpenSettingsEl.value = state.settings.hotkeyOpenSettings || '';
	if (settingHotkeyOpenStatsEl) settingHotkeyOpenStatsEl.value = state.settings.hotkeyOpenStats || '';
	pendingAvatarDataUrl = null;
	applyUserCardFromSettings();
	applyAvatarPreviewFromSettings();
}


function applyUserCardFromSettings() {
	const avatar = (state.settings.userAvatar || '').trim();
	const name = (state.settings.userName || 'Local').trim() || 'Local';
	if (sidebarAvatarEl) {
		if (avatar && 0 === avatar.indexOf('data:image/')) {
			sidebarAvatarEl.innerHTML = `<img src="${avatar}" alt="" />`;
		} else {
			sidebarAvatarEl.textContent = avatar || '👤';
		}
	}
	if (sidebarNameEl) sidebarNameEl.textContent = name;
}

function applyAvatarPreviewFromSettings() {
	if (!settingAvatarPreviewEl) return;
	const avatar = (pendingAvatarDataUrl || state.settings.userAvatar || '').trim();
	if (avatar && 0 === avatar.indexOf('data:image/')) {
		settingAvatarPreviewEl.innerHTML = `<img src="${avatar}" alt="" />`;
		return;
	}
	settingAvatarPreviewEl.textContent = '👤';
}

function startOfMonth(dateObj) {
	return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1, 0, 0, 0, 0);
}

function endOfDay(dateObj) {
	return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);
}

function rangeFromUi() {
	const now = new Date();
	const choice = statsRangeSelectEl ? statsRangeSelectEl.value : '7d';
	let from;
	let to;
	let label;

	if ('30d' === choice) {
		to = now;
		from = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
		label = 'Last 30 days';
	} else if ('last_month' === choice) {
		const firstThisMonth = startOfMonth(now);
		const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
		from = startOfMonth(lastMonthEnd);
		to = endOfDay(lastMonthEnd);
		label = 'Last month';
	} else if ('this_month' === choice) {
		from = startOfMonth(now);
		to = now;
		label = 'This month';
	} else if ('custom' === choice) {
		const fromStr = statsFromEl ? statsFromEl.value : '';
		const toStr = statsToEl ? statsToEl.value : '';
		if (!fromStr || !toStr) {
			return null;
		}
		const fromDate = new Date(fromStr + 'T00:00:00');
		const toDate = new Date(toStr + 'T00:00:00');
		from = fromDate;
		to = endOfDay(toDate);
		label = 'Custom range';
	} else {
		to = now;
		from = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
		label = 'Last 7 days';
	}

	return {
		fromTs: from.getTime(),
		toTs: to.getTime(),
		label
	};
}

async function loadStats(rangeOverride) {
	const range = rangeOverride || rangeFromUi() || { fromTs: Date.now() - (7 * 24 * 60 * 60 * 1000), toTs: Date.now(), label: 'Last 7 days' };
	const stats = await window.snipsApi.getStats({ fromTs: range.fromTs, toTs: range.toTs });
	lastStatsForCharts = stats;
	const summary = stats.summary || { expansions: 0, timeSavedMs: 0 };
	els.weeklyStats.textContent = `${range.label}: ${summary.expansions || 0} expansions • ${formatDurationMs(summary.timeSavedMs || 0)} saved`;
	renderStatsCharts(stats);
	const rows = (stats.perSnippet || []).slice(0, 12).map((row) => {
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
	if (saveIcon) {
		saveIcon.innerHTML = ICONS.check;
		saveIcon.style.color = 'var(--muted)';
	}
	if (deleteIcon) {
		deleteIcon.innerHTML = ICONS.trash;
		deleteIcon.style.color = 'var(--muted)';
	}
	if (chevron) {
		chevron.innerHTML = ICONS.chevronClosed;
	}

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
				pendingAvatarDataUrl = String(reader.result || '');
				applyAvatarPreviewFromSettings();
				state.settings.userAvatar = pendingAvatarDataUrl;
				applyUserCardFromSettings();
			};
			reader.readAsDataURL(file);
		};
	}

	if (importCsvFileEl) {
		importCsvFileEl.onchange = () => {
			const files = importCsvFileEl.files ? Array.from(importCsvFileEl.files) : [];
			if (!files.length || !importCsvGroupNameEl) return;
			if (1 === files.length) {
				const name = groupNameFromFilename(files[0].name);
				if (name && !importCsvGroupNameEl.value) {
					importCsvGroupNameEl.value = name;
				}
			} else {
				// Multiple files: use per-file group names (filenames). Keep group name input as-is.
			}
		};
	}

	if (importCsvBtnEl) {
		importCsvBtnEl.onclick = async (e) => {
			e.preventDefault();
			const files = importCsvFileEl && importCsvFileEl.files ? Array.from(importCsvFileEl.files) : [];
			if (!files.length) {
				showToast('Choose one or more CSV files to import.', 'warning', 2600);
				return;
			}
			importCsvBtnEl.disabled = true;
			try {
				if (1 === files.length) {
					const groupName = importCsvGroupNameEl ? String(importCsvGroupNameEl.value || '').trim() : '';
					if (!groupName) {
						showToast('Enter a group name for this import.', 'warning', 2600);
						if (importCsvGroupNameEl) importCsvGroupNameEl.focus();
						return;
					}
					await importCsvFiles(files, { groupName });
				} else {
					await importCsvFiles(files, { groupName: null });
				}
			} catch (err) {
				showToast(err && err.message ? err.message : 'Import failed.', 'error', 4200);
			} finally {
				importCsvBtnEl.disabled = false;
			}
		};
	}

	if (importCsvDropZoneEl) {
		const prevent = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};
		importCsvDropZoneEl.addEventListener('dragenter', (e) => { prevent(e); importCsvDropZoneEl.classList.add('drag-over'); });
		importCsvDropZoneEl.addEventListener('dragover', (e) => { prevent(e); importCsvDropZoneEl.classList.add('drag-over'); });
		importCsvDropZoneEl.addEventListener('dragleave', (e) => { prevent(e); importCsvDropZoneEl.classList.remove('drag-over'); });
		importCsvDropZoneEl.addEventListener('drop', async (e) => {
			prevent(e);
			importCsvDropZoneEl.classList.remove('drag-over');
			const dt = e.dataTransfer;
			const files = dt && dt.files ? Array.from(dt.files) : [];
			const csvs = files.filter((f) => f && (/\.csv$/i.test(f.name) || (f.type && 0 === f.type.indexOf('text/'))));
			if (!csvs.length) {
				showToast('Drop one or more .csv files.', 'warning', 2600);
				return;
			}
			if (importCsvBtnEl) importCsvBtnEl.disabled = true;
			try {
				await importCsvFiles(csvs, { groupName: null });
			} finally {
				if (importCsvBtnEl) importCsvBtnEl.disabled = false;
			}
		});
	}

	if (statsRangeSelectEl) {
		statsRangeSelectEl.onchange = async () => {
			const isCustom = 'custom' === statsRangeSelectEl.value;
			if (statsCustomRangeEl) statsCustomRangeEl.classList.toggle('is-hidden', !isCustom);
			if (!isCustom) {
				await loadStats();
			}
		};
	}
	if (statsApplyBtnEl) {
		statsApplyBtnEl.onclick = async (e) => {
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
		if (!lastStatsForCharts) return;
		renderStatsCharts(lastStatsForCharts);
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
			showToast('Helper is still offline. Try quitting SnipsHelper (pkill) and clicking Restart Helper again.', 'warning', 6500);
			return;
		}
		await notifyHelperHealth('');
	};

	document.getElementById('newGroupBtn').onclick = async (e) => {
		e.preventDefault();
		openGroupModal();
	};
	
	document.getElementById('newSnippetBtn').onclick = () => {
		show_view('libraryView');
		clearEditor();
	};
	
	document.getElementById('saveSnippetBtn').onclick = async () => {
		await window.snipsApi.saveSnippet(snippetFormToPayload());
		await loadSnippets();
		await notifyHelperHealth('Snippet saved.');
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
		const wpm = settingWpmEl ? Number(settingWpmEl.value || 0) : 0;
		if (settingWpmEl && (!wpm || wpm < 60 || wpm > 500)) {
			showToast('Words per minute must be between 60 and 500.', 'warning', 3200);
			settingWpmEl.focus();
			return;
		}
		await window.snipsApi.saveSettings({
			userAvatar: pendingAvatarDataUrl || state.settings.userAvatar || '',
			userName: settingNameEl ? settingNameEl.value : 'Local',
			wpm: settingWpmEl ? String(settingWpmEl.value || '220') : '220',
			hotkeyOpenSnips: settingHotkeyOpenSnipsEl ? settingHotkeyOpenSnipsEl.value : '',
			hotkeyNewSnippet: settingHotkeyNewSnippetEl ? settingHotkeyNewSnippetEl.value : '',
			hotkeyOpenSettings: settingHotkeyOpenSettingsEl ? settingHotkeyOpenSettingsEl.value : '',
			hotkeyOpenStats: settingHotkeyOpenStatsEl ? settingHotkeyOpenStatsEl.value : '',
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

	window.snipsApi.onNavShow(async (payload) => {
		if (!payload) return;
		if (payload.view) {
			show_view(payload.view);
			if ('settingsView' === payload.view) await loadSettings();
			if ('statsView' === payload.view) await loadStats();
		}
		if ('newSnippet' === payload.action) {
			clearEditor();
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
