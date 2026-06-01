const { contextBridge, ipcRenderer } = require('electron');

/**
 * Snips renderer API — exposed to the renderer process via contextBridge.
 *
 * All methods use ipcRenderer.invoke for request/response IPC.
 * Event listeners use ipcRenderer.on for push notifications from main process.
 *
 * @typedef {object} SnipsApi
 * @property {() => Promise<Group[]>} listGroups
 * @property {(group: object) => Promise<Group>} saveGroup
 * @property {(groupId: string) => Promise<{ok: boolean}>} deleteGroup
 * @property {(args?: object) => Promise<Snippet[]>} listSnippets
 * @property {() => Promise<SnippetCounts>} getSnippetCounts
 * @property {(id: string) => Promise<Snippet|null>} getSnippet
 * @property {(snippet: object) => Promise<Snippet>} saveSnippet
 * @property {(id: string) => Promise<{ok: boolean}>} deleteSnippet
 * @property {(snippet: object) => Promise<{rendered: string}>} testRenderSnippet
 * @property {() => Promise<Settings>} getSettings
 * @property {(settings: object) => Promise<Settings>} saveSettings
 * @property {(range?: object) => Promise<StatsResult>} getStats
 * @property {(payload: object) => Promise<object>} importCsv
 * @property {() => Promise<{ok: boolean}>} openPalette
 * @property {(snippetId: string) => Promise<object>} insertByPalette
 * @property {() => Promise<object>} getHelperStatus
 * @property {() => Promise<{ok: boolean}>} openAccessibilitySettings
 * @property {() => Promise<object>} restartHelper
 * @property {() => Promise<object>} revealHelperBinary
 * @property {() => Promise<object>} requestAccessibility
 * @property {() => Promise<object>} requestInputMonitoring
 * @property {(handler: Function) => void} onStatsUpdated
 * @property {(handler: Function) => void} onHelperStatus
 * @property {(handler: Function) => void} onPaletteShow
 * @property {(handler: Function) => void} onNavShow
 */

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
	resetStats: (snippetId) => ipcRenderer.invoke('stats:reset', snippetId),
	exportStats: (range) => ipcRenderer.invoke('stats:export', range),
	importCsv: (payload) => ipcRenderer.invoke('import:csv', payload),
	exportJson: () => ipcRenderer.invoke('export:json'),
	showMainWindow: () => ipcRenderer.invoke('window:show'),
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
