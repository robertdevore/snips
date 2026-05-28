/**
 * CSV import parsing utilities for Snips.
 *
 * Handles CSV parsing, HTML-to-text conversion, HTML entity decoding,
 * and TextExpander token conversion.
 */

/**
 * Parses CSV text into a 2D array of strings.
 * Handles quoted fields, embedded commas, newlines in quoted fields, and BOM.
 * @param {string} text - Raw CSV text
 * @returns {string[][]}
 */
function parseCsv(text) {
	const out = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	if (0 === text.indexOf('\uFEFF')) text = text.slice(1);
	for (; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if ('"' === ch) {
				if ('"' === text[i + 1]) {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if ('"' === ch) {
			inQuotes = true;
			continue;
		}
		if (',' === ch) {
			row.push(field);
			field = '';
			continue;
		}
		if ('\n' === ch) {
			row.push(field);
			field = '';
			if (row.some((v) => String(v || '').trim())) out.push(row);
			row = [];
			continue;
		}
		if ('\r' === ch) {
			if ('\n' === text[i + 1]) i++;
			row.push(field);
			field = '';
			if (row.some((v) => String(v || '').trim())) out.push(row);
			row = [];
			continue;
		}
		field += ch;
	}
	row.push(field);
	if (row.some((v) => String(v || '').trim())) out.push(row);
	return out;
}

/**
 * Decodes common HTML entities in a string.
 * @param {string} input
 * @returns {string}
 */
function decodeEntities(input) {
	return String(input || '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

/**
 * Converts HTML content to plain text.
 * Strips tags, decodes entities, normalizes whitespace.
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
	let s = String(html || '');
	s = s.replace(/<br\s*\/?>/gi, '\n');
	s = s.replace(/<\/(p|div|li)>/gi, '\n');
	s = s.replace(/<[^>]+>/g, '');
	s = decodeEntities(s);
	s = s.replace(/\r\n/g, '\n');
	s = s.replace(/\n{3,}/g, '\n\n');
	return s.trim();
}

/**
 * Converts TextExpander-specific tokens to Snips macro format.
 * %| → [[cursor]]
 * %filltext:name=Label% → [[fill:Label|]]
 * @param {string} text
 * @returns {string}
 */
function convertTextExpanderTokens(text) {
	let s = String(text || '');
	s = s.replace(/%\|/g, '[[cursor]]');
	s = s.replace(/%filltext:name=([^:%]+)(?::[^%]*)?%/g, (_m, label) => {
		const safe = String(label || '').trim();
		return safe ? `[[fill:${safe}|]]` : '[[fill:Value|]]';
	});
	return s;
}

/**
 * Imports CSV text into the database as snippets under a group.
 * @param {object} db - SnipsDb instance
 * @param {object} payload - { groupName, csvText }
 * @param {Function} syncHelperConfig - async function to sync helper after import
 * @returns {Promise<object>} Import result
 */
async function importCsv(db, payload, syncHelperConfig) {
	const groupName = (payload && payload.groupName ? String(payload.groupName) : '').trim() || 'Imported';
	const csvText = payload && payload.csvText ? String(payload.csvText) : '';
	if (!csvText.trim()) {
		return { ok: false, message: 'CSV file was empty.' };
	}

	let rows = parseCsv(csvText);
	if (!rows.length) {
		return { ok: false, message: 'No rows found in CSV.' };
	}
	const first = rows[0].map((v) =>
		String(v || '')
			.trim()
			.toLowerCase()
	);
	if (first[0] === 'abbreviation' && (first[1] === 'snippet' || first[1] === 'content')) {
		rows = rows.slice(1);
	}

	let group = db.getGroupByName(groupName);
	if (!group) {
		group = db.saveGroup({ name: groupName });
	}

	let created = 0;
	let updated = 0;
	let skipped = 0;
	for (const row of rows) {
		const abbr = (row[0] ? String(row[0]) : '').trim();
		const raw = row[1] ? String(row[1]) : '';
		const label = row[2] ? String(row[2]).trim() : '';
		if (!abbr || !raw) {
			skipped++;
			continue;
		}
		let content = htmlToText(raw);
		content = convertTextExpanderTokens(content);
		const name = label || abbr;
		const existing = db.getSnippetByAbbreviation(abbr);
		const saved = db.saveSnippet({
			id: existing ? existing.id : null,
			groupId: group.id,
			name,
			abbreviation: abbr,
			content,
			enabled: true,
			favorite: false,
			notes: ''
		});
		if (existing) updated++;
		else if (saved) created++;
	}

	await syncHelperConfig();
	return { ok: true, groupId: group.id, groupName: group.name, created, updated, skipped };
}

module.exports = { parseCsv, decodeEntities, htmlToText, convertTextExpanderTokens, importCsv };
