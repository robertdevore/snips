const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
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
	globalShortcut.register(shortcut, () => {
		showPalette();
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
				const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>\n\t<key>CFBundleExecutable</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.snips.helper</string>\n\t<key>CFBundleInfoDictionaryVersion</key>\n\t<string>6.0</string>\n\t<key>CFBundleName</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundlePackageType</key>\n\t<string>APPL</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>0.1.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>0.1.0</string>\n\t<key>LSUIElement</key>\n\t<true/>\n</dict>\n</plist>\n`;
				fs.mkdirSync(path.dirname(userInfoPlistPath), { recursive: true });
				fs.writeFileSync(userInfoPlistPath, plist, 'utf8');
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

function ensureHelperRunning() {
	const helperBinary = findHelperBinaryPath();
	if (!helperBinary) {
		return false;
	}
	try {
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

function restartHelper() {
	return new Promise((resolve) => {
		execFile('/usr/bin/pkill', ['-f', 'SnipsHelper'], () => {
			setTimeout(() => {
				ensureHelperRunning();
				resolve(true);
			}, 250);
		});
	});
}

async function syncHelperConfigWithRetry() {
	try {
		await syncHelperConfig();
		return;
	} catch (_firstError) {
		ensureHelperRunning();
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
	ensureHelperRunning();

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

ipcMain.handle('stats:get', () => db.getStats());
ipcMain.handle('palette:open', () => {
	showPalette();
	return { ok: true };
});
ipcMain.handle('palette:insert', async (_event, snippetId) => {
	return helperBridge.insertById(snippetId).catch(() => ({ ok: false, message: 'Helper unavailable' }));
});
ipcMain.handle('helper:status', () => helperStatus);
ipcMain.handle('helper:restart', async () => {
	await restartHelper();
	await syncHelperConfigWithRetry();
	return { ok: true };
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
