/**
 * Snippet validation utilities.
 * Validates snippet data before saving to the database.
 */

/**
 * Validates snippet data and returns structured errors.
 * @param {object} snippet
 * @param {string} snippet.name
 * @param {string} snippet.abbreviation
 * @param {string} snippet.content
 * @param {string} snippet.groupId
 * @param {boolean} [snippet.enabled]
 * @returns {{ valid: boolean, errors: Array<{field: string, message: string}> }}
 */
function validateSnippet(snippet) {
	const errors = [];
	const s = snippet || {};

	// Name is required
	if (!String(s.name || '').trim()) {
		errors.push({ field: 'name', message: 'Name is required.' });
	}

	// Content is required
	if (!String(s.content || '').trim()) {
		errors.push({ field: 'content', message: 'Content is required.' });
	}

	// Abbreviation is required for enabled snippets
	if (s.enabled !== false && !String(s.abbreviation || '').trim()) {
		errors.push({ field: 'abbreviation', message: 'Abbreviation is required for enabled snippets.' });
	}

	// Abbreviation must not contain spaces or control characters
	const abbr = String(s.abbreviation || '').trim();
	if (abbr && /\s/.test(abbr)) {
		errors.push({ field: 'abbreviation', message: 'Abbreviation must not contain spaces or control characters.' });
	}

	// Group ID should reference an existing group (if db is provided, check)
	if (!String(s.groupId || '').trim()) {
		errors.push({ field: 'groupId', message: 'A group must be selected.' });
	}

	return {
		valid: 0 === errors.length,
		errors
	};
}

module.exports = { validateSnippet };
