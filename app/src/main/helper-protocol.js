const { timingSafeEqual } = require('crypto');
const PROTOCOL_VERSION = 1,
	MAX_EVENT_BYTES = 262144,
	MAX_COMMAND_BYTES = 16777216;
function authorized(actual, expected) {
	return (
		typeof actual === 'string' &&
		typeof expected === 'string' &&
		Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
		timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
	);
}
const string = (v, max = 256) => typeof v === 'string' && v.length <= max;
const number = (v) => Number.isSafeInteger(v) && v >= 0;
function validEvent(e) {
	if (
		!e ||
		e.protocolVersion !== PROTOCOL_VERSION ||
		!string(e.requestId) ||
		!e.payload ||
		typeof e.payload !== 'object' ||
		Array.isArray(e.payload)
	)
		return false;
	const p = e.payload;
	if (e.type === 'expansion_event')
		return (
			['id', 'snippetId'].every((k) => string(p[k]) && p[k].length > 0) &&
			['timestamp', 'charsInserted', 'charsSaved', 'timeSavedMs'].every((k) => number(p[k])) &&
			string(p.appBundleId)
		);
	if (e.type === 'status')
		return (
			Object.keys(p).every((k) =>
				[
					'secureInput',
					'accessibilityEnabled',
					'listenEventAccess',
					'postEventAccess',
					'eventTapActive',
					'helperExecutable',
					'helperVersion'
				].includes(k)
			) &&
			['secureInput', 'accessibilityEnabled', 'listenEventAccess', 'postEventAccess', 'eventTapActive'].every(
				(k) => typeof p[k] === 'boolean'
			) &&
			string(p.helperExecutable, 4096)
		);
	if (e.type === 'fill_request')
		return (
			string(p.requestId) &&
			Array.isArray(p.fields) &&
			p.fields.length <= 50 &&
			p.fields.every((f) => string(f.label) && string(f.defaultValue, 10000)) &&
			string(p.frontmostBundleId)
		);
	return false;
}
module.exports = { authorized, validEvent, PROTOCOL_VERSION, MAX_EVENT_BYTES, MAX_COMMAND_BYTES };
