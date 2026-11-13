import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/tagPages.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { buildTagSections, tagSectionKeyOf, UNTAGGED_SECTION_KEY } = await import(
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
const nodesOf = (...list) => new Map(list.map((item) => [item.id, item]));
const tag = (id, name, color = null) => ({ id, name, color });
// 測試用固定時區鍵：直接取 ISO 的日期部分，避免依賴執行環境時區。
const dateKeyOf = (record) => record.created_at.slice(0, 10);
const build = (nodes, tags) => buildTagSections(nodes, tags, dateKeyOf);
const daysOf = (section) =>
  section.days.map((day) => [day.dateKey, day.count, day.roots.map((item) => item.id)]);

test('one section per tag, A-Z with untagged last, all tags kept', () => {
  const sections = build(
    nodesOf(
      node('apple-1', { tag_id: 't-apple' }),
      node('banana-1', { tag_id: 't-banana' })
    ),
    [tag('t-banana', '香蕉'), tag('t-apple', '苹果', '#f00'), tag('t-empty', 'Zeta')]
  );
  assert.deepEqual(
    sections.map((section) => section.tagKey),
    ['tag:t-apple', 'tag:t-banana', 'tag:t-empty']
  );
  assert.deepEqual(
    sections.map((section) => section.tagLabel),
    ['苹果', '香蕉', 'Zeta']
  );
  assert.deepEqual(
    sections.map((section) => section.count),
    [1, 1, 0]
  );
  assert.deepEqual(sections[2].days, []);
  // 沒有任何未打標籤記錄時，未打標籤節不會出現。
  assert.equal(sections.some((section) => section.isUntagged), false);
});

test('Latin names sort A-Z case-insensitively; equal names tie-break by id', () => {
  const sections = build(nodesOf(), [tag('t3', 'banana'), tag('t2', 'Alpha'), tag('t1', 'Alpha')]);
  assert.deepEqual(
    sections.map((section) => section.tagKey),
    ['tag:t1', 'tag:t2', 'tag:t3']
  );
});

test('a tag with records on several days keeps one date group per day', () => {
  const sections = build(
    nodesOf(
      node('early', { tag_id: 'a', created_at: '2026-10-01T02:00:00.000Z' }),
      node('late', { tag_id: 'a', created_at: '2026-10-03T02:00:00.000Z' }),
      node('late-2', { tag_id: 'a', created_at: '2026-10-03T05:00:00.000Z' })
    ),
    [tag('a', 'A')]
  );
  assert.equal(sections.length, 1);
  assert.deepEqual(daysOf(sections[0]), [
    ['2026-10-01', 1, ['early']],
    ['2026-10-03', 2, ['late', 'late-2']],
  ]);
  assert.equal(sections[0].count, 3);
});

test('children only nest when they share the tag and the day', () => {
  const parent = node('parent', { tag_id: 'a', created_at: '2026-10-01T00:00:00.000Z' });
  const sameSection = node('same', {
    tag_id: 'a',
    parent_id: 'parent',
    created_at: '2026-10-01T06:00:00.000Z',
  });
  const otherDay = node('other-day', {
    tag_id: 'a',
    parent_id: 'parent',
    created_at: '2026-10-02T06:00:00.000Z',
  });
  const otherTag = node('other-tag', {
    tag_id: 'b',
    parent_id: 'parent',
    created_at: '2026-10-02T07:00:00.000Z',
  });
  const [sectionA, sectionB] = build(nodesOf(parent, sameSection, otherDay, otherTag), [
    tag('a', 'A'),
    tag('b', 'B'),
  ]);
  assert.deepEqual(daysOf(sectionA), [
    ['2026-10-01', 2, ['parent']],
    ['2026-10-02', 1, ['other-day']],
  ]);
  assert.deepEqual(daysOf(sectionB), [['2026-10-02', 1, ['other-tag']]]);
});

test('deleted or missing tag_id falls back to the untagged section', () => {
  const sections = build(
    nodesOf(node('a', { tag_id: 'gone' }), node('b', { tag_id: null })),
    [tag('kept', 'Kept')]
  );
  const untagged = sections.at(-1);
  assert.equal(untagged.tagKey, UNTAGGED_SECTION_KEY);
  assert.equal(untagged.isUntagged, true);
  assert.equal(untagged.count, 2);
  assert.deepEqual(daysOf(untagged), [['2026-10-10', 2, ['a', 'b']]]);
});

test('returns no sections when there are neither tags nor records', () => {
  assert.deepEqual(build(new Map(), []), []);
  assert.equal(tagSectionKeyOf({ tag_id: 'x' }, new Set(['x'])), 'tag:x');
  assert.equal(tagSectionKeyOf({ tag_id: 'x' }, new Set()), UNTAGGED_SECTION_KEY);
});
