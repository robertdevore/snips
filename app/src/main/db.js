const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class SnipsDb {
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
				updatedAt INTEGER NOT NULL
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

	listGroups() {
		return this.db.prepare('SELECT * FROM groups ORDER BY sortOrder ASC, name ASC').all();
	}

	getSnippetCounts() {
		const rows = this.db
			.prepare(
				`
			SELECT COALESCE(groupId, 'default') AS groupId, COUNT(*) AS count
			FROM snippets
			GROUP BY COALESCE(groupId, 'default')
		`
			)
			.all();
		const total = this.db.prepare('SELECT COUNT(*) AS count FROM snippets').get().count;
		const byGroup = {};
		for (const row of rows) {
			byGroup[row.groupId] = Number(row.count || 0);
		}
		return { total: Number(total || 0), byGroup };
	}

	getGroupByName(name) {
		return this.db.prepare('SELECT * FROM groups WHERE name = ? LIMIT 1').get(name);
	}

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

	deleteGroup(id) {
		const fallback = 'default';
		this.db.prepare('UPDATE snippets SET groupId = ? WHERE groupId = ?').run(fallback, id);
		this.db.prepare('DELETE FROM groups WHERE id = ? AND id != ?').run(id, fallback);
	}

	getSnippetByAbbreviation(abbreviation) {
		return this.db.prepare('SELECT * FROM snippets WHERE abbreviation = ? LIMIT 1').get(abbreviation);
	}

	listSnippets({ query = '', groupId = null, sort = 'updated_desc' } = {}) {
		let sql = 'SELECT * FROM snippets WHERE 1 = 1';
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
			case 'updated_desc':
			default:
				order = 'updatedAt DESC';
				break;
		}
		sql += ` ORDER BY favorite DESC, ${order}`;
		const rows = this.db.prepare(sql).all(...params);
		return rows.map((row) => ({ ...row, tags: this.listTags(row.id) }));
	}

	getSnippet(id) {
		const row = this.db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
		if (!row) {
			return null;
		}
		return { ...row, tags: this.listTags(row.id) };
	}

	listTags(snippetId) {
		return this.db
			.prepare('SELECT tag FROM snippet_tags WHERE snippetId = ? ORDER BY tag ASC')
			.all(snippetId)
			.map((r) => r.tag);
	}

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

	deleteSnippet(id) {
		this.db.prepare('DELETE FROM snippet_tags WHERE snippetId = ?').run(id);
		this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
	}

	getSettings() {
		const rows = this.db.prepare('SELECT key, value FROM settings').all();
		const out = {};
		for (const row of rows) {
			out[row.key] = row.value;
		}
		return out;
	}

	saveSettings(input) {
		const stmt = this.db.prepare(
			'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		);
		for (const [key, value] of Object.entries(input || {})) {
			stmt.run(key, String(value));
		}
		return this.getSettings();
	}

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

	getEnabledSnippetsForHelper() {
		return this.db
			.prepare(
				`
			SELECT id, abbreviation, content, triggerMode, caseMode
			FROM snippets
			WHERE enabled = 1 AND abbreviation != ''
		`
			)
			.all();
	}
}

module.exports = { SnipsDb };
