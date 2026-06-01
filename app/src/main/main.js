const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFile, execFileSync } = require('child_process');
const { app, BrowserWindow, globalShortcut, Menu, Tray, nativeImage } = require('electron');
const { SnipsDb } = require('./db');
const { HelperBridge } = require('./helper-bridge');
const { registerHandlers } = require('./ipc-handlers');

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
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			allowRunningInsecureContent: false
		}
	});
	mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function showMainWindow() {
	if (!mainWindow || mainWindow.isDestroyed()) {
		createMainWindow();
	}
	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}
	if (!mainWindow.isVisible()) {
		mainWindow.show();
	} else {
		mainWindow.focus();
	}
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
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			allowRunningInsecureContent: false
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
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			allowRunningInsecureContent: false
		}
	});
	fillWindow.loadFile(path.join(__dirname, '../renderer/fill.html'));
}

function refreshTray() {
	if (!tray) {
		return;
	}
	const stateLabel = helperStatus.secureInput
		? 'Secure Input active'
		: helperStatus.running
			? 'Running'
			: 'Helper offline';
	tray.setToolTip(`Snips - ${stateLabel}`);
	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Open Snips', click: () => showMainWindow() },
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
	const tinyTemplate =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAHElEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjAIA6RQAAR2j8E4AAAAASUVORK5CYII=';
	const icon = nativeImage.createFromDataURL(tinyTemplate);
	icon.setTemplateImage(true);
	tray = new Tray(icon);
	tray.on('click', () => {
		showMainWindow();
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
		showMainWindow();
	});

	reg(settings.hotkeyNewSnippet, () => {
		showMainWindow();
		mainWindow.webContents.send('nav:show', { view: 'libraryView', action: 'newSnippet' });
	});

	reg(settings.hotkeyOpenSettings, () => {
		showMainWindow();
		mainWindow.webContents.send('nav:show', { view: 'settingsView' });
	});

	reg(settings.hotkeyOpenStats, () => {
		showMainWindow();
		mainWindow.webContents.send('nav:show', { view: 'statsView' });
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
	const packagedArm = path.join(
		process.resourcesPath || '',
		'helper-build',
		'arm64-apple-macosx',
		'release',
		'SnipsHelper'
	);
	const packagedX64 = path.join(
		process.resourcesPath || '',
		'helper-build',
		'x86_64-apple-macosx',
		'release',
		'SnipsHelper'
	);
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
		let modifiedUserHelperApp = false;
		const sourcePreferred =
			'arm64' === process.arch
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
			// Important: if we overwrite the helper binary after the user grants
			// Accessibility/Input Monitoring, macOS can treat it like a new binary and
			// silently drop the grant. Only copy on first install.
			const shouldCopy = !fs.existsSync(userHelperPath);
			if (shouldCopy) {
				fs.copyFileSync(source, userHelperPath);
				try {
					fs.chmodSync(userHelperPath, 0o755);
				} catch (_error) {
					// Ignore
				}
				modifiedUserHelperApp = true;
			}
			if (!fs.existsSync(userInfoPlistPath)) {
				const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>\n\t<key>CFBundleExecutable</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.snips.helper</string>\n\t<key>CFBundleInfoDictionaryVersion</key>\n\t<string>6.0</string>\n\t<key>CFBundleName</key>\n\t<string>SnipsHelper</string>\n\t<key>CFBundlePackageType</key>\n\t<string>APPL</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>0.2.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>0.2.0</string>\n\t<key>LSUIElement</key>\n\t<true/>\n</dict>\n</plist>\n`;
				fs.mkdirSync(path.dirname(userInfoPlistPath), { recursive: true });
				fs.writeFileSync(userInfoPlistPath, plist, 'utf8');
				modifiedUserHelperApp = true;
			}
			if (modifiedUserHelperApp) {
				try {
					execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', userAppPath], {
						stdio: 'ignore'
					});
				} catch (_error) {
					// Ignore
				}
			}
			if (fs.existsSync(userHelperPath)) {
				userAppHelperBinary = userHelperPath;
			}
		}
	} catch (_error) {
		userAppHelperBinary = null;
	}

	const preferred =
		'arm64' === process.arch
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
			host: settings && settings.helperHost ? settings.helperHost : '127.0.0.1',
			port: Number(settings && settings.helperPort ? settings.helperPort : 50555)
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
			try {
				socket.destroy();
			} catch (_e) {}
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
		const ok = await isHelperReachable(250, host, port);
		if (ok) return true;
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

	// Migrate database from legacy dev-mode location (snips-app) to production
	// location (Snips) if the production DB doesn't exist yet.
	const devDataDir = path.join(app.getPath('appData'), 'snips-app', 'data');
	const prodDbPath = path.join(dataDir, 'snips.db');
	const devDbPath = path.join(devDataDir, 'snips.db');
	if (!fs.existsSync(prodDbPath) && fs.existsSync(devDbPath)) {
		fs.mkdirSync(dataDir, { recursive: true });
		fs.copyFileSync(devDbPath, prodDbPath);
	}

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

	registerHandlers({
		db,
		helperBridge,
		helperStatus,
		syncHelperConfig,
		syncHelperConfigWithRetry,
		registerGlobalHotkey,
		refreshTray,
		showPalette,
		showMainWindow,
		findHelperBinaryPath,
		restartHelper,
		mainWindow,
		fillWindow
	});

	setupTray();
	registerGlobalHotkey();
	installLaunchAgentIfPossible();
	await ensureHelperRunning();

	await syncHelperConfigWithRetry();
});

app.on('activate', () => {
	showMainWindow();
});

app.on('will-quit', () => {
	globalShortcut.unregisterAll();
});
