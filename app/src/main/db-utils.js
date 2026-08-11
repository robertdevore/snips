const { randomUUID } = require('crypto');

function makeId(prefix) {
	return `${prefix}_${randomUUID()}`;
}

function chunkIds(ids, size = 900) {
	const chunks = [];
	for (let offset = 0; offset < ids.length; offset += size) chunks.push(ids.slice(offset, offset + size));
	return chunks;
}

module.exports = { makeId, chunkIds };
