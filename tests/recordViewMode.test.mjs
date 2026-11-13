import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/recordViewMode.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { isRecordViewMode, RECORD_VIEW_MODES } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('accepts every supported view mode', () => {
  assert.deepEqual(RECORD_VIEW_MODES, ['timeline', 'daily-pages', 'tag-pages']);
  for (const mode of RECORD_VIEW_MODES) assert.equal(isRecordViewMode(mode), true);
});

test('rejects unknown persisted values so rehydrate falls back to timeline', () => {
  for (const value of ['widgets', 'grid', '', null, undefined, 0, {}, ['tag-pages']]) {
    assert.equal(isRecordViewMode(value), false);
  }
});
