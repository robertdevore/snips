const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { makeId, chunkIds } = require('./db-utils');
const { migrate } = require('./migrations');
const { validateSnippet } = require('./validation');
const fail = (code, message = code) => {
	throw Object.assign(new Error(message), { code });
};

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
			fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
		}
		this.dbPath = path.join(baseDir, 'snips.db');
		this.db = new Database(this.dbPath);
		fs.chmodSync(this.dbPath, 0o600);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('busy_timeout = 5000');
		this.source = 'gui';
		try {
			this.initialize();
		} catch (error) {
			this.db.close();
			throw error;
		}
	}

	initialize() {
		if (this.db.pragma('user_version', { simple: true }) > 1) fail('DATABASE_TOO_NEW');
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
		migrate(this.db);
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
		return this.db.prepare('SELECT * FROM groups WHERE name = ? AND deletedAt IS NULL LIMIT 1').get(name);
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
		if (!group || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 200)
			fail('INVALID_GROUP');
		const now = Date.now();
		const id = group.id || makeId('group');
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
		return this.db
			.transaction(() => {
				if (id === 'default') fail('DEFAULT_GROUP');
				for (const snippet of this.listSnippets({ groupId: id }))
					this.saveSnippet({ ...snippet, groupId: 'default' });
				this.db.prepare('UPDATE groups SET deletedAt=? WHERE id=?').run(Date.now(), id);
			})
			.immediate();
	}

	/**
	 * Finds a snippet by its abbreviation (unique).
	 * @param {string} abbreviation
	 * @returns {Snippet|undefined}
	 */
	getSnippetByAbbreviation(abbreviation) {
		return this.db
			.prepare('SELECT * FROM snippets WHERE abbreviation = ? AND deletedAt IS NULL LIMIT 1')
			.get(abbreviation);
	}

	/**
	 * Lists snippets with optional filtering and sorting.
	 * @param {object} [options]
	 * @param {string} [options.query] - Search term (LIKE match on name, abbreviation, content)
	 * @param {string|null} [options.groupId] - Filter by group ID
	 * @param {string} [options.sort] - Sort mode (updated_desc, created_desc, name_asc, etc.)
	 * @returns {Snippet[]}
	 */
	listSnippets({
		query = '',
		groupId = null,
		sort = 'updated_desc',
		trash = false,
		limit = 50000,
		offset = 0,
		tag = null,
		favorite = false,
		metadata = false,
		countOnly = false
	} = {}) {
		if (typeof query !== 'string' || query.length > 500) fail('INVALID_QUERY');
		const fts = query
			.match(/[\p{L}\p{N}_]+/gu)
			?.map((t) => '"' + t + '"*')
			.join(' AND ');
		let sql =
			(metadata
				? 'SELECT snippets.id, groupId, snippets.name, snippets.abbreviation, enabled, favorite, updatedAt, revision, substr(snippets.content,1,120) AS preview'
				: 'SELECT snippets.*') +
			(fts
				? ' FROM snippets JOIN snippet_search ON snippet_search.rowid=snippets.rowid WHERE deletedAt IS '
				: ' FROM snippets WHERE deletedAt IS ') +
			(trash ? 'NOT NULL' : 'NULL');
		if (!Number.isInteger(limit) || limit < 1 || limit > 50000 || !Number.isInteger(offset) || offset < 0)
			fail('INVALID_PAGINATION');
		if (typeof query !== 'string' || query.length > 500) fail('INVALID_QUERY');
		const params = [];
		if (groupId) {
			sql += ' AND groupId = ?';
			params.push(groupId);
		}
		if (tag) {
			sql += ' AND id IN (SELECT snippetId FROM snippet_tags WHERE tag=?)';
			params.push(tag);
		}
		if (favorite) sql += ' AND favorite=1';
		if (fts) {
			sql += ' AND snippet_search MATCH ?';
			params.push(fts);
		} else if (query) {
			sql += ' AND snippets.abbreviation LIKE ?';
			params.push(query + '%');
		}
		if (countOnly) {
			const from = sql.slice(sql.indexOf(' FROM '));
			return this.db.prepare('SELECT COUNT(*) AS total' + from).get(...params).total;
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
				order = '(SELECT MAX(timestamp) FROM events WHERE snippetId=snippets.id) DESC';
				break;
			case 'updated_desc':
			default:
				order = 'updatedAt DESC';
				break;
		}
		if (fts) {
			sql +=
				' ORDER BY (snippets.abbreviation = ?) DESC, bm25(snippet_search,8,12,1), favorite DESC, snippets.id';
			params.push(query);
		} else sql += ` ORDER BY favorite DESC, ${order}, id`;
		sql += ' LIMIT ? OFFSET ?';
		params.push(limit, offset);
		const rows = this.db.prepare(sql).all(...params);
		const tagsBySnippet = this.listTagsForSnippets(rows.map((row) => row.id));
		return rows.map((row) => ({ ...row, tags: tagsBySnippet.get(row.id) || [] }));
	}

	/**
	 * Loads tags for many snippets in bounded batches, avoiding one query per row.
	 * @param {string[]} snippetIds
	 * @returns {Map<string,string[]>}
	 */
	listTagsForSnippets(snippetIds) {
		const tagsBySnippet = new Map();
		for (const batch of chunkIds(snippetIds)) {
			const placeholders = batch.map(() => '?').join(',');
			const rows = this.db
				.prepare(
					`SELECT snippetId, tag FROM snippet_tags WHERE snippetId IN (${placeholders}) ORDER BY tag ASC`
				)
				.all(...batch);
			for (const row of rows) {
				const tags = tagsBySnippet.get(row.snippetId) || [];
				tags.push(row.tag);
				tagsBySnippet.set(row.snippetId, tags);
			}
		}
		return tagsBySnippet;
	}

	/**
	 * Gets a single snippet by ID, including its tags.
	 * @param {string} id
	 * @returns {Snippet|null}
	 */
	getSnippet(id, { includeDeleted = false } = {}) {
		const row = this.db
			.prepare('SELECT * FROM snippets WHERE id = ?' + (includeDeleted ? '' : ' AND deletedAt IS NULL'))
			.get(id);
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
		return this.db.transaction(() => this._saveSnippet(snippet)).immediate();
	}
	_saveSnippet(snippet) {
		const validation = validateSnippet(snippet);
		if (!validation.valid) fail('VALIDATION_ERROR', JSON.stringify(validation.errors));
		if (
			!this.db.prepare('SELECT id FROM groups WHERE id=? AND deletedAt IS NULL').get(snippet.groupId || 'default')
		)
			fail('GROUP_NOT_FOUND');
		const before = snippet.id ? this.getSnippet(snippet.id, { includeDeleted: true }) : null;
		if (before?.deletedAt) fail('SNIPPET_TRASHED');
		if (snippet.ifRevision !== undefined && before?.revision !== snippet.ifRevision) fail('REVISION_CONFLICT');
		const now = Date.now();
		const id = snippet.id || makeId('snippet');
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
				SET groupId = ?, name = ?, abbreviation = ?, content = ?, enabled = ?, favorite = ?, notes = ?, triggerMode = ?, caseMode = ?, revision = revision + 1, updatedAt = ?
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

		const saved = this.getSnippet(id);
		this.recordHistory(id, before ? 'update' : 'create', before, saved);
		return saved;
	}

	/**
	 * Soft-deletes a snippet (sets deletedAt timestamp).
	 * @param {string} id
	 */
	deleteSnippet(id) {
		return this.changeTrash(id, true);
	}

	recordHistory(id, operation, before, after) {
		this.db
			.prepare(
				'INSERT INTO history(snippetId,operation,timestamp,source,beforeState,afterState) VALUES(?,?,?,?,?,?)'
			)
			.run(
				id,
				operation,
				Date.now(),
				this.source,
				before ? JSON.stringify(before) : null,
				after ? JSON.stringify(after) : null
			);
		this.db
			.prepare(
				'DELETE FROM history WHERE snippetId=? AND id NOT IN (SELECT id FROM history WHERE snippetId=? ORDER BY id DESC LIMIT 100)'
			)
			.run(id, id);
	}
	history(id) {
		return this.db
			.prepare(
				'SELECT id,snippetId,operation,timestamp,source,(beforeState IS NOT NULL) AS hasBefore FROM history WHERE snippetId=? ORDER BY id DESC LIMIT 100'
			)
			.all(id);
	}
	historyEntry(id, historyId) {
		return this.db.prepare('SELECT * FROM history WHERE snippetId=? AND id=?').get(id, historyId);
	}

	changeTrash(id, trash, ifRevision) {
		return this.db
			.transaction(() => {
				const before = this.getSnippet(id, { includeDeleted: true });
				if (!before) fail('NOT_FOUND');
				if (ifRevision !== undefined && before.revision !== ifRevision) fail('REVISION_CONFLICT');
				if (Boolean(before.deletedAt) === trash) return before;
				let group = before.groupId;
				if (!this.listGroups().some((g) => g.id === group)) group = 'default';
				this.db
					.prepare('UPDATE snippets SET deletedAt=?,groupId=?,revision=revision+1,updatedAt=? WHERE id=?')
					.run(trash ? Date.now() : null, group, Date.now(), id);
				const after = this.getSnippet(id, { includeDeleted: true });
				this.recordHistory(id, trash ? 'trash' : 'restore', before, after);
				return after;
			})
			.immediate();
	}
	purgeSnippet(id, ifRevision) {
		return this.db
			.transaction(() => {
				const s = this.getSnippet(id, { includeDeleted: true });
				if (!s?.deletedAt) fail('TRASH_REQUIRED');
				if (ifRevision !== undefined && s.revision !== ifRevision) fail('REVISION_CONFLICT');
				for (const table of ['snippet_tags', 'events', 'history'])
					this.db.prepare(`DELETE FROM ${table} WHERE snippetId=?`).run(id);
				this.db.prepare('DELETE FROM snippets WHERE id=?').run(id);
				// Retry receipts can contain previous contents; purge those too.
				this.db.prepare('DELETE FROM idempotency').run();
				return { id, purged: true };
			})
			.immediate();
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
		const existing = this.getSettings();
		for (const [key, value] of Object.entries(input || {})) {
			if (!Object.hasOwn(existing, key)) fail('UNKNOWN_SETTING');
			const text = String(value);
			if (text.length > 1048576) fail('SETTING_TOO_LARGE');
			if (['enabled', 'pauseExpansions'].includes(key) && !['true', 'false'].includes(text))
				fail('INVALID_SETTING');
			const ranges = { wpm: [60, 500], charsPerWord: [1, 20], maxBufferLength: [1, 2000] };
			if (
				ranges[key] &&
				(!Number.isInteger(Number(text)) || Number(text) < ranges[key][0] || Number(text) > ranges[key][1])
			)
				fail('INVALID_SETTING');
			if (
				(key === 'helperHost' && text !== '127.0.0.1') ||
				(key === 'helperPort' && text !== '50555') ||
				(key === 'appEventPort' && text !== '50556')
			)
				fail('FIXED_HELPER_ENDPOINT');
			if (key === 'secureInputBehavior' && text !== 'disable') fail('SECURE_INPUT_REQUIRED');
			if (key === 'excludedApps') {
				const apps = JSON.parse(text);
				if (
					!Array.isArray(apps) ||
					apps.length > 500 ||
					apps.some((a) => typeof a !== 'string' || a.length > 256)
				)
					fail('INVALID_SETTING');
			}
			if (key === 'userAvatar' && text && !/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(text))
				fail('INVALID_AVATAR');
		}
		return this.db
			.transaction(() => {
				const stmt = this.db.prepare(
					'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
				);
				for (const [key, value] of Object.entries(input || {})) {
					stmt.run(key, String(value));
				}
				return this.getSettings();
			})
			.immediate();
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
			INSERT OR IGNORE INTO events (id, snippetId, timestamp, charsInserted, charsSaved, timeSavedMs, appBundleId)
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
	 * Resets all stats events, optionally for a specific snippet.
	 * @param {string} [snippetId] - If provided, only reset stats for this snippet
	 */
	resetStats(snippetId) {
		if (snippetId) {
			this.db.prepare('DELETE FROM events WHERE snippetId = ?').run(snippetId);
		} else {
			this.db.prepare('DELETE FROM events').run();
		}
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
