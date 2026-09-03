import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/weeklyExport.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { buildWeeklyExport } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const record = (id, created_at, extras = {}) => ({ id, created_at, text: '文字\n"quoted" 🐈', parent_id: null, tag_id: null, thread_id: null, ...extras });

test('local calendar boundaries across month/year, excludes invalid and future dates', () => {
  for (const now of [new Date(2026, 0, 3, 12), new Date(2026, 8, 3, 12), new Date(2026, 2, 10, 12)]) {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const { data } = buildWeeklyExport([
      record('now', now.toISOString()), record('start', start.toISOString()),
      record('before', new Date(+start - 1).toISOString()),
      record('future', new Date(+now + 1).toISOString()), record('invalid', 'bad-date'),
    ], [], [], now);
    assert.deepEqual(data.records.map(r => r.id), ['start', 'now']);
    assert.equal(data.range.start, start.toISOString());
    assert.equal(data.range.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  assert.equal(buildWeeklyExport([], [], [], new Date(2026, 0, 3, 12)).filename, 'RailMind_2025-12-28_2026-01-03.json');
});

test('recursive graph closure, cycles, missing IDs, attachment removal and dictionaries', () => {
  const records = [
    record('a', '2026-09-02T00:00:00Z', { parent_id: 'parent', quote_id: 'old', tag_id: 'used', imgs: ['secret'], audio: { url: 'secret', duration: 1 }, is_completed: true }),
    record('b', '2026-09-03T00:00:00Z', { parent_id: 'parent', quote_id: 'missing' }),
    record('parent', '2026-07-02T00:00:00Z', { parent_id: 'ancestor', thread_id: 'used-thread' }),
    record('ancestor', '2026-07-01T00:00:00Z', { quote_id: 'a' }),
    record('old', '2026-08-01T00:00:00Z', { quote_id: 'missing', imgs: ['secret'] }),
    record('unrelated-child', '2026-08-02T00:00:00Z', { parent_id: 'parent' }),
  ];
  const tags = [{ id: 'used', name: '标签', color: '#fff' }, { id: 'unused' }];
  const threads = [{ id: 'used-thread', title: '思维线' }, { id: 'unused' }];
  const original = JSON.stringify(records);
  const { data } = buildWeeklyExport(records, tags, threads, new Date('2026-09-03T12:00:00Z'));
  assert.deepEqual(data.records.map(r => r.id), ['a', 'b']);
  assert.deepEqual(data.context_records.map(r => r.id), ['ancestor', 'parent', 'old']);
  assert.deepEqual(data.unresolved_record_ids, ['missing']);
  assert.deepEqual(data.tags, [tags[0]]);
  assert.deepEqual(data.threads, [threads[0]]);
  for (const item of [...data.records, ...data.context_records]) {
    assert.equal('imgs' in item, false);
    assert.equal('audio' in item, false);
  }
  assert.equal(data.records[0].is_completed, true);
  assert.equal(data.records[0].parent_id, 'parent');
  assert.equal(JSON.parse(JSON.stringify(data)).records[0].text, records[0].text);
  assert.equal(JSON.stringify(records), original);
});

test('empty week does not include unrelated historical context', () => {
  const { data } = buildWeeklyExport([record('old', '2020-01-01T00:00:00Z')], [], [], new Date('2026-09-03T12:00:00Z'));
  assert.deepEqual(data.records, []);
  assert.deepEqual(data.context_records, []);
});
