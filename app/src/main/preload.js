const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snipsApi', {
	listGroups: () => ipcRenderer.invoke('groups:list'),
	saveGroup: (group) => ipcRenderer.invoke('groups:save', group),
	deleteGroup: (groupId) => ipcRenderer.invoke('groups:delete', groupId),
	listSnippets: (args) => ipcRenderer.invoke('snippets:list', args),
	getSnippetCounts: () => ipcRenderer.invoke('snippets:counts'),
	getSnippet: (id) => ipcRenderer.invoke('snippets:get', id),
	saveSnippet: (snippet) => ipcRenderer.invoke('snippets:save', snippet),
	deleteSnippet: (id) => ipcRenderer.invoke('snippets:delete', id),
	testRenderSnippet: (snippet) => ipcRenderer.invoke('snippets:test-render', snippet),
	getSettings: () => ipcRenderer.invoke('settings:get'),
	saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
	getStats: (range) => ipcRenderer.invoke('stats:get', range),
	importCsv: (payload) => ipcRenderer.invoke('import:csv', payload),
	openPalette: () => ipcRenderer.invoke('palette:open'),
	insertByPalette: (snippetId) => ipcRenderer.invoke('palette:insert', snippetId),
	getHelperStatus: () => ipcRenderer.invoke('helper:status'),
	openAccessibilitySettings: () => ipcRenderer.invoke('helper:open-a11y'),
	restartHelper: () => ipcRenderer.invoke('helper:restart'),
	revealHelperBinary: () => ipcRenderer.invoke('helper:reveal-binary'),
	requestAccessibility: () => ipcRenderer.invoke('helper:request-accessibility'),
	requestInputMonitoring: () => ipcRenderer.invoke('helper:request-input-monitoring'),
	onStatsUpdated: (handler) => ipcRenderer.on('stats:updated', handler),
	onHelperStatus: (handler) => ipcRenderer.on('helper:status', (_event, payload) => handler(payload)),
	onPaletteShow: (handler) => ipcRenderer.on('palette:show', handler),
	onNavShow: (handler) => ipcRenderer.on('nav:show', (_event, payload) => handler(payload))
});
