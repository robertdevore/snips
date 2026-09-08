import { describe, it, expect } from 'vitest';
import uri from 'fast-uri';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import Ajv from 'ajv';
import plist from 'plist';

describe('packaging dependency security', () => {
	it('rejects malformed URI authorities and preserves encoded delimiters', () => {
		for (const value of [
			'http://evil.test\\@trusted.test/',
			'http:\\\\evil.test/',
			'http:/\\evil.test/',
			'http:/\t/evil.test/'
		]) {
			expect(uri.parse(value).error).toBeTruthy();
			expect(uri.normalize(value)).toBe(value);
			expect(() => uri.resolve('https://trusted.test/', value)).toThrow();
			expect(uri.equal(value, 'http://trusted.test/')).toBe(false);
		}
		for (const value of ['http://trusted.test%40evil.test/', 'http://trusted.test%2Fevil.test/']) {
			expect(uri.normalize(value)).toBe(value);
		}
		expect(uri.resolve('https://trusted.test/a/b', '../c')).toBe('https://trusted.test/c');
	});
	it('rejects invalid entity names, including mutation before strict serialization', () => {
		const doc = new DOMImplementation().createDocument(null, 'root', null);
		const serializer = new XMLSerializer();
		for (const name of ['x;<injected/>', 'x y', '1invalid']) {
			expect(() => doc.createEntityReference(name)).toThrow();
		}
		const ref = doc.createEntityReference('valid');
		doc.documentElement.appendChild(ref);
		expect(serializer.serializeToString(doc)).toBe('<root>&valid;</root>');
		ref.nodeName = 'x;<injected/>';
		expect(() => serializer.serializeToString(doc, false, null, { requireWellFormed: true })).toThrow();
	});
	it('preserves AJV references and plist Unicode/escaping round trips', () => {
		const ajv = new Ajv();
		ajv.addSchema({
			$id: 'https://example.test/schema',
			type: 'object',
			properties: { name: { type: 'string' } },
			required: ['name']
		});
		const validate = ajv.compile({ $ref: 'https://example.test/schema' });
		expect(validate({ name: 'Snips' })).toBe(true);
		expect(validate({ name: 42 })).toBe(false);
		const data = { CFBundleName: 'Snips', CFBundleIdentifier: 'com.snips.app', text: '<>& café 👋' };
		expect(plist.parse(plist.build(data))).toEqual(data);
	});
});
