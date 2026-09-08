// Isolated Electron integration test: real renderer/preload, in-memory IPC fixtures.
// No helper, personal database, or clipboard access.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(process.env.SNIPS_TEST_ROOT || path.join(__dirname, '../../..'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'snips-ui-test-'));
app.setPath('userData', profile);
const snippets = [
	{
		id: 'one',
		name: 'First snippet',
		abbreviation: ';one',
		groupId: 'default',
		content: 'Hello 👋',
		enabled: true,
		tags: []
	},
	{
		id: 'two',
		name: 'Second snippet',
		abbreviation: ';two',
		groupId: 'work',
		content: 'World',
		enabled: true,
		tags: []
	}
];
const groups = [
	{ id: 'default', name: 'General' },
	{ id: 'work', name: 'Work' }
];
for (const [channel, handler] of Object.entries({
	'groups:list': () => groups,
	'snippets:list': (_e, args) => snippets.filter((s) => !args.groupId || s.groupId === args.groupId),
	'snippets:counts': () => ({
		total: snippets.length,
		byGroup: Object.fromEntries(groups.map((g) => [g.id, snippets.filter((s) => s.groupId === g.id).length]))
	}),
	'snippets:get': async (_e, id) => {
		// Force older requests to finish last to exercise selection races.
		if (id === 'one') await new Promise((resolve) => setTimeout(resolve, 40));
		return snippets.find((s) => s.id === id);
	},
	'snippets:save': (_e, value) => {
		const index = snippets.findIndex((s) => s.id === value.id);
		snippets[index] = value;
		return value;
	},
	'settings:get': () => ({}),
	'stats:get': () => ({ summary: {}, perSnippet: [] }),
	'helper:status': () => ({
		running: true,
		accessibilityEnabled: true,
		listenEventAccess: true,
		eventTapActive: true
	})
}))
	ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
	const win = new BrowserWindow({
		width: 1180,
		height: 800,
		show: false,
		titleBarStyle: 'hiddenInset',
		webPreferences: {
			preload: path.join(root, 'app/src/main/preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	const run = (fn) => win.webContents.executeJavaScript(`(${fn.toString()})()`);
	const ready = () =>
		run(async () => {
			for (let i = 0; i < 100; i++) {
				if (document.getElementById('nameInput').value === 'First snippet') return;
				await new Promise((r) => setTimeout(r, 20));
			}
			throw new Error('Renderer did not load');
		});
	try {
		await win.loadFile(path.join(root, 'app/src/renderer/index.html'));
		await ready();
		// Reproduce the actual save-handler bug, then verify a second save doesn't undo the move.
		const saved = await run(async () => {
			const select = document.getElementById('groupSelect');
			select.value = 'work';
			await document.getElementById('saveSnippetBtn').onclick();
			const first = select.value;
			await document.getElementById('saveSnippetBtn').onclick();
			return { first, second: select.value, persisted: (await window.snipsApi.getSnippet('one')).groupId };
		});
		assert.deepEqual(saved, { first: 'work', second: 'work', persisted: 'work' });
		const more = await run(async () => {
			const { renderGroups, selectSnippet, snippetFormToPayload } = await import('./render.js');
			const { state } = await import('./state.js');
			await selectSnippet('two');
			await selectSnippet('one');
			const roundTrip = document.getElementById('groupSelect').value;
			document.getElementById('groupSelect').value = 'default';
			renderGroups();
			const unsaved = snippetFormToPayload().groupId;
			state.groups = state.groups.filter((g) => g.id !== 'work');
			document.getElementById('groupSelect').value = 'work';
			renderGroups();
			const removed = snippetFormToPayload().groupId;
			const slow = selectSnippet('one');
			const latest = selectSnippet('two');
			await Promise.all([slow, latest]);
			return { roundTrip, unsaved, removed, latest: document.getElementById('nameInput').value };
		});
		assert.deepEqual(more, { roundTrip: 'work', unsaved: 'default', removed: 'default', latest: 'Second snippet' });
		for (const width of [1180, 900, 1500]) {
			win.setContentSize(width, 800);
			await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => { if (innerWidth === ${width}) resolve(); else if (++attempts > 100) reject(new Error('Resize timeout')); else setTimeout(check, 20); }; check();
   })`);
			const layout = await run(async () => {
				const toggle = document.getElementById('sidebarToggle');
				const editor = document.querySelector('.editor-wrap');
				const shell = document.querySelector('.app-shell');
				const measure = () => ({
					editor: editor.getBoundingClientRect().width,
					main: document.querySelector('.main-column').getBoundingClientRect().width
				});
				const expanded = measure();
				toggle.click();
				await new Promise((r) => requestAnimationFrame(r));
				const collapsed = measure();
				const result = {
					expanded,
					collapsed,
					hidden: document.getElementById('sidebar').hidden,
					aria: toggle.getAttribute('aria-expanded'),
					reachable:
						document.elementFromPoint(toggle.getBoundingClientRect().x + 10, 15)?.closest('button')?.id ===
						'sidebarToggle',
					fits: shell.scrollWidth <= innerWidth,
					editorFits: editor.scrollWidth <= editor.clientWidth
				};
				toggle.click();
				return result;
			});
			assert.equal(layout.hidden, true);
			assert.equal(layout.aria, 'false');
			assert.equal(layout.reachable, true);
			assert.equal(layout.fits, true);
			assert.equal(layout.editorFits, true);
			assert.ok(layout.collapsed.main >= layout.expanded.main + 259);
			assert.ok(layout.collapsed.editor > layout.expanded.editor);
			console.log(`PASS sidebar layout ${width}px: ${JSON.stringify(layout)}`);
		}
		await run(() => document.getElementById('sidebarToggle').click());
		await win.loadFile(path.join(root, 'app/src/renderer/index.html'));
		await ready();
		assert.equal(await run(() => document.getElementById('sidebar').hidden), true);
		if (process.env.SNIPS_SCREENSHOT_DIR) {
			fs.mkdirSync(process.env.SNIPS_SCREENSHOT_DIR, { recursive: true });
			fs.writeFileSync(
				path.join(process.env.SNIPS_SCREENSHOT_DIR, 'collapsed.png'),
				(await win.webContents.capturePage()).toPNG()
			);
			await run(() => document.getElementById('sidebarToggle').click());
			fs.writeFileSync(
				path.join(process.env.SNIPS_SCREENSHOT_DIR, 'expanded.png'),
				(await win.webContents.capturePage()).toPNG()
			);
		}
		console.log(
			'PASS group move/repeated save/reselection/unsaved group/deleted group/latest selection/sidebar persistence'
		);
		win.destroy();
		fs.rmSync(profile, { recursive: true, force: true });
		app.exit(0);
	} catch (error) {
		console.error(error);
		win.destroy();
		fs.rmSync(profile, { recursive: true, force: true });
		app.exit(1);
	}
});
