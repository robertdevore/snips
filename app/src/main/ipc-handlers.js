/**
 * IPC handler registration for Snips.
 *
 * All ipcMain.handle / ipcMain.on registrations are collected here.
 * Called once from main.js after DB, helper bridge, and windows are initialized.
 */

const { app, ipcMain, clipboard } = require('electron');
const { extractFillFields, renderTemplate } = require('./template-renderer');
const { importCsv } = require('./import-csv');
const { validateSnippet } = require('./validation');

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
 * @param {Function} deps.getFillWindow - returns the current fill BrowserWindow reference
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
		fillWindow,
		getFillWindow
	} = deps;

	function handle(channel, handler) {
		ipcMain.handle(channel, (event, ...args) => {
			const { pathToFileURL } = require('url');
			const path = require('path');
			const pages =
				channel === 'snippets:list' || channel === 'palette:insert'
					? ['index.html', 'palette.html']
					: ['index.html'];
			if (
				event.senderFrame !== event.sender.mainFrame ||
				!pages.some(
					(page) => event.senderFrame.url === pathToFileURL(path.join(__dirname, '../renderer', page)).href
				)
			)
				throw new Error('UNTRUSTED_SENDER');
			return handler(event, ...args);
		});
	}

	// --- Groups ---

	handle('groups:list', () => db.listGroups());

	handle('groups:save', async (_event, group) => {
		const saved = db.saveGroup(group);
		await syncHelperConfigWithRetry();
		return saved;
	});

	handle('groups:delete', async (_event, groupId) => {
		db.deleteGroup(groupId);
		await syncHelperConfig().catch(() => {});
		return { ok: true };
	});

	// --- Snippets ---

	handle('snippets:counts', () => db.getSnippetCounts());

	handle('snippets:list', (_event, args) => db.listSnippets(args || {}));

	handle('snippets:get', (_event, id) => db.getSnippet(id));

	handle('snippets:save', async (_event, snippet) => {
		const validation = validateSnippet(snippet);
		if (!validation.valid) {
			return { ok: false, errors: validation.errors };
		}

		// Check for duplicate abbreviation
		const abbr = String(snippet.abbreviation || '').trim();
		if (abbr) {
			const existing = db.getSnippetByAbbreviation(abbr);
			if (existing && existing.id !== snippet.id) {
				return {
					ok: false,
					errors: [
						{
							field: 'abbreviation',
							message: `Abbreviation "${abbr}" is already used by snippet "${existing.name}".`
						}
					]
				};
			}
		}

		let saved;
		try {
			saved = db.saveSnippet(snippet);
		} catch (error) {
			return {
				ok: false,
				error: { code: error.code || 'SAVE_FAILED' },
				errors: [
					{
						field: 'snippet',
						message:
							error.code === 'REVISION_CONFLICT'
								? 'Changed outside this editor. Copy your draft, reload, and retry.'
								: error.message
					}
				]
			};
		}
		await syncHelperConfigWithRetry();
		return saved;
	});

	handle('snippets:delete', async (_event, id) => {
		db.deleteSnippet(id);
		await syncHelperConfigWithRetry();
		return { ok: true };
	});

	handle('snippets:test-render', async (_event, snippet) => {
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

	handle('settings:get', () => db.getSettings());

	handle('settings:save', async (_event, settings) => {
		const saved = db.saveSettings(settings);
		registerGlobalHotkey();
		await syncHelperConfigWithRetry();
		refreshTray();
		return saved;
	});

	// --- Import ---

	handle('import:csv', async (_event, payload) => {
		try {
			return await importCsv(db, payload, syncHelperConfigWithRetry);
		} catch (error) {
			return { ok: false, message: error && error.message ? error.message : 'Import failed.' };
		}
	});
	// --- Export ---

	handle('export:json', async () => {
		const groups = db.listGroups();
		const snippets = db.listSnippets();
		return {
			version: 1,
			exportedAt: Date.now(),
			appVersion: app.getVersion(),
			groups,
			snippets
		};
	});
	// --- Stats ---

	handle('stats:get', (_event, range) => db.getStats(range));

	handle('stats:reset', (_event, snippetId) => {
		db.resetStats(snippetId || null);
		return { ok: true };
	});

	handle('stats:export', (_event, range) => {
		const stats = db.getStats(range || {});
		return { ok: true, data: stats };
	});

	// --- Window ---

	handle('window:show', () => {
		const { showMainWindow } = deps;
		if (typeof showMainWindow === 'function') showMainWindow();
		return { ok: true };
	});

	handle('palette:open', () => {
		showPalette();
		return { ok: true };
	});

	handle('palette:insert', async (_event, snippetId) => {
		return helperBridge.insertById(snippetId).catch(() => ({ ok: false, message: 'Helper unavailable' }));
	});

	// --- Helper ---

	handle('helper:status', () => helperStatus);
	handle('cli:install', () =>
		require('./cli-install').installCli({
			home: app.getPath('home'),
			executable: process.execPath,
			entry: require('path').join(app.getAppPath(), 'cli/index.js')
		})
	);
	handle('helper:upgrade', async () => {
		const result = await restartHelper(true);
		await syncHelperConfigWithRetry();
		return {
			...result,
			message:
				'Helper upgraded. If expansion is unavailable, re-enable SnipsHelper.app in Accessibility and Input Monitoring.'
		};
	});
	handle('snippets:batch', async (_event, operations) => {
		const result = require('./operations').execute(db, operations, { source: 'gui' });
		await syncHelperConfigWithRetry();
		return result;
	});
	handle('snippets:purge', (_event, id) => db.purgeSnippet(id));
	handle('snippets:trash', () => db.listSnippets({ trash: true, limit: 500 }));
	handle('snippets:restore', async (_event, id) => {
		const result = db.changeTrash(id, false);
		await syncHelperConfigWithRetry();
		return result;
	});
	handle('snippets:history-detail', (_event, id, historyId) => db.historyEntry(id, historyId));
	handle('snippets:history', (_event, id) => db.history(id));
	handle('snippets:revert', async (_event, payload) => {
		const result = require('./operations').execute(db, [{ type: 'revert', ...payload }], { source: 'gui' });
		await syncHelperConfigWithRetry();
		return result;
	});

	handle('helper:restart', async () => {
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

	handle('helper:open-a11y', async () => {
		const { shell } = require('electron');
		await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
		return { ok: true };
	});

	handle('helper:reveal-binary', async () => {
		const { shell } = require('electron');
		const helperBinary = findHelperBinaryPath();
		if (!helperBinary) {
			return { ok: false, message: 'Helper binary not found' };
		}
		shell.showItemInFolder(helperBinary);
		return { ok: true, helperBinary };
	});

	handle('helper:request-accessibility', async () => {
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

	handle('helper:request-input-monitoring', async () => {
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
		if (
			_event.senderFrame !== _event.sender.mainFrame ||
			_event.senderFrame.url !==
				require('url').pathToFileURL(require('path').join(__dirname, '../renderer/fill.html')).href
		)
			return;
		if (
			!payload ||
			typeof payload.requestId !== 'string' ||
			typeof payload.values !== 'object' ||
			Object.keys(payload.values || {}).length > 50
		)
			return;
		const requestId = payload.requestId;
		const values = payload.values || {};
		const cancelled = !!payload.cancelled;
		const activeFillWindow = typeof getFillWindow === 'function' ? getFillWindow() : fillWindow;
		if (activeFillWindow && !activeFillWindow.isDestroyed()) {
			try {
				activeFillWindow.hide();
			} catch (_error) {
				// Ignore
			}
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
		if (deps.broadcast) deps.broadcast('helper:status', helperStatus);
		else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('helper:status', helperStatus);
	}
}

module.exports = { registerHandlers };
