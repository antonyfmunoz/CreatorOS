import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureText, fitText } from './text-layout.mjs';

const base = { text: 'Creative motion', fontFamily: 'sans-serif' };
test('text helpers require their browser rather than inventing server font metrics', () => {
  assert.throws(() => measureText({ ...base, fontSize: 32 }), /composition browser/);
  assert.throws(() => fitText({ ...base, withinWidth: 480 }), /composition browser/);
});
test('text content, family and unknown properties are bounded before touching DOM', () => {
  for (const change of [{ text: null }, { text: 'x'.repeat(10001) }, { fontFamily: '' }, { fontFamily: ' ' }, { fontFamily: 'sans-serif, Arial' }, { fontFamily: 'font; src:url(https://example.invalid)' }, { network: true }]) {
    assert.throws(() => measureText({ ...base, fontSize: 32, ...change }), /options|required/);
  }
  for (const input of [null, [], 'text']) assert.throws(() => fitText(input), /options/);
});
test('typography rejects invalid weights, units, direction and nonfinite values', () => {
  for (const change of [{ fontWeight: 'bold' }, { fontWeight: 1001 }, { fontWeight: 0 }, { fontStyle: 'url' }, { letterSpacing: Infinity }, { letterSpacing: '3px' }, { lineHeight: .1 }, { lineHeight: NaN }, { direction: 'sideways' }]) {
    assert.throws(() => measureText({ ...base, fontSize: 32, ...change }), /typography/);
  }
});
test('measurement rejects unbounded or missing dimensions and incompatible fit settings', () => {
  for (const change of [{ fontSize: undefined }, { fontSize: 0 }, { fontSize: 2049 }, { fontSize: Infinity }, { width: 0 }, { width: 16385 }]) assert.throws(() => measureText({ ...base, fontSize: 32, ...change }), /bounds/);
  assert.throws(() => measureText({ ...base, fontSize: 32, maxLines: 2 }), /options/);
});
test('fitting bounds are ordered, finite and limited to twenty lines', () => {
  for (const change of [{ withinWidth: undefined }, { withinWidth: NaN }, { withinWidth: 0 }, { withinHeight: 0 }, { minFontSize: 0 }, { minFontSize: 64, maxFontSize: 32 }, { maxFontSize: 2049 }, { maxLines: 0 }, { maxLines: 21 }, { maxLines: 1.5 }]) assert.throws(() => fitText({ ...base, withinWidth: 480, ...change }), /bounds/);
  assert.throws(() => fitText({ ...base, withinWidth: 480, fontSize: 32 }), /options/);
});
