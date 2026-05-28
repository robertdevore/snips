/**
 * IPC handler registration for Snips.
 *
 * All ipcMain.handle / ipcMain.on registrations are collected here.
 * Called once from main.js after DB, helper bridge, and windows are initialized.
 */

const { app, ipcMain, clipboard } = require('electron');
const { extractFillFields, renderTemplate } = require('./template-renderer');
const { importCsv } = require('./import-csv');

/**
 * Registers all IPC handlers on the ipcMain object.
 * @param {object} deps
 * @param {object} deps.db - SnipsDb instance
 * @param {object} deps.helperBridge - HelperBridge instance
 * @param {object} deps.helperStatus - Mutable helper status object
 * @param {Function} deps.syncHelperConfig - async function to sync config to helper
 * @param {Function} deps.syncHelperConfigWithRetry - sync with retry
 * @param {Function} deps.registerGlobalHotkey - re-registers global shortcuts
 * @param {Function} deps.refreshTray - refreshes tray icon/menu
 * @param {Function} deps.showPalette - shows the palette window
 * @param {Function} deps.findHelperBinaryPath - resolves helper binary path
 * @param {Function} deps.restartHelper - restarts the helper process
 * @param {object} deps.mainWindow - main BrowserWindow reference
 * @param {object} deps.fillWindow - fill BrowserWindow reference
 */
function registerHandlers(deps) {
	const {
		db,
		helperBridge,
		helperStatus,
		syncHelperConfig,
		syncHelperConfigWithRetry,
		registerGlobalHotkey,
		refreshTray,
		showPalette,
		findHelperBinaryPath,
		restartHelper,
		mainWindow,
		fillWindow
	} = deps;

	// --- Groups ---

	ipcMain.handle('groups:list', () => db.listGroups());

	ipcMain.handle('groups:save', async (_event, group) => {
		const saved = db.saveGroup(group);
		await syncHelperConfigWithRetry();
		return saved;
	});

	ipcMain.handle('groups:delete', async (_event, groupId) => {
		db.deleteGroup(groupId);
		await syncHelperConfig().catch(() => {});
		return { ok: true };
	});

	// --- Snippets ---

	ipcMain.handle('snippets:counts', () => db.getSnippetCounts());

	ipcMain.handle('snippets:list', (_event, args) => db.listSnippets(args || {}));

	ipcMain.handle('snippets:get', (_event, id) => db.getSnippet(id));

	ipcMain.handle('snippets:save', async (_event, snippet) => {
		const saved = db.saveSnippet(snippet);
		await syncHelperConfigWithRetry();
		return saved;
	});

	ipcMain.handle('snippets:delete', async (_event, id) => {
		db.deleteSnippet(id);
		await syncHelperConfigWithRetry();
		return { ok: true };
	});

	ipcMain.handle('snippets:test-render', async (_event, snippet) => {
		const fillValues = {};
		const fields = extractFillFields(snippet.content || '');
		for (const field of fields) {
			fillValues[field.label] = field.defaultValue;
		}
		const rendered = renderTemplate(snippet.content || '', {
			clipboard: clipboard.readText(),
			fillValues
		});
		return { rendered };
	});

	// --- Settings ---

	ipcMain.handle('settings:get', () => db.getSettings());

	ipcMain.handle('settings:save', async (_event, settings) => {
		const saved = db.saveSettings(settings);
		registerGlobalHotkey();
		await syncHelperConfigWithRetry();
		refreshTray();
		return saved;
	});

	// --- Import ---

	ipcMain.handle('import:csv', async (_event, payload) => {
		try {
			return await importCsv(db, payload, syncHelperConfigWithRetry);
		} catch (error) {
			return { ok: false, message: error && error.message ? error.message : 'Import failed.' };
		}
	});

	// --- Stats ---

	ipcMain.handle('stats:get', (_event, range) => db.getStats(range));

	// --- Palette ---

	ipcMain.handle('palette:open', () => {
		showPalette();
		return { ok: true };
	});

	ipcMain.handle('palette:insert', async (_event, snippetId) => {
		return helperBridge.insertById(snippetId).catch(() => ({ ok: false, message: 'Helper unavailable' }));
	});

	// --- Helper ---

	ipcMain.handle('helper:status', () => helperStatus);

	ipcMain.handle('helper:restart', async () => {
		const helperBinary = findHelperBinaryPath();
		if (!helperBinary) {
			return {
				ok: false,
				started: false,
				reachable: false,
				helperBinary: null,
				message: 'Helper binary not found. Rebuild helper and repackage the app.',
				status: helperStatus
			};
		}
		const result = await restartHelper();
		await syncHelperConfigWithRetry();
		if (!result.started) {
			return {
				ok: false,
				started: false,
				reachable: false,
				helperBinary,
				message: 'Helper failed to start (spawn failed or blocked by macOS).',
				status: helperStatus
			};
		}
		if (!result.reachable) {
			return {
				ok: false,
				started: true,
				reachable: false,
				helperBinary,
				message: 'Helper launched but did not become reachable. It may be crashing on startup.',
				status: helperStatus
			};
		}
		return { ok: true, started: true, reachable: true, helperBinary, status: helperStatus };
	});

	ipcMain.handle('helper:open-a11y', async () => {
		const { shell } = require('electron');
		await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
		return { ok: true };
	});

	ipcMain.handle('helper:reveal-binary', async () => {
		const { shell } = require('electron');
		const helperBinary = findHelperBinaryPath();
		if (!helperBinary) {
			return { ok: false, message: 'Helper binary not found' };
		}
		shell.showItemInFolder(helperBinary);
		return { ok: true, helperBinary };
	});

	ipcMain.handle('helper:request-accessibility', async () => {
		try {
			const response = await helperBridge.sendCommand({ type: 'request_accessibility', payload: {} });
			helperStatus.running = true;
			helperStatus.accessibilityEnabled = !!response.accessibilityEnabled;
			helperStatus.secureInput = !!response.secureInput;
			refreshTray();
			_broadcastHelperStatus();
			return response;
		} catch (_error) {
			return { ok: false, message: 'Helper unavailable' };
		}
	});

	ipcMain.handle('helper:request-input-monitoring', async () => {
		try {
			const response = await helperBridge.sendCommand({ type: 'request_input_monitoring', payload: {} });
			helperStatus.running = true;
			helperStatus.listenEventAccess = !!response.listenEventAccess;
			helperStatus.accessibilityEnabled = !!response.accessibilityEnabled;
			helperStatus.postEventAccess = !!response.postEventAccess;
			helperStatus.eventTapActive = !!response.eventTapActive;
			helperStatus.secureInput = !!response.secureInput;
			refreshTray();
			_broadcastHelperStatus();
			return response;
		} catch (_error) {
			return { ok: false, message: 'Helper unavailable' };
		}
	});

	// --- Fill response ---

	ipcMain.on('fill:respond', async (_event, payload) => {
		const requestId = payload.requestId;
		const values = payload.values || {};
		const cancelled = !!payload.cancelled;
		if (fillWindow && !fillWindow.isDestroyed()) {
			try {
				fillWindow.hide();
			} catch (_error) {
				// Ignore
			}
			setTimeout(() => {
				try {
					fillWindow.close();
				} catch (_error) {
					// Ignore
				}
			}, 250);
		}
		try {
			app.hide();
		} catch (_error) {
			// Ignore
		}
		await new Promise((resolve) => setTimeout(resolve, 220));
		helperBridge
			.sendCommand({
				type: 'fill_response',
				payload: { requestId, values, cancelled }
			})
			.catch(() => {});
	});

	/**
	 * Broadcasts helper status to the main window if it exists.
	 */
	function _broadcastHelperStatus() {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('helper:status', helperStatus);
		}
	}
}

module.exports = { registerHandlers };
