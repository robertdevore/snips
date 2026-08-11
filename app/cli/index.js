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

function hasFlag(name) {
	return args.includes('--' + name) || args.includes('-' + name[0]);
}

function getFlagValue(name) {
	const longIdx = args.indexOf('--' + name);
	if (longIdx >= 0 && longIdx + 1 < args.length && !args[longIdx + 1].startsWith('-')) {
		return args[longIdx + 1];
	}
	const shortIdx = args.indexOf('-' + name[0]);
	if (shortIdx >= 0 && shortIdx + 1 < args.length && !args[shortIdx + 1].startsWith('-')) {
		return args[shortIdx + 1];
	}
	return null;
}

// Parse positional args (non-flag, non-flag-value args)
function positionalArgs() {
	const pos = [];
	let i = 0;
	while (i < args.length) {
		const a = args[i];
		if (!a.startsWith('-')) {
			pos.push(a);
			i++;
			continue;
		}
		// Check if this flag takes a value
		const flagName = a.replace(/^--?/, '');
		const valueFlags = ['name', 'abbr', 'content', 'group', 'tags', 'out', 'in', 'format', 'strata-url'];
		if (valueFlags.indexOf(flagName) >= 0 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
			i += 2; // skip flag and its value
		} else {
			i += 1; // skip boolean flag
		}
	}
	return pos;
}

const pos = positionalArgs();
const isJson = hasFlag('json');
const isDryRun = hasFlag('dry-run');
const isConfirm = hasFlag('confirm');
const command = pos[0];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function output(data) {
	if (isJson) {
		process.stdout.write(JSON.stringify(data, null, 2) + '\n');
	} else if (typeof data === 'string') {
		console.log(data);
	} else {
		console.log(JSON.stringify(data, null, 2));
	}
}

function cliError(code, message, exitCode) {
	exitCode = exitCode || 1;
	if (isJson) {
		process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
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

function loadValidate() {
	return require('../src/main/validation').validateSnippet;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
	console.log(
		[
			`Snips CLI v${APP_VERSION} — snippet manager`,
			'',
			'Usage: snips <command> [options]',
			'',
			'Commands:',
			'  list                  List all snippets',
			'  search <query>        Search snippets by name, abbreviation, or content',
			'  get <id>              Get full snippet details',
			'  create                Create a new snippet',
			'  update <id>           Update an existing snippet',
			'  export                Export all snippets to JSON',
			'  import                Import snippets from JSON file',
			'  health                Show database and app status',
			'  show                  Show current configuration',
			'  doctor                Validate configuration and report issues',
			'  strata                Exchange snippets with the Strata local API',
			'',
			'Create options:',
			'  --name "Title"        Snippet name (required)',
			'  --abbr ";addr"        Abbreviation (required for enabled snippets)',
			'  --content "text"      Snippet content (required)',
			'  --group "Support"     Group name or ID (default: default)',
			'  --tags "email,refund" Comma-separated tags',
			'  --dry-run             Validate without saving',
			'',
			'Update options:',
			'  --name "New Title"    New snippet name',
			'  --abbr ";new"         New abbreviation',
			'  --content "new text"  New snippet content',
			'  --confirm             Required to apply changes',
			'  --dry-run             Preview changes without saving',
			'',
			'Export options:',
			'  --out ./export.json   Output file path (default: stdout)',
			'',
			'Import options:',
			'  --in ./import.json    Input file path (required)',
			'  --confirm             Required to apply import',
			'  --dry-run             Preview what would be imported',
			'',
			'Global options:',
			'  --json                Machine-readable JSON output',
			'  --help                Show this help',
			'',
			'Exit codes: 0 = success, 1 = error, 2 = usage error'
		].join('\n')
	);
}

async function strataRequest(pathname, options) {
	const base = (getFlagValue('strata-url') || process.env.STRATA_URL || 'http://127.0.0.1:3939').replace(/\/$/, '');
	const headers = { Accept: 'application/json', ...((options && options.headers) || {}) };
	if (process.env.STRATA_API_TOKEN) headers['X-Strata-Token'] = process.env.STRATA_API_TOKEN;
	const response = await globalThis.fetch(base + pathname, {
		...options,
		headers,
		signal: globalThis.AbortSignal.timeout(5000)
	});
	const text = await response.text();
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
			if (isDryRun) return output({ ok: true, dryRun: true, snippet });
			if (!isConfirm) cliError('CONFIRM_REQUIRED', 'Import requires --confirm. Use --dry-run to preview.', 2);
			const db = loadDb();
			try {
				if (db.getSnippetByAbbreviation(snippet.abbreviation)) {
					cliError('ABBREVIATION_EXISTS', `Abbreviation ${snippet.abbreviation} already exists.`, 1);
				}
				const saved = db.saveSnippet(snippet);
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
		const snippets = db.listSnippets();
		if (isJson) {
			output({ count: snippets.length, snippets: snippets });
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
		const snippets = db.listSnippets({ query: query });
		if (isJson) {
			output({ query: query, count: snippets.length, snippets: snippets });
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
			output(s);
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

function cmdCreate() {
	const name = getFlagValue('name');
	const abbr = getFlagValue('abbr');
	const content = getFlagValue('content');
	const groupFlag = getFlagValue('group');
	const tagsFlag = getFlagValue('tags');

	if (!name && !abbr && !content) {
		cliError('MISSING_ARGS', 'At least --name, --abbr, and --content are required. Use --help for usage.', 2);
	}

	// Parse tags
	const tags = tagsFlag
		? tagsFlag
				.split(',')
				.map(function (t) {
					return t.trim();
				})
				.filter(Boolean)
		: [];

	const snippet = {
		name: name || '',
		abbreviation: abbr || '',
		content: content || '',
		groupId: groupFlag || 'default',
		tags: tags,
		enabled: true
	};

	const validate = loadValidate();
	const result = validate(snippet);
	if (!result.valid) {
		if (isJson) {
			output({ ok: false, errors: result.errors });
		} else {
			result.errors.forEach(function (e) {
				console.error('  [' + e.field + '] ' + e.message);
			});
			console.error('Validation failed. Use --dry-run to preview without saving.');
		}
		process.exit(1);
	}

	if (isDryRun) {
		output({ ok: true, dryRun: true, snippet: snippet });
		return;
	}

	const db = loadDb();
	try {
		const saved = db.saveSnippet(snippet);
		output(isJson ? { ok: true, snippet: saved } : 'Created snippet "' + saved.name + '" [' + saved.id + ']');
	} finally {
		db.db.close();
	}
}

// ---------------------------------------------------------------------------
// Command: update
// ---------------------------------------------------------------------------

function cmdUpdate() {
	const id = pos[1];
	if (!id) cliError('MISSING_ID', 'Snippet ID required. Usage: snips update <id> [options]', 2);

	const db = loadDb();
	try {
		const existing = db.getSnippet(id);
		if (!existing) cliError('NOT_FOUND', 'Snippet not found: ' + id, 1);

		const name = getFlagValue('name');
		const abbr = getFlagValue('abbr');
		const content = getFlagValue('content');

		if (!name && !abbr && !content) {
			cliError('MISSING_ARGS', 'At least one of --name, --abbr, or --content is required.', 2);
		}

		const updated = {
			id: id,
			name: name || existing.name,
			abbreviation: abbr || existing.abbreviation,
			content: content || existing.content,
			groupId: existing.groupId,
			tags: existing.tags || [],
			enabled: existing.enabled,
			favorite: existing.favorite,
			triggerMode: existing.triggerMode,
			caseMode: existing.caseMode,
			notes: existing.notes
		};

		if (isDryRun) {
			output({
				ok: true,
				dryRun: true,
				before: { name: existing.name, abbreviation: existing.abbreviation, content: existing.content },
				after: { name: updated.name, abbreviation: updated.abbreviation, content: updated.content }
			});
			return;
		}

		if (!isConfirm) {
			cliError('CONFIRM_REQUIRED', 'Update requires --confirm. Use --dry-run to preview changes first.', 2);
		}

		const validate = loadValidate();
		const result = validate(updated);
		if (!result.valid) {
			if (isJson) {
				output({ ok: false, errors: result.errors });
			} else {
				result.errors.forEach(function (e) {
					console.error('  [' + e.field + '] ' + e.message);
				});
			}
			process.exit(1);
		}

		const saved = db.saveSnippet(updated);
		output(isJson ? { ok: true, snippet: saved } : 'Updated snippet "' + saved.name + '" [' + saved.id + ']');
	} finally {
		db.db.close();
	}
}

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

		const json = JSON.stringify(data, null, 2);
		if (outPath) {
			const resolvedOut = path.resolve(outPath);
			const tempOut = resolvedOut + '.tmp-' + process.pid;
			fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
			try {
				fs.writeFileSync(tempOut, json, { encoding: 'utf8', mode: 0o600 });
				fs.renameSync(tempOut, resolvedOut);
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
		data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
	} catch (e) {
		cliError('PARSE_ERROR', 'Could not parse JSON: ' + e.message, 1);
	}

	if (!data || 1 !== data.version || !Array.isArray(data.snippets) || !Array.isArray(data.groups)) {
		cliError('UNSUPPORTED_BACKUP', 'Expected a Snips version 1 backup with groups and snippets arrays.', 1);
	}
	const snippets = data.snippets;
	const groups = data.groups;

	if (isDryRun) {
		output({
			ok: true,
			dryRun: true,
			wouldImport: {
				groups: groups.length,
				snippets: snippets.length,
				preview: snippets.slice(0, 5).map(function (s) {
					return { name: s.name, abbreviation: s.abbreviation, id: s.id };
				})
			}
		});
		return;
	}

	if (!isConfirm) {
		cliError(
			'CONFIRM_REQUIRED',
			'Import requires --confirm. This will import ' +
				snippets.length +
				' snippets. Use --dry-run to preview first.',
			2
		);
	}

	const db = loadDb();
	const validate = loadValidate();
	try {
		let imported = 0;
		let skipped = 0;
		const errors = [];

		// Import groups first
		for (var gi = 0; gi < groups.length; gi++) {
			var g = groups[gi];
			try {
				db.saveGroup(g);
			} catch (e) {
				errors.push({ type: 'group', id: g.id, name: g.name, error: e.message });
			}
		}

		// Import snippets
		for (var si = 0; si < snippets.length; si++) {
			var snippet = snippets[si];
			var validation = validate(snippet);
			if (!validation.valid) {
				skipped++;
				errors.push({ type: 'snippet', name: snippet.name, errors: validation.errors });
				continue;
			}
			try {
				db.saveSnippet(snippet);
				imported++;
			} catch (e) {
				skipped++;
				errors.push({ type: 'snippet', name: snippet.name, error: e.message });
			}
		}

		var result = {
			ok: true,
			imported: imported,
			skipped: skipped
		};
		if (errors.length) result.errors = errors;

		if (isJson) {
			output(result);
		} else {
			console.log('Imported ' + imported + ' snippets' + (skipped > 0 ? ', skipped ' + skipped : '') + '.');
			if (errors.length) {
				console.error('Errors:');
				errors.forEach(function (e) {
					console.error(
						'  ' + e.type + ': ' + (e.name || e.id || '') + ' — ' + (e.error || JSON.stringify(e.errors))
					);
				});
			}
		}
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
		case 'list':
			return cmdList();
		case 'search':
			return cmdSearch();
		case 'get':
			return cmdGet();
		case 'create':
			return cmdCreate();
		case 'update':
			return cmdUpdate();
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

Promise.resolve(main()).catch((error) => cliError('UNEXPECTED_ERROR', error.message || String(error), 1));
