const common = ['json', 'pretty', 'quiet', 'help'];
const write = ['dry-run', 'confirm', 'if-revision', 'idempotency-key'];
const content = ['name', 'abbr', 'content', 'content-stdin', 'content-file', 'stdin-json', 'group', 'tags'];
const read = ['trash', 'fields', 'include-content', 'limit', 'offset', 'count', 'ids-only', 'group', 'tag', 'favorite'];
const schema = {
	list: read,
	search: read,
	get: ['fields'],
	create: ['dry-run', 'confirm', 'idempotency-key', ...content],
	update: [...write, ...content],
	batch: ['dry-run', 'confirm', 'idempotency-key', 'stdin-json', 'stdin-jsonl'],
	trash: write,
	restore: write,
	purge: ['dry-run', 'confirm', 'if-revision'],
	history: ['history-id'],
	revert: [...write, 'history-id'],
	export: ['out', 'confirm'],
	import: ['dry-run', 'confirm', 'in'],
	health: [],
	show: [],
	doctor: [],
	capabilities: [],
	schema: [],
	groups: [],
	strata: ['strata-url', 'dry-run', 'confirm']
};
const values = new Set([
	'name',
	'abbr',
	'content',
	'content-file',
	'group',
	'tags',
	'fields',
	'limit',
	'offset',
	'tag',
	'if-revision',
	'idempotency-key',
	'history-id',
	'out',
	'in',
	'strata-url'
]);
function parse(argv) {
	const flags = Object.create(null),
		pos = [];
	const fail = (message) => {
		throw Object.assign(new Error(message), { code: 'USAGE_ERROR' });
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') {
			pos.push(...argv.slice(i + 1));
			break;
		}
		if (!a.startsWith('-')) {
			pos.push(a);
			continue;
		}
		const name = a === '-h' ? 'help' : a === '-j' ? 'json' : a.startsWith('--') ? a.slice(2) : '';
		if (!name || ![...common, ...Object.values(schema).flat()].includes(name)) fail('Unknown flag: ' + a);
		if (Object.hasOwn(flags, name)) fail('Duplicate flag: ' + a);
		if (values.has(name)) {
			if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail('Missing value: ' + a);
			flags[name] = argv[++i];
		} else flags[name] = true;
	}
	const command = pos[0] || 'help';
	if (command !== 'help' && !schema[command]) fail('Unknown command: ' + command);
	for (const flag of Object.keys(flags))
		if (![...common, ...(schema[command] || [])].includes(flag))
			fail('Flag not supported by ' + command + ': --' + flag);
	if (flags['dry-run'] && flags.confirm) fail('--dry-run and --confirm are mutually exclusive');
	if (['content', 'content-stdin', 'content-file', 'stdin-json'].filter((f) => flags[f] !== undefined).length > 1)
		fail('Choose one content input mode');
	if (flags['stdin-jsonl'] && flags['stdin-json']) fail('Choose one structured input mode');
	const arity = { search: 2, get: 2, update: 2, trash: 2, restore: 2, purge: 2, history: 2, revert: 2 };
	if (command !== 'strata' && pos.length > (arity[command] || 1)) fail('Unexpected positional argument');
	for (const flag of ['limit', 'offset', 'if-revision', 'history-id'])
		if (flags[flag] !== undefined && (!/^\d+$/.test(flags[flag]) || !Number.isSafeInteger(Number(flags[flag]))))
			fail('Invalid number: --' + flag);
	return { flags, pos, command };
}
module.exports = { parse, schema };
