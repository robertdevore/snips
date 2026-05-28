import { describe, it, expect } from 'vitest';
import { extractFillFields, renderTemplate } from '../src/main/template-renderer.js';

describe('template-renderer', () => {
	describe('extractFillFields', () => {
		it('returns empty array for text with no fill fields', () => {
			expect(extractFillFields('Hello world')).toEqual([]);
		});
		it('extracts a single fill field with no default', () => {
			expect(extractFillFields('Hello [[fill:Name|]]')).toEqual([{ label: 'Name', defaultValue: '' }]);
		});
		it('extracts a fill field with default value', () => {
			expect(extractFillFields('[[fill:City|New York]]')).toEqual([{ label: 'City', defaultValue: 'New York' }]);
		});
		it('extracts multiple fill fields', () => {
			const result = extractFillFields('[[fill:Name|]] lives in [[fill:City|NYC]]');
			expect(result).toHaveLength(2);
		});
	});

	describe('renderTemplate', () => {
		it('returns template unchanged if no macros present', () => {
			expect(renderTemplate('plain text', {})).toBe('plain text');
		});
		it('replaces [[clipboard]] with clipboard context', () => {
			expect(renderTemplate('Clip: [[clipboard]]', { clipboard: 'copied text' })).toBe('Clip: copied text');
		});
		it('replaces [[clipboard]] with empty string if not provided', () => {
			expect(renderTemplate('[[clipboard]]', {})).toBe('');
		});
		it('replaces [[date:iso]] with ISO date', () => {
			const result = renderTemplate('Date: [[date:iso]]', {});
			expect(result).toMatch(/^Date: \d{4}-\d{2}-\d{2}T/);
		});
		it('replaces [[fill:Name|default]] with provided fill value', () => {
			expect(renderTemplate('Hello [[fill:Name|Guest]]', { fillValues: { Name: 'Alice' } })).toBe('Hello Alice');
		});
		it('uses default when fill value not provided', () => {
			expect(renderTemplate('Hello [[fill:Name|Guest]]', { fillValues: {} })).toBe('Hello Guest');
		});
		it('replaces multiple macros in one template', () => {
			const result = renderTemplate('[[fill:Name|User]] copied [[clipboard]]', { fillValues: { Name: 'Bob' }, clipboard: 'text123' });
			expect(result).toBe('Bob copied text123');
		});
	});
});
