import { describe, expect, it } from 'vitest';
import dbUtils from '../src/main/db-utils.js';

const { makeId, chunkIds } = dbUtils;

describe('database utilities', () => {
	it('creates collision-resistant IDs', () => {
		const first = makeId('snippet');
		const second = makeId('snippet');
		expect(first).not.toBe(second);
		expect(first).toMatch(/^snippet_[0-9a-f-]{36}$/);
	});

	it('batches large libraries below the SQLite variable limit', () => {
		const ids = Array.from({ length: 1005 }, (_, index) => `snippet_${index}`);
		const batches = chunkIds(ids);
		expect(batches.map((batch) => batch.length)).toEqual([900, 105]);
		expect(batches.flat()).toEqual(ids);
	});
});
