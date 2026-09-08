const LIMITS = Object.freeze({
	content: 1048576,
	name: 200,
	abbreviation: 200,
	notes: 10000,
	tags: 50,
	tag: 64,
	batch: 500,
	input: 8388608
});
const TRIGGER_MODES = ['immediate', 'whitespace', 'enterTab', 'wordBoundary'];
function validateSnippet(s) {
	const errors = [];
	const error = (field, message) => errors.push({ field, code: 'INVALID_FIELD', message });
	if (!s || typeof s !== 'object' || Array.isArray(s))
		return { valid: false, errors: [{ field: 'snippet', code: 'INVALID_TYPE', message: 'Expected an object.' }] };
	const allowed = new Set([
		'id',
		'groupId',
		'name',
		'abbreviation',
		'content',
		'enabled',
		'favorite',
		'notes',
		'triggerMode',
		'caseMode',
		'tags',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'revision',
		'ifRevision'
	]);
	for (const field of Object.keys(s)) if (!allowed.has(field)) error(field, 'Unknown snippet field.');
	for (const field of ['name', 'abbreviation', 'content', 'notes']) {
		if (s[field] === undefined && ['notes', 'abbreviation'].includes(field)) continue;
		if (typeof s[field] !== 'string' || s[field].length > LIMITS[field])
			error(field, `Expected text of at most ${LIMITS[field]} characters.`);
	}
	if (typeof s.content === 'string' && Buffer.byteLength(s.content) > LIMITS.content)
		error('content', 'Content exceeds 1 MiB UTF-8.');
	for (const field of ['name', 'content'])
		if (typeof s[field] === 'string' && !s[field].trim()) error(field, 'Required.');
	if (s.enabled !== false && s.enabled !== 0 && !s.abbreviation?.trim())
		error('abbreviation', 'Required for enabled snippets.');
	// eslint-disable-next-line no-control-regex
	if (typeof s.abbreviation === 'string' && /[\s\x00-\x1f\x7f]/.test(s.abbreviation))
		error('abbreviation', 'Whitespace and control characters are not allowed.');
	for (const field of ['id', 'groupId'])
		if (s[field] != null && (typeof s[field] !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(s[field])))
			error(field, 'Invalid identifier.');
	if (s.triggerMode !== undefined && !TRIGGER_MODES.includes(s.triggerMode))
		error('triggerMode', 'Unknown trigger mode.');
	if (s.caseMode !== undefined && s.caseMode !== 'exact')
		error('caseMode', 'Only exact, case-sensitive matching is supported.');
	for (const field of ['enabled', 'favorite'])
		if (s[field] !== undefined && ![true, false, 0, 1].includes(s[field])) error(field, 'Expected a boolean.');
	if (
		s.tags !== undefined &&
		(!Array.isArray(s.tags) ||
			s.tags.length > LIMITS.tags ||
			s.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > LIMITS.tag))
	)
		error('tags', 'Expected at most 50 non-empty tags of 64 characters.');
	if (s.ifRevision !== undefined && (!Number.isSafeInteger(s.ifRevision) || s.ifRevision < 1))
		error('ifRevision', 'Expected a positive integer.');
	if (typeof s.content === 'string' && (s.content.match(/\[\[cursor\]\]/g) || []).length > 1)
		error('content', 'Use at most one cursor marker.');
	return { valid: errors.length === 0, errors };
}
module.exports = { validateSnippet, LIMITS, TRIGGER_MODES };
