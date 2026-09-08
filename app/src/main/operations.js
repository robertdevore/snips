const { createHash } = require('crypto');
const { LIMITS } = require('./validation');
const fail = (code) => {
	throw Object.assign(new Error(code), { code });
};
const OPERATIONS = ['create', 'update', 'move', 'tag', 'enable', 'favorite', 'trash', 'restore', 'revert'];
function apply(db, op) {
	if (!op || !OPERATIONS.includes(op.type)) fail('UNKNOWN_OPERATION');
	if (op.type === 'create') {
		if (op.snippet?.id && db.getSnippet(op.snippet.id, { includeDeleted: true })) fail('ID_EXISTS');
		return db.saveSnippet({ ...op.snippet, enabled: op.snippet?.enabled ?? true });
	}
	const current = db.getSnippet(op.id, { includeDeleted: true });
	if (!current) fail('NOT_FOUND');
	if (op.ifRevision !== undefined && current.revision !== op.ifRevision) fail('REVISION_CONFLICT');
	if (op.type === 'trash' || op.type === 'restore') return db.changeTrash(op.id, op.type === 'trash', op.ifRevision);
	let patch = op.patch || {};
	if (op.type === 'move') patch = { groupId: op.groupId };
	if (op.type === 'tag') patch = { tags: op.tags };
	if (op.type === 'enable') patch = { enabled: op.enabled };
	if (op.type === 'favorite') patch = { favorite: op.favorite };
	if (op.type === 'revert') {
		const h = db.historyEntry(op.id, op.historyId);
		if (!h?.beforeState) fail('HISTORY_NOT_FOUND');
		patch = JSON.parse(h.beforeState);
	}
	return db.saveSnippet({ ...current, ...patch, id: op.id, ifRevision: op.ifRevision });
}
function execute(db, operations, { dryRun = false, idempotencyKey, source = 'cli' } = {}) {
	if (!Array.isArray(operations) || !operations.length || operations.length > LIMITS.batch)
		fail('INVALID_BATCH_SIZE');
	if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[\w.-]{1,128}$/.test(idempotencyKey)))
		fail('INVALID_IDEMPOTENCY_KEY');
	const request = createHash('sha256').update(JSON.stringify(operations)).digest('hex');
	const rollback = {};
	let result;
	try {
		db.db
			.transaction(() => {
				if (idempotencyKey) {
					const prior = db.db.prepare('SELECT * FROM idempotency WHERE key=?').get(idempotencyKey);
					if (prior) {
						if (prior.request !== request) fail('IDEMPOTENCY_CONFLICT');
						result = JSON.parse(prior.result);
						return;
					}
				}
				const oldSource = db.source;
				db.source = source;
				try {
					result = { ok: true, results: operations.map((op) => apply(db, op)) };
				} finally {
					db.source = oldSource;
				}
				if (dryRun) throw rollback;
				if (idempotencyKey)
					db.db
						.prepare('INSERT INTO idempotency VALUES(?,?,?)')
						.run(idempotencyKey, request, JSON.stringify(result));
			})
			.immediate();
	} catch (e) {
		if (e !== rollback) throw e;
	}
	return { ...result, ...(dryRun ? { dryRun: true } : {}) };
}
module.exports = { execute, OPERATIONS };
