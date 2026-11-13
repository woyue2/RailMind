import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = (source) =>
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = (outputText) =>
  import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

globalThis.__railMindDateUtils = await load(
  transpile(readFileSync(new URL('../src/utils/dateUtils.ts', import.meta.url), 'utf8'))
);
const pageSource = readFileSync(new URL('../src/utils/recordPage.ts', import.meta.url), 'utf8')
  .replace(
    /import\s*\{\s*getLocalDateKey\s*\}\s*from\s*['"]\.\/dateUtils['"];?/,
    'const { getLocalDateKey } = globalThis.__railMindDateUtils;'
  );
const { childPreviewPath, recordPageKey } = await load(transpile(pageSource));

const tagScope = { key: 'tag:a', keyOf: (record) => (record.tag_id ? `tag:${record.tag_id}` : 'untagged') };
const child = (id, tag_id, created_at = '2026-01-01T10:00:00.000Z') => ({ id, tag_id, created_at });

test('tag scope only previews children that belong to another tag page', () => {
  assert.equal(childPreviewPath(tagScope, 'tag:a', 'parent', undefined, child('c1', 'a')), undefined);
  assert.equal(
    childPreviewPath(tagScope, 'tag:a', 'parent', undefined, child('c2', 'b')),
    'tag:a-parent-c2'
  );
  assert.equal(childPreviewPath(tagScope, 'tag:a', 'parent', undefined, child('c3', null)), 'tag:a-parent-c3');
});

test('once inside a preview, deeper descendants stay previews', () => {
  assert.equal(childPreviewPath(tagScope, 'tag:a', 'parent', 'existing', child('c4', 'a')), 'existing-c4');
});

test('date pages keep the original per-day preview behaviour', () => {
  const sameDay = child('c5', null, '2026-01-01T02:00:00.000Z');
  const nextDay = child('c6', null, '2026-01-02T02:00:00.000Z');
  assert.equal(childPreviewPath(undefined, '2026-01-01', 'parent', undefined, sameDay), undefined);
  assert.equal(
    childPreviewPath(undefined, '2026-01-01', 'parent', undefined, nextDay),
    '2026-01-01-parent-c6'
  );
  assert.equal(recordPageKey(undefined, sameDay), '2026-01-01');
});
