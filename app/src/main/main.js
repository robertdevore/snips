const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFile, execFileSync } = require('child_process');
const { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, clipboard } = require('electron');
const { SnipsDb } = require('./db');
const { HelperBridge } = require('./helper-bridge');
const { extractFillFields, renderTemplate } = require('./template-renderer');

let mainWindow;
let paletteWindow;
let fillWindow;
let tray;
let db;
let helperBridge;
let helperStatus = {
	secureInput: false,
	accessibilityEnabled: false,
	listenEventAccess: false,
	postEventAccess: false,
	eventTapActive: false,
	helperExecutable: '',
	running: false
};

function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1180,
		height: 760,
		title: 'Snips',
		titleBarStyle: 'hiddenInset',
		titleBarOverlay: true,
		backgroundColor: '#f5f6f8',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function createPaletteWindow() {
	paletteWindow = new BrowserWindow({
		width: 560,
		height: 420,
		show: false,
		alwaysOnTop: true,
		resizable: false,
		frame: false,
		transparent: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	paletteWindow.loadFile(path.join(__dirname, '../renderer/palette.html'));
	paletteWindow.on('blur', () => {
		paletteWindow.hide();
	});
}

function createFillWindow() {
	fillWindow = new BrowserWindow({
		width: 420,
		height: 320,
		show: false,
		alwaysOnTop: true,
		resizable: false,
		minimizable: false,
		maximizable: false,
		title: 'Snips',
		backgroundColor: '#f5f6f8',
		webPreferences: {
			preload: path.join(__dirname, 'preload-fill.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	fillWindow.loadFile(path.join(__dirname, '../renderer/fill.html'));
}

function refreshTray() {
	if (!tray) {
		return;
	}
	const stateLabel = helperStatus.secureInput ? 'Secure Input active' : (helperStatus.running ? 'Running' : 'Helper offline');
	tray.setToolTip(`Snips - ${stateLabel}`);
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Open Snips', click: () => mainWindow.show() },
		{ label: 'Open Palette', click: () => showPalette() },
		{ type: 'separator' },
		{
			label: 'Pause Expansions',
			type: 'checkbox',
			checked: 'true' === db.getSettings().pauseExpansions,
			click: () => {
				const settings = db.getSettings();
				const paused = 'true' !== settings.pauseExpansions;
				db.saveSettings({ pauseExpansions: String(paused) });
				syncHelperConfig().catch(() => {});
			}
		},
		{ type: 'separator' },
		{ label: 'Quit', click: () => app.quit() }
	]);
	tray.setContextMenu(contextMenu);
}

function setupTray() {
	const tinyTemplate = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAHElEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjAIA6RQAAR2j8E4AAAAASUVORK5CYII=';
	const icon = nativeImage.createFromDataURL(tinyTemplate);
	icon.setTemplateImage(true);
	tray = new Tray(icon);
	tray.on('click', () => {
		mainWindow.show();
	});
	refreshTray();
}

function showPalette() {
	paletteWindow.center();
	paletteWindow.show();
	paletteWindow.focus();
	paletteWindow.webContents.send('palette:show');
}

function registerGlobalHotkey() {
	globalShortcut.unregisterAll();
	const settings = db.getSettings();
	const shortcut = settings.globalHotkey || 'CommandOrControl+Shift+Space';
	const used = {};

	function reg(key, handler) {
		const value = (key || '').trim();
		if (!value) return;
		if (used[value]) return;
		used[value] = true;
		try {
			globalShortcut.register(value, handler);
		} catch (_error) {
			// Ignore invalid shortcuts
		}
	}

	reg(shortcut, () => {
		showPalette();
	});

	reg(settings.hotkeyOpenSnips, () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.show();
			mainWindow.focus();
		}
	});

	reg(settings.hotkeyNewSnippet, () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.show();
			mainWindow.focus();
			mainWindow.webContents.send('nav:show', { view: 'libraryView', action: 'newSnippet' });
		}
	});

	reg(settings.hotkeyOpenSettings, () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.show();
			mainWindow.focus();
			mainWindow.webContents.send('nav:show', { view: 'settingsView' });
		}
	});

	reg(settings.hotkeyOpenStats, () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.show();
			mainWindow.focus();
			mainWindow.webContents.send('nav:show', { view: 'statsView' });
		}
	});
}

async function syncHelperConfig() {
	const settings = db.getSettings();
	helperBridge.updatePorts({
		host: settings.helperHost,
		port: settings.helperPort,
		appEventPort: settings.appEventPort
	});
	const snippets = db.getEnabledSnippetsForHelper();
	const response = await helperBridge.sendConfig({ snippets, settings });
	helperStatus.running = true;
	helperStatus.accessibilityEnabled = !!response.accessibilityEnabled;
	helperStatus.listenEventAccess = !!response.listenEventAccess;
	helperStatus.postEventAccess = !!response.postEventAccess;
	helperStatus.eventTapActive = !!response.eventTapActive;
	helperStatus.helperExecutable = response.helperExecutable || helperStatus.helperExecutable || '';
	if (Object.prototype.hasOwnProperty.call(response, 'secureInput')) {
		helperStatus.secureInput = !!response.secureInput;
	}
	refreshTray();
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('helper:status', helperStatus);
	}
}

function findHelperBinaryPath() {
	const packagedArm = path.join(process.resourcesPath || '', 'helper-build', 'arm64-apple-macosx', 'release', 'SnipsHelper');
	const packagedX64 = path.join(process.resourcesPath || '', 'helper-build', 'x86_64-apple-macosx', 'release', 'SnipsHelper');
	const devArm = path.resolve(__dirname, '../../../helper/.build/arm64-apple-macosx/release/SnipsHelper');
	const devX64 = path.resolve(__dirname, '../../../helper/.build/x86_64-apple-macosx/release/SnipsHelper');
	const devFallback = path.resolve(__dirname, '../../../helper/.build/release/SnipsHelper');

	let userAppHelperBinary = null;
	try {
		const userHelperDir = path.join(app.getPath('userData'), 'helper');
		const userAppPath = path.join(userHelperDir, 'SnipsHelper.app');
		const userMacOsDir = path.join(userAppPath, 'Contents', 'MacOS');
		const userResourcesDir = path.join(userAppPath, 'Contents', 'Resources');
		const userHelperPath = path.join(userMacOsDir, 'SnipsHelper');
		const userInfoPlistPath = path.join(userAppPath, 'Contents', 'Info.plist');
		const sourcePreferred = ('arm64' === process.arch)
			? [packagedArm, devArm, packagedX64, devX64, devFallback]
			: [packagedX64, devX64, packagedArm, devArm, devFallback];
		let source = null;
		for (const candidate of sourcePreferred) {
			if (candidate && fs.existsSync(candidate)) {
				source = candidate;
				break;
			}
		}
		if (source) {
			fs.mkdirSync(userMacOsDir, { recursive: true });
			fs.mkdirSync(userResourcesDir, { recursive: true });
			let shouldCopy = !fs.existsSync(userHelperPath);
			if (!shouldCopy) {
				try {
					shouldCopy = fs.statSync(source).size !== fs.statSync(userHelperPath).size;
				} catch (_error) {
					shouldCopy = true;
				}
			}
			if (shouldCopy) {
				fs.copyFileSync(source, userHelperPath);
				try {
					fs.chmodSync(userHelperPath, 0o755);
				} catch (_error) {
					// Ignore
				}
			}
			if (!fs.existsSync(userInfoPlistPath)) {
				const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>\n\t<key>CFBundleExecutable</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.snips.helper</string>\n\t<key>CFBundleInfoDictionaryVersion</key>\n\t<string>6.0</string>\n\t<key>CFBundleName</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundlePackageType</key>\n\t<string>APPL</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>0.2.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>0.2.0</string>\n\t<key>LSUIElement</key>\n\t<true/>\n</dict>\n</plist>\n`;
				fs.mkdirSync(path.dirname(userInfoPlistPath), { recursive: true });
				fs.writeFileSync(userInfoPlistPath, plist, 'utf8');
			}
			try {
				execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', userAppPath], { stdio: 'ignore' });
			} catch (_error) {
				// Ignore
			}
			if (fs.existsSync(userHelperPath)) {
				userAppHelperBinary = userHelperPath;
			}
		}
	} catch (_error) {
		userAppHelperBinary = null;
	}

	const preferred = ('arm64' === process.arch)
		? [userAppHelperBinary, packagedArm, devArm, packagedX64, devX64, devFallback]
		: [userAppHelperBinary, packagedX64, devX64, packagedArm, devArm, devFallback];
	const candidates = preferred.filter(Boolean);
	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function get_helper_connection_settings() {
	try {
		const settings = db ? db.getSettings() : null;
		return {
			host: (settings && settings.helperHost) ? settings.helperHost : '127.0.0.1',
			port: Number((settings && settings.helperPort) ? settings.helperPort : 50555)
		};
	} catch (_error) {
		return { host: '127.0.0.1', port: 50555 };
	}
}

function isHelperReachable(timeoutMs, host, port) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let finished = false;
		const done = (ok) => {
			if (finished) return;
			finished = true;
			try { socket.destroy(); } catch (_e) { }
			resolve(!!ok);
		};
		try {
			socket.setTimeout(Number(timeoutMs || 250));
			socket.once('connect', () => done(true));
			socket.once('timeout', () => done(false));
			socket.once('error', () => done(false));
			socket.connect(Number(port || 50555), host || '127.0.0.1');
		} catch (_error) {
			done(false);
		}
	});
}

async function waitForHelperReachable(maxWaitMs, host, port) {
	const deadline = Date.now() + Number(maxWaitMs || 2000);
	while (Date.now() < deadline) {
		// eslint-disable-next-line no-await-in-loop
		const ok = await isHelperReachable(250, host, port);
		if (ok) return true;
		// eslint-disable-next-line no-await-in-loop
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	return false;
}

async function ensureHelperRunning() {
	const connection = get_helper_connection_settings();
	if (await isHelperReachable(120, connection.host, connection.port)) {
		return true;
	}
	const helperBinary = findHelperBinaryPath();
	if (!helperBinary) {
		return false;
	}
	try {
		try {
			fs.chmodSync(helperBinary, 0o755);
		} catch (_chmodError) {
			// Ignore
		}
		const child = spawn(helperBinary, [], {
			detached: true,
			stdio: 'ignore'
		});
		child.unref();
		return true;
	} catch (_error) {
		return false;
	}
}

async function restartHelper() {
	await new Promise((resolve) => {
		execFile('/usr/bin/pkill', ['-f', 'SnipsHelper'], () => resolve(true));
	});
	await new Promise((resolve) => setTimeout(resolve, 250));
	const started = await ensureHelperRunning();
	if (!started) {
		return { started: false, reachable: false };
	}
	const connection = get_helper_connection_settings();
	const reachable = await waitForHelperReachable(2200, connection.host, connection.port);
	return { started: true, reachable };
}

async function syncHelperConfigWithRetry() {
	try {
		await syncHelperConfig();
		return;
	} catch (_firstError) {
		await ensureHelperRunning();
		await new Promise((resolve) => setTimeout(resolve, 700));
		try {
			await syncHelperConfig();
			return;
		} catch (_secondError) {
			helperStatus.running = false;
			refreshTray();
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('helper:status', helperStatus);
			}
		}
	}
}

function installLaunchAgentIfPossible() {
	const helperBinary = findHelperBinaryPath();
	if (!helperBinary) {
		return;
	}
	const launchAgentsDir = path.join(app.getPath('home'), 'Library', 'LaunchAgents');
	if (!fs.existsSync(launchAgentsDir)) {
		fs.mkdirSync(launchAgentsDir, { recursive: true });
	}
	const plistPath = path.join(launchAgentsDir, 'com.snips.helper.plist');
	const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>Label</key>\n\t<string>com.snips.helper</string>\n\t<key>ProgramArguments</key>\n\t<array>\n\t\t<string>${helperBinary}</string>\n\t</array>\n\t<key>RunAtLoad</key>\n\t<true/>\n\t<key>KeepAlive</key>\n\t<true/>\n</dict>\n</plist>\n`;
	fs.writeFileSync(plistPath, plist, 'utf8');
}

app.whenReady().then(async () => {
	const dataDir = path.join(app.getPath('userData'), 'data');
	db = new SnipsDb(dataDir);
	helperBridge = new HelperBridge({
		onEvent: (event) => {
			if ('expansion_event' === event.type) {
				db.recordEvent(event.payload);
				mainWindow.webContents.send('stats:updated');
			}
			if ('status' === event.type) {
				helperStatus = { ...helperStatus, ...event.payload, running: true };
				refreshTray();
				mainWindow.webContents.send('helper:status', helperStatus);
			}
			if ('fill_request' === event.type) {
				if (!fillWindow || fillWindow.isDestroyed()) {
					createFillWindow();
				}
				fillWindow.center();
				fillWindow.show();
				fillWindow.focus();
				fillWindow.webContents.send('fill:init', event.payload);
			}
		}
	});
	helperBridge.startEventServer();
	createMainWindow();
	createPaletteWindow();
	createFillWindow();
	setupTray();
	registerGlobalHotkey();
	installLaunchAgentIfPossible();
	await ensureHelperRunning();

	await syncHelperConfigWithRetry();
});

app.on('will-quit', () => {
	globalShortcut.unregisterAll();
});

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

ipcMain.handle('settings:get', () => db.getSettings());
ipcMain.handle('settings:save', async (_event, settings) => {
	const saved = db.saveSettings(settings);
	registerGlobalHotkey();
	await syncHelperConfigWithRetry();
	refreshTray();
	return saved;
});

ipcMain.handle('import:csv', async (_event, payload) => {
	try {
		const groupName = (payload && payload.groupName ? String(payload.groupName) : '').trim() || 'Imported';
		const csvText = payload && payload.csvText ? String(payload.csvText) : '';
		if (!csvText.trim()) {
			return { ok: false, message: 'CSV file was empty.' };
		}

		function parseCsv(text) {
			const out = [];
			let row = [];
			let field = '';
			let inQuotes = false;
			let i = 0;
			if (0 === text.indexOf('\uFEFF')) text = text.slice(1);
			for (; i < text.length; i++) {
				const ch = text[i];
				if (inQuotes) {
					if ('"' === ch) {
						if ('"' === text[i + 1]) {
							field += '"';
							i++;
						} else {
							inQuotes = false;
						}
					} else {
						field += ch;
					}
					continue;
				}
				if ('"' === ch) {
					inQuotes = true;
					continue;
				}
				if (',' === ch) {
					row.push(field);
					field = '';
					continue;
				}
				if ('\n' === ch) {
					row.push(field);
					field = '';
					if (row.some((v) => String(v || '').trim())) out.push(row);
					row = [];
					continue;
				}
				if ('\r' === ch) {
					if ('\n' === text[i + 1]) i++;
					row.push(field);
					field = '';
					if (row.some((v) => String(v || '').trim())) out.push(row);
					row = [];
					continue;
				}
				field += ch;
			}
			row.push(field);
			if (row.some((v) => String(v || '').trim())) out.push(row);
			return out;
		}

		function decodeEntities(input) {
			return String(input || '')
				.replace(/&nbsp;/g, ' ')
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'");
		}

		function htmlToText(html) {
			let s = String(html || '');
			s = s.replace(/<br\s*\/?>/gi, '\n');
			s = s.replace(/<\/(p|div|li)>/gi, '\n');
			s = s.replace(/<[^>]+>/g, '');
			s = decodeEntities(s);
			s = s.replace(/\r\n/g, '\n');
			s = s.replace(/\n{3,}/g, '\n\n');
			return s.trim();
		}

		function convertTextExpanderTokens(text) {
			let s = String(text || '');
			s = s.replace(/%\|/g, '[[cursor]]');
			s = s.replace(/%filltext:name=([^:%]+)(?::[^%]*)?%/g, (_m, label) => {
				const safe = String(label || '').trim();
				return safe ? `[[fill:${safe}|]]` : '[[fill:Value|]]';
			});
			return s;
		}

		let rows = parseCsv(csvText);
		if (!rows.length) {
			return { ok: false, message: 'No rows found in CSV.' };
		}
		const first = rows[0].map((v) => String(v || '').trim().toLowerCase());
		if (first[0] === 'abbreviation' && (first[1] === 'snippet' || first[1] === 'content')) {
			rows = rows.slice(1);
		}

		let group = db.getGroupByName(groupName);
		if (!group) {
			group = db.saveGroup({ name: groupName });
		}

		let created = 0;
		let updated = 0;
		let skipped = 0;
		for (const row of rows) {
			const abbr = (row[0] ? String(row[0]) : '').trim();
			const raw = row[1] ? String(row[1]) : '';
			const label = row[2] ? String(row[2]).trim() : '';
			if (!abbr || !raw) {
				skipped++;
				continue;
			}
			let content = htmlToText(raw);
			content = convertTextExpanderTokens(content);
			const name = label || abbr;
			const existing = db.getSnippetByAbbreviation(abbr);
			const saved = db.saveSnippet({
				id: existing ? existing.id : null,
				groupId: group.id,
				name,
				abbreviation: abbr,
				content,
				enabled: true,
				favorite: false,
				notes: ''
			});
			if (existing) updated++;
			else if (saved) created++;
		}

		await syncHelperConfigWithRetry();
		return { ok: true, groupId: group.id, groupName: group.name, created, updated, skipped };
	} catch (error) {
		return { ok: false, message: error && error.message ? error.message : 'Import failed.' };
	}
});

ipcMain.handle('stats:get', (_event, range) => db.getStats(range));
ipcMain.handle('palette:open', () => {
	showPalette();
	return { ok: true };
});
ipcMain.handle('palette:insert', async (_event, snippetId) => {
	return helperBridge.insertById(snippetId).catch(() => ({ ok: false, message: 'Helper unavailable' }));
});
ipcMain.handle('helper:status', () => helperStatus);
ipcMain.handle('helper:restart', async () => {
	const helperBinary = findHelperBinaryPath();
	if (!helperBinary) {
		return { ok: false, started: false, reachable: false, helperBinary: null, message: 'Helper binary not found. Rebuild helper and repackage the app.', status: helperStatus };
	}
	const result = await restartHelper();
	await syncHelperConfigWithRetry();
	if (!result.started) {
		return { ok: false, started: false, reachable: false, helperBinary, message: 'Helper failed to start (spawn failed or blocked by macOS).', status: helperStatus };
	}
	if (!result.reachable) {
		return { ok: false, started: true, reachable: false, helperBinary, message: 'Helper launched but did not become reachable. It may be crashing on startup.', status: helperStatus };
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
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('helper:status', helperStatus);
		}
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
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('helper:status', helperStatus);
		}
		return response;
	} catch (_error) {
		return { ok: false, message: 'Helper unavailable' };
	}
});

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
	helperBridge.sendCommand({
		type: 'fill_response',
		payload: {
			requestId,
			values,
			cancelled
		}
	}).catch(() => {});
});
