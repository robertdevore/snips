// Ordered, transactional upgrades. Unknown versions fail closed; keep the original DB intact.
function migrate(db) {
	const version = db.pragma('user_version', { simple: true });
	if (version > 1) throw new Error('DATABASE_TOO_NEW: update Snips before opening this database');
	if (version === 1) return;
	db.transaction(() => {
		for (const table of ['snippets', 'groups']) {
			if (
				!db
					.prepare(`PRAGMA table_info(${table})`)
					.all()
					.some((c) => c.name === 'deletedAt')
			)
				db.exec(`ALTER TABLE ${table} ADD COLUMN deletedAt INTEGER`);
		}
		db.exec(`CREATE TABLE snippets_v1 (
   id TEXT PRIMARY KEY, groupId TEXT, name TEXT NOT NULL, abbreviation TEXT NOT NULL,
   content TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
   favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)), notes TEXT,
   triggerMode TEXT NOT NULL DEFAULT 'immediate', caseMode TEXT NOT NULL DEFAULT 'exact' CHECK(caseMode='exact'),
   createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER,
   revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0));
   INSERT INTO snippets_v1 SELECT id,groupId,name,abbreviation,content,enabled,favorite,notes,triggerMode,'exact',createdAt,updatedAt,deletedAt,1 FROM snippets;
   DROP TABLE snippets; ALTER TABLE snippets_v1 RENAME TO snippets;
   CREATE UNIQUE INDEX snippets_active_abbreviation ON snippets(abbreviation) WHERE deletedAt IS NULL AND abbreviation != '';
   CREATE INDEX snippets_group ON snippets(groupId,deletedAt);
   CREATE INDEX snippets_order ON snippets(favorite DESC,updatedAt DESC,id) WHERE deletedAt IS NULL;
   CREATE TABLE history (id INTEGER PRIMARY KEY, snippetId TEXT NOT NULL, operation TEXT NOT NULL, timestamp INTEGER NOT NULL, source TEXT NOT NULL, beforeState TEXT, afterState TEXT);
   CREATE INDEX history_snippet ON history(snippetId,id);
   CREATE TABLE idempotency (key TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
   CREATE VIRTUAL TABLE snippet_search USING fts5(name,abbreviation,content,content='snippets',content_rowid='rowid', tokenize='unicode61');
   INSERT INTO snippet_search(snippet_search) VALUES('rebuild');
   CREATE TRIGGER snippets_ai AFTER INSERT ON snippets BEGIN INSERT INTO snippet_search(rowid,name,abbreviation,content) VALUES(new.rowid,new.name,new.abbreviation,new.content); END;
   CREATE TRIGGER snippets_ad AFTER DELETE ON snippets BEGIN INSERT INTO snippet_search(snippet_search,rowid,name,abbreviation,content) VALUES('delete',old.rowid,old.name,old.abbreviation,old.content); END;
   CREATE TRIGGER snippets_au AFTER UPDATE OF name,abbreviation,content ON snippets BEGIN
    INSERT INTO snippet_search(snippet_search,rowid,name,abbreviation,content) VALUES('delete',old.rowid,old.name,old.abbreviation,old.content);
    INSERT INTO snippet_search(rowid,name,abbreviation,content) VALUES(new.rowid,new.name,new.abbreviation,new.content); END;
   PRAGMA user_version=1;`);
	}).immediate();
}
module.exports = { migrate };
