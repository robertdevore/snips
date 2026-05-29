import { describe, it, expect } from 'vitest';
import { parseCsv, decodeEntities, htmlToText, convertTextExpanderTokens } from '../src/main/import-csv.js';

describe('import-csv', () => {
	describe('parseCsv', () => {
		it('parses simple CSV', () => {
			const result = parseCsv('abbr,content\n;hello,Hello world');
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result[0][0]).toBe('abbr');
		});
		it('handles quoted fields with commas', () => {
			const result = parseCsv('";a","Hello, world"');
			expect(result[0][1]).toBe('Hello, world');
		});
		it('handles BOM header', () => {
			const result = parseCsv('\uFEFFabbr,content\n;t,Test');
			expect(result[0][0]).toBe('abbr');
		});
	});

	describe('decodeEntities', () => {
		it('decodes HTML entities', () => {
			expect(decodeEntities('&amp; &lt; &gt;')).toBe('& < >');
		});
		it('decodes &nbsp;', () => {
			expect(decodeEntities('hello&nbsp;world')).toBe('hello world');
		});
	});

	describe('htmlToText', () => {
		it('strips HTML tags', () => {
			expect(htmlToText('<p>Hello</p>')).toBe('Hello');
		});
		it('converts <br> to newlines', () => {
			expect(htmlToText('Line1<br>Line2')).toBe('Line1\nLine2');
		});
	});

	describe('convertTextExpanderTokens', () => {
		it('converts %| to [[cursor]]', () => {
			expect(convertTextExpanderTokens('text%|')).toBe('text[[cursor]]');
		});
		it('converts %filltext:name=Label%', () => {
			expect(convertTextExpanderTokens('%filltext:name=Name%')).toBe('[[fill:Name|]]');
		});
	});
});
