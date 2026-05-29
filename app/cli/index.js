#!/usr/bin/env node
/**
 * Snips CLI — command-line interface for managing snippets.
 *
 * Usage:
 *   snips health [--json]
 *   snips snippets list [--json]
 *   snips snippets search <query> [--json]
 *   snips snippets get <id> [--json]
 *   snips config show [--json]
 *   snips config doctor [--json]
 *
 * All commands support --json for machine-readable output.
 * Exit codes: 0 = success, 1 = error, 2 = usage error.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine data directory
function getDataDir() {
	const appSupport = process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	return path.join(appSupport, 'Snips', 'data');
}

const dataDir = getDataDir();
const dbPath = path.join(dataDir, 'snips.db');

const args = process.argv.slice(2);
const isJson = args.includes('--json');
const cleanArgs = args.filter((a) => a !== '--json');

const command = cleanArgs[0];
const subcommand = cleanArgs[1];

/**
 * Outputs data based on format preference.
 * @param {*} data
 */
function output(data) {
	if (isJson) {
		process.stdout.write(JSON.stringify(data, null, 2) + '\n');
	} else {
		console.log(data);
	}
}

/**
 * Outputs an error and exits.
 * @param {string} code
 * @param {string} message
 * @param {number} exitCode
 */
function error(code, message, exitCode = 1) {
	if (isJson) {
		process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
	} else {
		process.stderr.write(`Error: ${message}\n`);
	}
	process.exit(exitCode);
}

/**
 * Loads the SnipsDb module if the database exists.
 */
function loadDb() {
	if (!fs.existsSync(dbPath)) {
		error('DB_NOT_FOUND', `Database not found at ${dbPath}. Is Snips installed?`, 1);
	}
	try {
		const { SnipsDb } = require('../src/main/db');
		return new SnipsDb(dataDir);
	} catch (e) {
		error('DB_LOAD_ERROR', `Could not load database: ${e.message}`, 1);
	}
}

// --- Command routing ---

async function main() {
	if (!command || 'help' === command || '--help' === command) {
		console.log('Snips CLI — snippet manager');
		console.log('');
		console.log('Usage: snips <command> [options]');
		console.log('');
		console.log('Commands:');
		console.log('  health              Show app status');
		console.log('  snippets list       List all snippets');
		console.log('  snippets search <q> Search snippets');
		console.log('  snippets get <id>   Get snippet details');
		console.log('  config show         Show settings');
		console.log('  config doctor       Validate configuration');
		console.log('');
		console.log('Options:');
		console.log('  --json              Machine-readable JSON output');
		process.exit(0);
	}

	switch (command) {
		case 'health':
			return cmdHealth();
		case 'snippets':
			return cmdSnippets(subcommand, cleanArgs.slice(2));
		case 'config':
			return cmdConfig(subcommand);
		default:
			error('UNKNOWN_COMMAND', `Unknown command: ${command}`, 2);
	}
}

// --- Health ---

function cmdHealth() {
	const dbExists = fs.existsSync(dbPath);
	const result = {
		ok: true,
		db: { path: dbPath, exists: dbExists },
		version: '0.2.0'
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

// --- Snippets ---

function cmdSnippets(sub, subArgs) {
	const db = loadDb();
	try {
		switch (sub) {
			case 'list':
				return output(db.listSnippets());
			case 'search':
				if (!subArgs[0]) error('MISSING_QUERY', 'Search query required', 2);
				return output(db.listSnippets({ query: subArgs[0] }));
			case 'get':
				if (!subArgs[0]) error('MISSING_ID', 'Snippet ID required', 2);
				const s = db.getSnippet(subArgs[0]);
				if (!s) error('NOT_FOUND', `Snippet not found: ${subArgs[0]}`, 1);
				return output(s);
			default:
				error('UNKNOWN_SUBCOMMAND', `Unknown: snippets ${sub}`, 2);
		}
	} finally {
		db.db.close();
	}
}

// --- Config ---

function cmdConfig(sub) {
	const db = loadDb();
	try {
		switch (sub) {
			case 'show': {
				const settings = db.getSettings();
				// Mask sensitive values
				delete settings.userAvatar;
				return output(settings);
			}
			case 'doctor': {
				const settings = db.getSettings();
				const issues = [];
				const wpm = Number(settings.wpm || 220);
				if (wpm < 60 || wpm > 500) issues.push(`WPM out of range: ${wpm}`);
				if (!settings.globalHotkey) issues.push('No palette hotkey configured');
				output({ ok: 0 === issues.length, issues });
				break;
			}
			default:
				error('UNKNOWN_SUBCOMMAND', `Unknown: config ${sub}`, 2);
		}
	} finally {
		db.db.close();
	}
}

main().catch((e) => {
	error('FATAL', e.message, 1);
});
