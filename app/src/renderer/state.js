export const state = {
	groups: [],
	snippets: [],
	selectedGroupId: '__all__',
	selectedSnippetId: null,
	settings: {},
	snippetCounts: { total: 0, byGroup: {} },
	snippetSort: 'updated_desc',
	lastSavedSnapshot: null
};

export const els = {};

export function initEls() {
	els.groups = document.getElementById('groups');
	els.helperStatus = document.getElementById('helperStatus');
	els.searchInput = document.getElementById('searchInput');
	els.snippetList = document.getElementById('snippetList');
	els.snippetCountLabel = document.getElementById('snippetCountLabel');
	els.snippetSortSelect = document.getElementById('snippetSortSelect');
	els.groupSelect = document.getElementById('groupSelect');
	els.nameInput = document.getElementById('nameInput');
	els.abbrInput = document.getElementById('abbrInput');
	els.enabledInput = document.getElementById('enabledInput');
	els.favoriteInput = document.getElementById('favoriteInput');
	els.triggerInput = document.getElementById('triggerInput');
	els.contentInput = document.getElementById('contentInput');
	els.tagsInput = document.getElementById('tagsInput');
	els.notesInput = document.getElementById('notesInput');
	els.weeklyStats = document.getElementById('weeklyStats');
	els.topStats = document.getElementById('topStats');
	els.settingEnabled = document.getElementById('settingEnabled');
	els.settingHotkey = document.getElementById('settingHotkey');
	els.settingBuffer = document.getElementById('settingBuffer');
	els.settingExcluded = document.getElementById('settingExcluded');
}

export const extra = {
	sidebarAvatarEl: null,
	sidebarNameEl: null,
	settingAvatarPreviewEl: null,
	helperPathEl: null,
	lastStatsForCharts: null,
	helperStatusLast: null,
	pendingAvatarDataUrl: null,
	statsBarChartEl: null,
	statsPieChartEl: null,
	statsPieLegendEl: null,
	statsFromEl: null,
	statsToEl: null,
	statsApplyBtnEl: null,
	statsRangeSelectEl: null,
	statsCustomRangeEl: null,
	importCsvFileEl: null,
	importCsvGroupNameEl: null,
	importCsvBtnEl: null,
	importCsvDropZoneEl: null,
	settingHotkeyOpenSnipsEl: null,
	settingHotkeyNewSnippetEl: null,
	settingHotkeyOpenSettingsEl: null,
	settingHotkeyOpenStatsEl: null
};

export const modalState = {
	groupModalMode: 'create',
	groupModalEditingId: null
};

export function initExtraEls() {
	extra.sidebarAvatarEl = document.getElementById('sidebarAvatar');
	extra.sidebarNameEl = document.getElementById('sidebarName');
	extra.settingAvatarPreviewEl = document.getElementById('settingAvatarPreview');
	extra.helperPathEl = document.getElementById('helperPath');
	extra.statsBarChartEl = document.getElementById('statsBarChart');
	extra.statsPieChartEl = document.getElementById('statsPieChart');
	extra.statsPieLegendEl = document.getElementById('statsPieLegend');
	extra.statsFromEl = document.getElementById('statsFrom');
	extra.statsToEl = document.getElementById('statsTo');
	extra.statsApplyBtnEl = document.getElementById('statsApplyBtn');
	extra.statsRangeSelectEl = document.getElementById('statsRangeSelect');
	extra.statsCustomRangeEl = document.getElementById('statsCustomRange');
	extra.importCsvFileEl = document.getElementById('importCsvFile');
	extra.importCsvGroupNameEl = document.getElementById('importCsvGroupName');
	extra.importCsvBtnEl = document.getElementById('importCsvBtn');
	extra.importCsvDropZoneEl = document.getElementById('importCsvDropZone');
	extra.settingHotkeyOpenSnipsEl = document.getElementById('settingHotkeyOpenSnips');
	extra.settingHotkeyNewSnippetEl = document.getElementById('settingHotkeyNewSnippet');
	extra.settingHotkeyOpenSettingsEl = document.getElementById('settingHotkeyOpenSettings');
	extra.settingHotkeyOpenStatsEl = document.getElementById('settingHotkeyOpenStats');
}
