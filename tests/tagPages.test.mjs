import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/tagPages.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { buildDateTagSections, tagSectionKeyOf, UNTAGGED_SECTION_KEY } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const node = (id, extras = {}) => ({
  id,
  text: id,
  tag_id: null,
  parent_id: null,
  created_at: '2026-10-10T10:00:00.000Z',
  updated_at: '2026-10-10T10:00:00.000Z',
  parentRecord: undefined,
  quotedRecord: undefined,
  downstreamQuotes: [],
  ...extras,
});
const tag = (id, name, color = null) => ({ id, name, color });
const dateKeyOf = (record) => record.created_at.slice(0, 10);
const build = (dayRecords, tags, allRecords = dayRecords) =>
  buildDateTagSections(
    dayRecords,
    new Map(allRecords.map((item) => [item.id, item])),
    tags,
    dayRecords[0]?.created_at.slice(0, 10) ?? '2026-10-10',
    dateKeyOf
  );
const summary = (sections) =>
  sections.map((section) => [section.tagKey, section.count, section.roots.map((item) => item.id)]);

test('one date page splits into tag sections, A-Z, only tags with records, untagged last', () => {
  const sections = build(
    [
      node('apple-1', { tag_id: 't-apple' }),
      node('banana-1', { tag_id: 't-banana' }),
      node('loose'),
    ],
    [tag('t-banana', '香蕉'), tag('t-apple', '苹果', '#f00'), tag('t-empty', 'Zeta')]
  );
  assert.deepEqual(summary(sections), [
    ['tag:t-apple', 1, ['apple-1']],
    ['tag:t-banana', 1, ['banana-1']],
    [UNTAGGED_SECTION_KEY, 1, ['loose']],
  ]);
  assert.deepEqual(
    sections.map((section) => section.tagLabel),
    ['苹果', '香蕉', '未打標籤']
  );
});

test('untagged section is omitted when the day has no untagged records', () => {
  const sections = build([node('a', { tag_id: 'a' })], [tag('a', 'A')]);
  assert.deepEqual(summary(sections), [['tag:a', 1, ['a']]]);
  assert.equal(sections.some((section) => section.isUntagged), false);
});

test('children nest only when they share the tag within the same day', () => {
  const parent = node('parent', { tag_id: 'a', created_at: '2026-10-10T00:00:00.000Z' });
  const sameSection = node('same', {
    tag_id: 'a',
    parent_id: 'parent',
    created_at: '2026-10-10T06:00:00.000Z',
  });
  const otherTag = node('other-tag', {
    tag_id: 'b',
    parent_id: 'parent',
    created_at: '2026-10-10T07:00:00.000Z',
  });
  const sections = build(
    [parent, sameSection, otherTag],
    [tag('a', 'A'), tag('b', 'B')],
    [parent, sameSection, otherTag]
  );
  assert.deepEqual(summary(sections), [
    ['tag:a', 2, ['parent']],
    ['tag:b', 1, ['other-tag']],
  ]);
});

test('a child whose parent lives on another day becomes a root here', () => {
  const parent = node('parent', { tag_id: 'a', created_at: '2026-10-09T00:00:00.000Z' });
  const child = node('child', {
    tag_id: 'a',
    parent_id: 'parent',
    created_at: '2026-10-10T06:00:00.000Z',
  });
  const sections = build([child], [tag('a', 'A')], [parent, child]);
  assert.deepEqual(summary(sections), [['tag:a', 1, ['child']]]);
});

test('deleted or missing tag_id falls back to the untagged section', () => {
  const sections = build(
    [node('a', { tag_id: 'gone' }), node('b', { tag_id: null })],
    [tag('kept', 'Kept')]
  );
  assert.deepEqual(summary(sections), [[UNTAGGED_SECTION_KEY, 2, ['a', 'b']]]);
});

test('returns no sections for a day without records', () => {
  assert.deepEqual(build([], [tag('a', 'A')]), []);
  assert.equal(tagSectionKeyOf({ tag_id: 'x' }, new Set(['x'])), 'tag:x');
  assert.equal(tagSectionKeyOf({ tag_id: 'x' }, new Set()), UNTAGGED_SECTION_KEY);
});
