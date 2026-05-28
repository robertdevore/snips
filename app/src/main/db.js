const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * @typedef {object} Group
 * @property {string} id
 * @property {string} name
 * @property {string|null} parentId
 * @property {number} sortOrder
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} Snippet
 * @property {string} id
 * @property {string} groupId
 * @property {string} name
 * @property {string} abbreviation
 * @property {string} content
 * @property {number} enabled
 * @property {number} favorite
 * @property {string} notes
 * @property {string} triggerMode
 * @property {string} caseMode
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string[]} [tags]
 */

/**
 * @typedef {object} SnippetCounts
 * @property {number} total
 * @property {Object<string,number>} byGroup
 */

/**
 * @typedef {object} Settings
 * @property {string} enabled
 * @property {string} expandOn
 * @property {string} maxBufferLength
 * @property {string} globalHotkey
 * @property {string} pauseExpansions
 * @property {string} helperHost
 * @property {string} helperPort
 * @property {string} appEventPort
 * @property {string} [key: string]
 */

/**
 * @typedef {object} StatsResult
 * @property {Array} perSnippet
 * @property {{expansions: number, timeSavedMs: number}} summary
 * @property {{fromTs: number, toTs: number}} range
 */

class SnipsDb {
	/**
	 * @param {string} baseDir - Path to the data directory
	 */
	constructor(baseDir) {
		this.baseDir = baseDir;
		if (!fs.existsSync(baseDir)) {
			fs.mkdirSync(baseDir, { recursive: true });
		}
		this.dbPath = path.join(baseDir, 'snips.db');
		this.db = new Database(this.dbPath);
		this.db.pragma('journal_mode = WAL');
		this.initialize();
	}

	initialize() {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS groups (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				parentId TEXT,
				sortOrder INTEGER DEFAULT 0,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL,
				deletedAt INTEGER
			);

			CREATE TABLE IF NOT EXISTS snippets (
				id TEXT PRIMARY KEY,
				groupId TEXT,
				name TEXT NOT NULL,
				abbreviation TEXT NOT NULL,
				content TEXT NOT NULL,
				enabled INTEGER NOT NULL DEFAULT 1,
				favorite INTEGER NOT NULL DEFAULT 0,
				notes TEXT,
				triggerMode TEXT NOT NULL DEFAULT 'immediate',
				caseMode TEXT NOT NULL DEFAULT 'exact',
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL,
				deletedAt INTEGER,
				UNIQUE(abbreviation)
			);

			CREATE TABLE IF NOT EXISTS snippet_tags (
				snippetId TEXT NOT NULL,
				tag TEXT NOT NULL,
				PRIMARY KEY(snippetId, tag)
			);

			CREATE TABLE IF NOT EXISTS events (
				id TEXT PRIMARY KEY,
				snippetId TEXT NOT NULL,
				timestamp INTEGER NOT NULL,
				charsInserted INTEGER NOT NULL,
				charsSaved INTEGER NOT NULL,
				timeSavedMs INTEGER NOT NULL,
				appBundleId TEXT
			);

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
			CREATE INDEX IF NOT EXISTS idx_events_snippet_timestamp ON events(snippetId, timestamp);
		`);

		this.ensureDefaults();
		this.runMigrations();
	}

	runMigrations() {
		// Add deletedAt to snippets if missing (soft-delete support)
		try {
			this.db.exec('ALTER TABLE snippets ADD COLUMN deletedAt INTEGER');
		} catch (_e) {
			/* Column already exists */
		}
		// Add deletedAt to groups if missing
		try {
			this.db.exec('ALTER TABLE groups ADD COLUMN deletedAt INTEGER');
		} catch (_e) {
			/* Column already exists */
		}
	}

	ensureDefaults() {
		const now = Date.now();
		const groupCount = this.db.prepare('SELECT COUNT(*) AS count FROM groups').get().count;
		if (0 === groupCount) {
			this.db
				.prepare(
					'INSERT INTO groups (id, name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
				)
				.run('default', 'General', null, 0, now, now);
		}

		const defaults = {
			enabled: 'true',
			expandOn: 'whitespace',
			maxBufferLength: '200',
			globalHotkey: 'CommandOrControl+Shift+Space',
			hotkeyOpenSnips: '',
			hotkeyNewSnippet: '',
			hotkeyOpenSettings: '',
			hotkeyOpenStats: '',
			excludedApps: '[]',
			secureInputBehavior: 'disable',
			userName: 'Local',
			userAvatar: '',
			wpm: '220',
			charsPerWord: '6',
			helperHost: '127.0.0.1',
			helperPort: '50555',
			appEventPort: '50556',
			pauseExpansions: 'false'
		};

		const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
		for (const [key, value] of Object.entries(defaults)) {
			stmt.run(key, value);
		}
	}

	/**
	 * Lists all groups ordered by sortOrder then name.
	 * @returns {Group[]}
	 */
	listGroups() {
		return this.db.prepare('SELECT * FROM groups WHERE deletedAt IS NULL ORDER BY sortOrder ASC, name ASC').all();
	}

	/**
	 * Returns total snippet count and per-group counts.
	 * @returns {SnippetCounts}
	 */
	getSnippetCounts() {
		const rows = this.db
			.prepare(
				`
			SELECT COALESCE(groupId, 'default') AS groupId, COUNT(*) AS count
			FROM snippets
			WHERE deletedAt IS NULL
			GROUP BY COALESCE(groupId, 'default')
		`
			)
			.all();
		const total = this.db.prepare('SELECT COUNT(*) AS count FROM snippets WHERE deletedAt IS NULL').get().count;
		const byGroup = {};
		for (const row of rows) {
			byGroup[row.groupId] = Number(row.count || 0);
		}
		return { total: Number(total || 0), byGroup };
	}

	/**
	 * Finds a group by exact name.
	 * @param {string} name
	 * @returns {Group|undefined}
	 */
	getGroupByName(name) {
		return this.db.prepare('SELECT * FROM groups WHERE name = ? LIMIT 1').get(name);
	}

	/**
	 * Creates or updates a group.
	 * @param {object} group
	 * @param {string} [group.id]
	 * @param {string} group.name
	 * @param {string|null} [group.parentId]
	 * @param {number} [group.sortOrder]
	 * @returns {Group}
	 */
	saveGroup(group) {
		const now = Date.now();
		const id = group.id || `group_${now}`;
		const existing = this.db.prepare('SELECT id FROM groups WHERE id = ?').get(id);
		if (existing) {
			this.db
				.prepare('UPDATE groups SET name = ?, parentId = ?, sortOrder = ?, updatedAt = ? WHERE id = ?')
				.run(group.name, group.parentId || null, group.sortOrder || 0, now, id);
		} else {
			this.db
				.prepare(
					'INSERT INTO groups (id, name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
				)
				.run(id, group.name, group.parentId || null, group.sortOrder || 0, now, now);
		}
		return this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
	}

	/**
	 * Deletes a group, moving its snippets to the General group.
	 * The default group cannot be deleted.
	 * @param {string} id
	 */
	deleteGroup(id) {
		const fallback = 'default';
		this.db.prepare('UPDATE snippets SET groupId = ? WHERE groupId = ? AND deletedAt IS NULL').run(fallback, id);
		this.db.prepare('UPDATE groups SET deletedAt = ? WHERE id = ? AND id != ?').run(Date.now(), id, fallback);
	}

	/**
	 * Finds a snippet by its abbreviation (unique).
	 * @param {string} abbreviation
	 * @returns {Snippet|undefined}
	 */
	getSnippetByAbbreviation(abbreviation) {
		return this.db.prepare('SELECT * FROM snippets WHERE abbreviation = ? LIMIT 1').get(abbreviation);
	}

	/**
	 * Lists snippets with optional filtering and sorting.
	 * @param {object} [options]
	 * @param {string} [options.query] - Search term (LIKE match on name, abbreviation, content)
	 * @param {string|null} [options.groupId] - Filter by group ID
	 * @param {string} [options.sort] - Sort mode (updated_desc, created_desc, name_asc, etc.)
	 * @returns {Snippet[]}
	 */
	listSnippets({ query = '', groupId = null, sort = 'updated_desc' } = {}) {
		let sql = 'SELECT * FROM snippets WHERE deletedAt IS NULL';
		const params = [];
		if (groupId) {
			sql += ' AND groupId = ?';
			params.push(groupId);
		}
		if (query) {
			sql += ' AND (name LIKE ? OR abbreviation LIKE ? OR content LIKE ?)';
			const like = `%${query}%`;
			params.push(like, like, like);
		}
		let order = 'updatedAt DESC';
		switch (String(sort || '')) {
			case 'created_desc':
				order = 'createdAt DESC';
				break;
			case 'created_asc':
				order = 'createdAt ASC';
				break;
			case 'updated_asc':
				order = 'updatedAt ASC';
				break;
			case 'name_asc':
				order = 'name COLLATE NOCASE ASC';
				break;
			case 'name_desc':
				order = 'name COLLATE NOCASE DESC';
				break;
			case 'recently_used':
				order = 'updatedAt DESC';
				break;
			case 'updated_desc':
			default:
				order = 'updatedAt DESC';
				break;
		}
		sql += ` ORDER BY favorite DESC, ${order}`;
		const rows = this.db.prepare(sql).all(...params);
		return rows.map((row) => ({ ...row, tags: this.listTags(row.id) }));
	}

	/**
	 * Gets a single snippet by ID, including its tags.
	 * @param {string} id
	 * @returns {Snippet|null}
	 */
	getSnippet(id) {
		const row = this.db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
		if (!row) {
			return null;
		}
		return { ...row, tags: this.listTags(row.id) };
	}

	/**
	 * Lists tags for a snippet.
	 * @param {string} snippetId
	 * @returns {string[]}
	 */
	listTags(snippetId) {
		return this.db
			.prepare('SELECT tag FROM snippet_tags WHERE snippetId = ? ORDER BY tag ASC')
			.all(snippetId)
			.map((r) => r.tag);
	}

	/**
	 * Creates or updates a snippet and its tags.
	 * @param {object} snippet
	 * @param {string} [snippet.id]
	 * @param {string} snippet.groupId
	 * @param {string} snippet.name
	 * @param {string} snippet.abbreviation
	 * @param {string} snippet.content
	 * @param {boolean} [snippet.enabled]
	 * @param {boolean} [snippet.favorite]
	 * @param {string} [snippet.notes]
	 * @param {string} [snippet.triggerMode]
	 * @param {string} [snippet.caseMode]
	 * @param {string[]} [snippet.tags]
	 * @returns {Snippet}
	 */
	saveSnippet(snippet) {
		const now = Date.now();
		const id = snippet.id || `snippet_${now}`;
		const existing = this.db.prepare('SELECT id FROM snippets WHERE id = ?').get(id);
		const payload = {
			groupId: snippet.groupId || 'default',
			name: snippet.name || 'Untitled snippet',
			abbreviation: snippet.abbreviation || '',
			content: snippet.content || '',
			enabled: snippet.enabled ? 1 : 0,
			favorite: snippet.favorite ? 1 : 0,
			notes: snippet.notes || '',
			triggerMode: snippet.triggerMode || 'immediate',
			caseMode: snippet.caseMode || 'exact'
		};

		if (existing) {
			this.db
				.prepare(
					`
				UPDATE snippets
				SET groupId = ?, name = ?, abbreviation = ?, content = ?, enabled = ?, favorite = ?, notes = ?, triggerMode = ?, caseMode = ?, updatedAt = ?
				WHERE id = ?
			`
				)
				.run(
					payload.groupId,
					payload.name,
					payload.abbreviation,
					payload.content,
					payload.enabled,
					payload.favorite,
					payload.notes,
					payload.triggerMode,
					payload.caseMode,
					now,
					id
				);
		} else {
			this.db
				.prepare(
					`
				INSERT INTO snippets (id, groupId, name, abbreviation, content, enabled, favorite, notes, triggerMode, caseMode, createdAt, updatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
				)
				.run(
					id,
					payload.groupId,
					payload.name,
					payload.abbreviation,
					payload.content,
					payload.enabled,
					payload.favorite,
					payload.notes,
					payload.triggerMode,
					payload.caseMode,
					now,
					now
				);
		}

		this.db.prepare('DELETE FROM snippet_tags WHERE snippetId = ?').run(id);
		if (Array.isArray(snippet.tags)) {
			const insertTag = this.db.prepare('INSERT OR IGNORE INTO snippet_tags (snippetId, tag) VALUES (?, ?)');
			for (const tag of snippet.tags) {
				if (tag && String(tag).trim()) {
					insertTag.run(id, String(tag).trim());
				}
			}
		}

		return this.getSnippet(id);
	}

	/**
	 * Soft-deletes a snippet (sets deletedAt timestamp).
	 * @param {string} id
	 */
	deleteSnippet(id) {
		this.db.prepare('UPDATE snippets SET deletedAt = ? WHERE id = ?').run(Date.now(), id);
	}

	/**
	 * Returns all settings as a key-value object.
	 * @returns {Settings}
	 */
	getSettings() {
		const rows = this.db.prepare('SELECT key, value FROM settings').all();
		const out = {};
		for (const row of rows) {
			out[row.key] = row.value;
		}
		return out;
	}

	/**
	 * Saves settings. Only the provided keys are updated.
	 * @param {object} input - Key-value pairs to save
	 * @returns {Settings}
	 */
	saveSettings(input) {
		const stmt = this.db.prepare(
			'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		);
		for (const [key, value] of Object.entries(input || {})) {
			stmt.run(key, String(value));
		}
		return this.getSettings();
	}

	/**
	 * Records an expansion event for stats tracking.
	 * @param {object} event
	 * @param {string} event.id
	 * @param {string} event.snippetId
	 * @param {number} event.timestamp
	 * @param {number} event.charsInserted
	 * @param {number} event.charsSaved
	 * @param {number} event.timeSavedMs
	 * @param {string} [event.appBundleId]
	 */
	recordEvent(event) {
		this.db
			.prepare(
				`
			INSERT INTO events (id, snippetId, timestamp, charsInserted, charsSaved, timeSavedMs, appBundleId)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`
			)
			.run(
				event.id,
				event.snippetId,
				event.timestamp,
				event.charsInserted,
				event.charsSaved,
				event.timeSavedMs,
				event.appBundleId || null
			);
	}

	/**
	 * Returns usage stats for a date range.
	 * @param {object} [range]
	 * @param {number} [range.fromTs] - Start timestamp (default: 7 days ago)
	 * @param {number} [range.toTs] - End timestamp (default: now)
	 * @returns {StatsResult}
	 */
	getStats(range) {
		const now = Date.now();
		const defaultFrom = now - 7 * 24 * 60 * 60 * 1000;
		const fromTs = range && range.fromTs ? Number(range.fromTs) : defaultFrom;
		const toTs = range && range.toTs ? Number(range.toTs) : now;

		const perSnippet = this.db
			.prepare(
				`
			SELECT
				s.id,
				s.name,
				s.abbreviation,
				COUNT(e.id) AS expansionCount,
				MAX(e.timestamp) AS lastUsedAt,
				COALESCE(SUM(e.charsInserted), 0) AS charsInsertedTotal,
				COALESCE(SUM(e.charsSaved), 0) AS charsSavedTotal,
				COALESCE(SUM(e.timeSavedMs), 0) AS timeSavedMsTotal
			FROM snippets s
			LEFT JOIN events e
				ON e.snippetId = s.id
				AND e.timestamp >= ?
				AND e.timestamp <= ?
			GROUP BY s.id
			ORDER BY expansionCount DESC, s.name ASC
		`
			)
			.all(fromTs, toTs);

		const summary = this.db
			.prepare(
				`
			SELECT
				COUNT(*) AS expansions,
				COALESCE(SUM(timeSavedMs), 0) AS timeSavedMs
			FROM events
			WHERE timestamp >= ? AND timestamp <= ?
		`
			)
			.get(fromTs, toTs);

		return {
			perSnippet,
			summary,
			range: { fromTs, toTs }
		};
	}

	/**
	 * Returns snippets that should be sent to the helper for expansion.
	 * Only enabled snippets with non-empty abbreviations.
	 * @returns {Array<{id: string, abbreviation: string, content: string, triggerMode: string, caseMode: string}>}
	 */
	getEnabledSnippetsForHelper() {
		return this.db
			.prepare(
				`
			SELECT id, abbreviation, content, triggerMode, caseMode
			FROM snippets
			WHERE enabled = 1 AND abbreviation != '' AND deletedAt IS NULL
		`
			)
			.all();
	}
}

module.exports = { SnipsDb };
