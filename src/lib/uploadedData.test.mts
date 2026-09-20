import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUploadedFile } from './uploadedData.ts';

test('parses a TSV file with tab-separated rows', () => {
  const text = 'product\tregion\trevenue\nWidget\tWest\t1200\nGadget\tEast\t980\n';
  const result = parseUploadedFile('sales.tsv', text);
  assert.ok(result);
  assert.equal(result!.type, 'tsv');
  assert.deepEqual(result!.columns, ['product', 'region', 'revenue']);
  assert.deepEqual(result!.rows, [
    { product: 'Widget', region: 'West', revenue: '1200' },
    { product: 'Gadget', region: 'East', revenue: '980' },
  ]);
});

test('strips trailing \\r from Windows line endings', () => {
  const text = 'product\trevenue\r\nWidget\t1200\r\n';
  const result = parseUploadedFile('sales.tsv', text);
  assert.deepEqual(result!.columns, ['product', 'revenue']);
  assert.deepEqual(result!.rows, [{ product: 'Widget', revenue: '1200' }]);
});

test('parses a CSV file with comma-separated rows', () => {
  const text = 'name,age\nAlice,30\nBob,25\n';
  const result = parseUploadedFile('people.csv', text);
  assert.equal(result!.type, 'csv');
  assert.deepEqual(result!.rows, [
    { name: 'Alice', age: '30' },
    { name: 'Bob', age: '25' },
  ]);
});

test('parses a JSON array file', () => {
  const text = JSON.stringify([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  const result = parseUploadedFile('data.json', text);
  assert.equal(result!.type, 'json-array');
  assert.deepEqual(result!.columns, ['id', 'name']);
  assert.deepEqual(result!.rows, [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
});

test('parses a JSON object file as a single row', () => {
  const text = JSON.stringify({ theme: 'dark', count: 3 });
  const result = parseUploadedFile('config.json', text);
  assert.equal(result!.type, 'json-object');
  assert.deepEqual(result!.columns, ['theme', 'count']);
  assert.deepEqual(result!.rows, [{ theme: 'dark', count: 3 }]);
});

test('caps rows at maxRows', () => {
  const lines = ['n'];
  for (let i = 0; i < 100; i++) lines.push(String(i));
  const result = parseUploadedFile('big.csv', lines.join('\n'), 10);
  assert.equal(result!.rows.length, 10);
});

test('returns null for unsupported file types', () => {
  const result = parseUploadedFile('image.png', 'not text data');
  assert.equal(result, null);
});
