import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = (source) =>
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const load = (outputText) =>
  import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// weeklyExport 依赖 ./dateUtils；用 globalThis 桥接，避免 data: URL 无法解析相对导入。
globalThis.__railMindDateUtils = await load(
  transpile(readFileSync(new URL('../src/utils/dateUtils.ts', import.meta.url), 'utf8'))
);
const weeklySource = readFileSync(new URL('../src/utils/weeklyExport.ts', import.meta.url), 'utf8')
  .replace(
    /import\s*\{[^}]*\}\s*from\s*['"]\.\/dateUtils['"];?/,
    'const { appDateKey, appStartOfDay, APP_TIME_ZONE } = globalThis.__railMindDateUtils;'
  );
const { buildWeeklyExport } = await load(transpile(weeklySource));
const record = (id, created_at, extras = {}) => ({ id, created_at, text: '文字\n"quoted" 🐈', parent_id: null, tag_id: null, thread_id: null, ...extras });

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date) => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const windowStart = (now) =>
  new Date(Date.parse(`${dayKey(now)}T00:00:00+08:00`) - 6 * DAY_MS);

test('UTC+8 calendar boundaries across month/year, excludes invalid and future dates', () => {
  for (const now of [
    new Date('2026-01-03T12:00:00+08:00'),
    new Date('2026-09-03T12:00:00+08:00'),
    new Date('2026-03-10T12:00:00+08:00'),
  ]) {
    const start = windowStart(now);
    const { data } = buildWeeklyExport([
      record('now', now.toISOString()), record('start', start.toISOString()),
      record('before', new Date(+start - 1).toISOString()),
      record('future', new Date(+now + 1).toISOString()), record('invalid', 'bad-date'),
    ], [], [], now);
    assert.deepEqual(data.records.map(r => r.id), ['start', 'now']);
    assert.equal(data.range.start, start.toISOString());
    assert.equal(data.range.timezone, 'Asia/Shanghai');
  }
  assert.equal(
    buildWeeklyExport([], [], [], new Date('2026-01-03T12:00:00+08:00')).filename,
    'RailMind_2025-12-28_2026-01-03.json'
  );
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
