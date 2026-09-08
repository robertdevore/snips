#!/usr/bin/env node
/**
 * Snips CLI — command-line interface for managing snippets.
 *
 * Usage:
 *   snips list [--json]
 *   snips search <query> [--json]
 *   snips get <id> [--json]
 *   snips create --name "..." --abbr "..." --content "..." [--group "..."] [--tags "..."] [--dry-run] [--json]
 *   snips update <id> [--name "..."] [--abbr "..."] [--content "..."] [--confirm] [--dry-run] [--json]
 *   snips export [--out <path>] [--json]
 *   snips import --in <path> [--confirm] [--dry-run] [--json]
 *   snips health [--json]
 *   snips show [--json]
 *   snips doctor [--json]
 *   snips strata save-snippet <id> [--strata-url <url>]
 *   snips strata import-note <note-id> [--dry-run|--confirm]
 *   snips strata search-candidates <query>
 *
 * All commands support --json for machine-readable output.
 * Exit codes: 0 = success, 1 = error, 2 = usage error.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const APP_VERSION = require('../package.json').version;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function getDataDir() {
	// Prefer SNIPS_DATA_DIR env var for testing
	if (process.env.SNIPS_DATA_DIR) {
		return process.env.SNIPS_DATA_DIR;
	}
	const appSupport =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	return path.join(appSupport, 'Snips', 'data');
}

const dataDir = getDataDir();
const dbPath = path.join(dataDir, 'snips.db');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let parsed;
try {
	parsed = require('./parser').parse(args);
} catch (e) {
	console.error(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }));
	process.exit(2);
}
const { flags, pos, command } = parsed;
const hasFlag = (name) => flags[name] === true;
const getFlagValue = (name) => flags[name] ?? null;
const isJson = hasFlag('json');
const isDryRun = hasFlag('dry-run');
const isConfirm = hasFlag('confirm');
const { execute } = require('../src/main/operations');
const { LIMITS } = require('../src/main/validation');
function readBounded(file = 0) {
	const fd = typeof file === 'number' ? file : fs.openSync(file, 'r');
	const chunks = [];
	let size = 0;
	const buffer = Buffer.alloc(65536);
	try {
		for (;;) {
			const n = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (!n) break;
			size += n;
			if (size > LIMITS.input) throw Object.assign(new Error('Input exceeds 8 MiB'), { code: 'INPUT_TOO_LARGE' });
			chunks.push(Buffer.from(buffer.subarray(0, n)));
		}
	} finally {
		if (typeof file !== 'number') fs.closeSync(fd);
	}
	return Buffer.concat(chunks).toString('utf8');
}
function inputSnippet() {
	let s = hasFlag('stdin-json') ? JSON.parse(readBounded()) : {};
	if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Expected snippet JSON object');
	for (const [flag, field] of Object.entries({
		name: 'name',
		abbr: 'abbreviation',
		content: 'content',
		group: 'groupId'
	}))
		if (flags[flag] !== undefined) s[field] = flags[flag];
	if (flags.tags !== undefined)
		s.tags = flags.tags
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
	if (hasFlag('content-stdin')) s.content = readBounded();
	if (flags['content-file']) s.content = readBounded(flags['content-file']);
	return s;
}
function readOptions() {
	const limit = Number(flags.limit ?? 50),
		offset = Number(flags.offset ?? 0);
	if (limit < 1 || limit > 500)
		throw Object.assign(new Error('--limit must be 1–500'), { code: 'INVALID_PAGINATION' });
	return {
		limit,
		offset,
		groupId: flags.group,
		tag: flags.tag,
		favorite: hasFlag('favorite'),
		metadata: !hasFlag('include-content') && !flags.fields?.split(',').includes('content'),
		trash: hasFlag('trash')
	};
}
function project(rows) {
	if (hasFlag('ids-only')) return rows.map((s) => s.id);
	const allowed = [
		'id',
		'name',
		'abbreviation',
		'groupId',
		'tags',
		'enabled',
		'favorite',
		'updatedAt',
		'revision',
		'preview',
		'content',
		'notes',
		'triggerMode',
		'caseMode',
		'createdAt'
	];
	const fields = flags.fields?.split(',');
	if (fields?.some((f) => !allowed.includes(f)))
		throw Object.assign(new Error('Unknown output field'), { code: 'INVALID_FIELDS' });
	return rows.map((s) => (fields ? Object.fromEntries(fields.map((f) => [f, s[f]])) : s));
}
function cmdMutate(type) {
	if (!isDryRun && !isConfirm && type !== 'create') cliError('CONFIRM_REQUIRED', 'Use --dry-run or --confirm.', 2);
	const db = loadDb();
	try {
		let operations;
		if (type === 'batch') {
			if (!hasFlag('stdin-json') && !hasFlag('stdin-jsonl'))
				cliError('INPUT_REQUIRED', 'Use --stdin-json or --stdin-jsonl.', 2);
			const text = readBounded();
			operations = hasFlag('stdin-jsonl')
				? text
						.split(/\r?\n/)
						.filter((l) => l.trim())
						.map((l) => JSON.parse(l))
				: JSON.parse(text);
		} else {
			const op = {
				type,
				id: pos[1],
				ifRevision: flags['if-revision'] === undefined ? undefined : Number(flags['if-revision'])
			};
			if (type === 'create') op.snippet = { groupId: 'default', ...inputSnippet() };
			if (type === 'update') op.patch = inputSnippet();
			if (type === 'revert') op.historyId = Number(flags['history-id']);
			operations = [op];
		}
		output(execute(db, operations, { dryRun: isDryRun, idempotencyKey: flags['idempotency-key'] }));
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function output(data) {
	if (hasFlag('quiet')) return;
	if (isJson) {
		process.stdout.write(JSON.stringify(data, null, hasFlag('pretty') ? 2 : undefined) + '\n');
	} else if (typeof data === 'string') {
		console.log(data);
	} else {
		console.log(JSON.stringify(data, null, hasFlag('pretty') ? 2 : undefined));
	}
}

function cliError(code, message, exitCode) {
	exitCode = exitCode || 1;
	if (isJson) {
		process.stderr.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
	} else {
		process.stderr.write('Error: ' + message + '\n');
	}
	process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Database loader
// ---------------------------------------------------------------------------

function loadDb() {
	if (!fs.existsSync(dbPath)) {
		cliError('DB_NOT_FOUND', 'Database not found at ' + dbPath + '. Is Snips installed?', 1);
	}
	try {
		const { SnipsDb } = require('../src/main/db');
		return new SnipsDb(dataDir);
	} catch (e) {
		cliError('DB_LOAD_ERROR', 'Could not load database: ' + e.message, 1);
	}
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
	console.log(`Snips ${APP_VERSION}
Usage: snips <command> [options]
Commands: ${Object.keys(require('./parser').schema).join(', ')}
Use snips capabilities --json for flags, limits and mutation schemas.
Search/list default to 50 metadata records. Use get <id> for content.
Writes: --dry-run previews; --confirm commits (create needs no confirmation).
Content: --content-stdin, --content-file <path>, or --stdin-json.
Concurrency: --if-revision <n>. Retries: --idempotency-key <key>.
Only -h (--help) and -j (--json) have short aliases.`);
}

async function strataRequest(pathname, options) {
	const base = (getFlagValue('strata-url') || process.env.STRATA_URL || 'http://127.0.0.1:3939').replace(/\/$/, '');
	const endpoint = new URL(base);
	if (
		endpoint.protocol !== 'http:' ||
		!['127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
		endpoint.username ||
		endpoint.password ||
		endpoint.search ||
		endpoint.hash
	)
		throw new Error('Strata requires an explicit loopback HTTP endpoint.');
	const headers = { Accept: 'application/json', ...((options && options.headers) || {}) };
	if (process.env.STRATA_API_TOKEN) headers['X-Strata-Token'] = process.env.STRATA_API_TOKEN;
	const response = await globalThis.fetch(base + pathname, {
		...options,
		redirect: 'error',
		headers,
		signal: globalThis.AbortSignal.timeout(5000)
	});
	let total = 0;
	const chunks = [];
	for await (const chunk of response.body) {
		total += chunk.length;
		if (total > LIMITS.input) throw new Error('Strata response too large');
		chunks.push(Buffer.from(chunk));
	}
	const text = Buffer.concat(chunks).toString('utf8');
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch (_error) {
		throw new Error(`Strata returned non-JSON (${response.status}).`);
	}
	if (!response.ok) throw new Error(data.error || data.message || `Strata request failed (${response.status}).`);
	return data;
}

function noteToSnippet(note) {
	const content = String(note.content || '').trim();
	const lines = content.split(/\r?\n/);
	const heading = lines[0] && /^#\s+/.test(lines[0]) ? lines.shift().replace(/^#\s+/, '').trim() : 'Imported note';
	const body = lines.join('\n').trim() || content;
	const stem =
		heading
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '')
			.slice(0, 16) || 'note';
	return {
		name: heading,
		abbreviation: `;${stem}`,
		content: body,
		groupId: 'default',
		tags: Array.from(new Set(['strata'].concat(Array.isArray(note.tags) ? note.tags : []))),
		enabled: true,
		notes: `Imported from Strata note ${note.id}`
	};
}

async function cmdStrata() {
	const action = pos[1];
	try {
		if ('save-snippet' === action) {
			if (!isConfirm && !isDryRun)
				cliError('CONFIRM_REQUIRED', 'Strata export requires --confirm or --dry-run.', 2);
			const id = pos[2];
			if (!id) cliError('MISSING_ID', 'Usage: snips strata save-snippet <id>', 2);
			const db = loadDb();
			let snippet;
			try {
				snippet = db.getSnippet(id);
			} finally {
				db.db.close();
			}
			if (!snippet) cliError('NOT_FOUND', 'Snippet not found: ' + id, 1);
			if (isDryRun) return output({ ok: true, dryRun: true, id });
			const data = await strataRequest('/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: `# ${snippet.name}\n\n${snippet.content}`,
					tags: Array.from(new Set(['snips', `abbr:${snippet.abbreviation}`].concat(snippet.tags || [])))
				})
			});
			return output(isJson ? { ok: true, note: data.note } : `Saved snippet to Strata note ${data.note.id}.`);
		}
		if ('import-note' === action) {
			const id = pos[2];
			if (!id) cliError('MISSING_ID', 'Usage: snips strata import-note <note-id> [--dry-run|--confirm]', 2);
			const data = await strataRequest('/notes/' + encodeURIComponent(id));
			const snippet = noteToSnippet(data.note);

			if (!isConfirm && !isDryRun)
				cliError('CONFIRM_REQUIRED', 'Import requires --confirm. Use --dry-run to preview.', 2);
			const db = loadDb();
			try {
				if (db.getSnippetByAbbreviation(snippet.abbreviation)) {
					cliError('ABBREVIATION_EXISTS', `Abbreviation ${snippet.abbreviation} already exists.`, 1);
				}
				const result = execute(db, [{ type: 'create', snippet }], { dryRun: isDryRun, source: 'import' });
				if (isDryRun) return output(result);
				const saved = result.results[0];
				return output(isJson ? { ok: true, snippet: saved } : `Imported Strata note as ${saved.abbreviation}.`);
			} finally {
				db.db.close();
			}
		}
		if ('search-candidates' === action) {
			const query = pos.slice(2).join(' ').trim();
			if (!query) cliError('MISSING_QUERY', 'Usage: snips strata search-candidates <query>', 2);
			const data = await strataRequest('/notes?query=' + encodeURIComponent(query));
			const notes = (data.notes || []).map((note) => ({
				id: note.id,
				preview: String(note.content || '').slice(0, 160),
				tags: note.tags || []
			}));
			return output(
				isJson
					? { ok: true, count: notes.length, notes }
					: notes.map((note) => `${note.id}  ${note.preview.replace(/\s+/g, ' ')}`).join('\n')
			);
		}
		cliError('UNKNOWN_STRATA_COMMAND', 'Use save-snippet, import-note, or search-candidates.', 2);
	} catch (error) {
		cliError('STRATA_ERROR', error && error.message ? error.message : String(error), 1);
	}
}

// ---------------------------------------------------------------------------
// Command: list
// ---------------------------------------------------------------------------

function cmdList() {
	const db = loadDb();
	try {
		if (hasFlag('count')) return output({ count: db.listSnippets({ ...readOptions(), countOnly: true }) });
		const snippets = db.listSnippets(readOptions());
		if (isJson) {
			output({
				count: snippets.length,
				offset: Number(flags.offset ?? 0),
				snippets: hasFlag('count') ? undefined : project(snippets)
			});
		} else if (0 === snippets.length) {
			console.log('No snippets found.');
		} else {
			snippets.forEach(function (s) {
				console.log(s.abbreviation + '  ' + s.name + '  [' + s.id + ']');
			});
		}
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: search
// ---------------------------------------------------------------------------

function cmdSearch() {
	const query = pos[1];
	if (!query) cliError('MISSING_QUERY', 'Search query required. Usage: snips search <query>', 2);
	const db = loadDb();
	try {
		if (hasFlag('count')) return output({ count: db.listSnippets({ query, ...readOptions(), countOnly: true }) });
		const snippets = db.listSnippets({ query, ...readOptions() });
		if (isJson) {
			output({
				query,
				count: snippets.length,
				offset: Number(flags.offset ?? 0),
				snippets: hasFlag('count') ? undefined : project(snippets)
			});
		} else if (0 === snippets.length) {
			console.log('No snippets match "' + query + '".');
		} else {
			snippets.forEach(function (s) {
				console.log(s.abbreviation + '  ' + s.name + '  [' + s.id + ']');
			});
		}
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: get
// ---------------------------------------------------------------------------

function cmdGet() {
	const id = pos[1];
	if (!id) cliError('MISSING_ID', 'Snippet ID required. Usage: snips get <id>', 2);
	const db = loadDb();
	try {
		const s = db.getSnippet(id);
		if (!s) cliError('NOT_FOUND', 'Snippet not found: ' + id, 1);
		if (isJson) {
			output(flags.fields ? project([s])[0] : s);
		} else {
			console.log('Name:         ' + s.name);
			console.log('Abbreviation: ' + s.abbreviation);
			console.log('Group:        ' + (s.groupId || 'default'));
			console.log('Enabled:      ' + (s.enabled ? 'yes' : 'no'));
			console.log('Favorite:     ' + (s.favorite ? 'yes' : 'no'));
			console.log('Tags:         ' + ((s.tags || []).join(', ') || '(none)'));
			console.log('Content:');
			console.log(s.content);
		}
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: create
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Command: export
// ---------------------------------------------------------------------------

function cmdExport() {
	const outPath = getFlagValue('out');
	const db = loadDb();
	try {
		const groups = db.listGroups();
		const snippets = db.listSnippets();
		const data = {
			version: 1,
			exportedAt: Date.now(),
			appVersion: APP_VERSION,
			groups: groups,
			snippets: snippets
		};

		const json = JSON.stringify(data, null, hasFlag('pretty') ? 2 : undefined);
		if (outPath) {
			const resolvedOut = path.resolve(outPath);
			const tempOut = resolvedOut + '.tmp-' + process.pid;
			fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
			try {
				fs.writeFileSync(tempOut, json, { encoding: 'utf8', mode: 0o600 });
				if (!isConfirm) fs.linkSync(tempOut, resolvedOut);
				else fs.renameSync(tempOut, resolvedOut);
			} finally {
				if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
			}
			output(
				isJson
					? { ok: true, path: outPath, count: snippets.length }
					: 'Exported ' + snippets.length + ' snippets to ' + outPath
			);
		} else {
			output(data);
		}
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: import
// ---------------------------------------------------------------------------

function cmdImport() {
	const inPath = getFlagValue('in');
	if (!inPath) cliError('MISSING_INPUT', '--in <path> is required. Usage: snips import --in <file> [--confirm]', 2);
	if (!fs.existsSync(inPath)) cliError('FILE_NOT_FOUND', 'File not found: ' + inPath, 1);

	let data;
	try {
		data = JSON.parse(readBounded(inPath));
	} catch (e) {
		cliError('PARSE_ERROR', 'Could not parse JSON: ' + e.message, 1);
	}

	if (!data || 1 !== data.version || !Array.isArray(data.snippets) || !Array.isArray(data.groups)) {
		cliError('UNSUPPORTED_BACKUP', 'Expected a Snips version 1 backup with groups and snippets arrays.', 1);
	}
	const snippets = data.snippets;
	const groups = data.groups;

	if (!isDryRun && !isConfirm) cliError('CONFIRM_REQUIRED', 'Import requires --confirm or --dry-run.', 2);
	const db = loadDb();
	const rollback = {};
	let result;
	try {
		try {
			db.db
				.transaction(() => {
					for (const g of groups) {
						const prior = db.listGroups().find((x) => x.id === g.id);
						if (!prior) db.saveGroup(g);
						else if (prior.name !== g.name) throw new Error('GROUP_CONFLICT');
					}
					result = execute(
						db,
						snippets.map((snippet) => ({ type: 'create', snippet })),
						{ source: 'import' }
					);
					if (isDryRun) throw rollback;
				})
				.immediate();
		} catch (e) {
			if (e !== rollback) throw e;
		}
		output({ ok: true, dryRun: isDryRun, imported: result.results.length });
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: health
// ---------------------------------------------------------------------------

function cmdHealth() {
	const dbExists = fs.existsSync(dbPath);
	const result = {
		ok: true,
		db: { path: dbPath, exists: dbExists },
		version: APP_VERSION
	};

	if (dbExists) {
		try {
			const db = loadDb();
			const counts = db.getSnippetCounts();
			result.db.snippets = counts.total;
			result.db.groups = db.listGroups().length;
			const stats = db.getStats();
			result.db.events = stats.summary.expansions;
			db.db.close();
		} catch (e) {
			result.db.error = e.message;
		}
	}

	output(result);
}

// ---------------------------------------------------------------------------
// Command: show
// ---------------------------------------------------------------------------

function cmdShow() {
	const db = loadDb();
	try {
		const settings = db.getSettings();
		delete settings.userAvatar;
		output(settings);
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: doctor
// ---------------------------------------------------------------------------

function cmdDoctor() {
	const db = loadDb();
	try {
		const settings = db.getSettings();
		const issues = [];
		const cliPath = path.join(os.homedir(), '.local/bin/snips');
		if (!fs.existsSync(cliPath)) issues.push('CLI launcher missing: choose Install / Repair CLI in Snips');
		if (!(process.env.PATH || '').split(path.delimiter).includes(path.dirname(cliPath)))
			issues.push('~/.local/bin is not on PATH');
		const runtimePath = path.join(path.dirname(dataDir), 'runtime-status.json');
		let runtime = null;
		try {
			runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
		} catch {}
		if (runtime && Date.now() - runtime.timestamp < 10000)
			issues.push(
				...(runtime.hotkeyFailures || []),
				...(runtime.upgradeRequired ? ['Helper upgrade required'] : [])
			);
		else issues.push('Live helper/hotkey status unavailable; start Snips');
		const wpm = Number(settings.wpm || 220);
		if (wpm < 60 || wpm > 500) issues.push('WPM out of range: ' + wpm);
		if (!settings.globalHotkey) issues.push('No palette hotkey configured');
		const counts = db.getSnippetCounts();
		if (0 === counts.total) issues.push('No snippets found — create your first with: snips create');
		output({ ok: 0 === issues.length, issues: issues, snippetCount: counts.total });
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

function main() {
	if (!command || 'help' === command || hasFlag('help')) {
		showHelp();
		process.exit(0);
	}

	switch (command) {
		case 'capabilities':
		case 'schema':
			return output({
				version: APP_VERSION,
				protocolVersion: 1,
				commands: require('./parser').schema,
				limits: LIMITS,
				macros: ['date', 'clipboard', 'fill', 'cursor'],
				caseModes: ['exact'],
				triggerModes: require('../src/main/validation').TRIGGER_MODES,
				operations: require('../src/main/operations').OPERATIONS,
				confirmation: 'Writes except create require --confirm or --dry-run',
				historyRetention: 100
			});
		case 'batch':
		case 'trash':
		case 'restore':
		case 'revert':
			return cmdMutate(command);
		case 'groups':
		case 'history':
		case 'purge': {
			const db = loadDb();
			try {
				if (command === 'groups') return output(db.listGroups());
				if (command === 'history')
					return output(
						flags['history-id'] ? db.historyEntry(pos[1], Number(flags['history-id'])) : db.history(pos[1])
					);
				if (isDryRun) {
					const snippet = db.getSnippet(pos[1], { includeDeleted: true });
					if (!snippet?.deletedAt) cliError('TRASH_REQUIRED', 'Only trashed snippets can be purged.', 1);
					return output({ ok: true, dryRun: true, wouldPurge: snippet.id });
				}
				if (!isConfirm) cliError('CONFIRM_REQUIRED', 'Permanent deletion requires --confirm.', 2);
				return output(
					db.purgeSnippet(
						pos[1],
						flags['if-revision'] === undefined ? undefined : Number(flags['if-revision'])
					)
				);
			} finally {
				db.db.close();
			}
		}
		case 'list':
			return cmdList();
		case 'search':
			return cmdSearch();
		case 'get':
			return cmdGet();
		case 'create':
			return cmdMutate('create');
		case 'update':
			return cmdMutate('update');
		case 'export':
			return cmdExport();
		case 'import':
			return cmdImport();
		case 'health':
			return cmdHealth();
		case 'show':
			return cmdShow();
		case 'doctor':
			return cmdDoctor();
		case 'strata':
			return cmdStrata();
		default:
			cliError('UNKNOWN_COMMAND', 'Unknown command: ' + command + '. Use snips help for usage.', 2);
	}
}

Promise.resolve()
	.then(main)
	.catch((error) => cliError(error.code || 'UNEXPECTED_ERROR', error.message || String(error), 1));
