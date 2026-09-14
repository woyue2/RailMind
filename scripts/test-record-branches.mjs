import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/recordBranches.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm' });
const { buildRecordBranches } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const record = (id, date, parent_id = null) => ({ id, text: id, created_at: `${date}T12:00:00`,
  parent_id, tag_id: null, thread_id: null });
const input = [record('c', '2026-09-09', 'b'), record('b', '2026-09-08', 'a'),
  record('same', '2026-09-05', 'a'), record('a', '2026-09-05'),
  record('orphan', '2026-09-08', 'deleted')];
const original = JSON.stringify(input);
const tree = buildRecordBranches(input, [], []);
assert.equal(JSON.stringify(input), original, 'display construction must not mutate records');
assert.deepEqual(tree.nodes.get('a').children.map(x => x.id), ['same', 'b']);
assert.deepEqual(tree.nodes.get('b').children.map(x => x.id), ['c']);
assert.equal(tree.days.get('2026-09-05').length, 2);
assert.equal(tree.days.get('2026-09-08').length, 2);
assert.equal(tree.days.get('2026-09-09').length, 1);
for (const dayRecords of tree.days.values()) {
  const dayIds = new Set(dayRecords.map(x => x.id));
  const roots = dayRecords.filter(x => !dayIds.has(tree.parents.get(x.id)));
  assert(roots.length > 0);
}
assert(!tree.parents.has('orphan'));
const cycle = buildRecordBranches([record('a', '2026-09-05', 'b'),
  record('b', '2026-09-05', 'a'), record('self', '2026-09-05', 'self')], [], []);
for (const node of cycle.nodes.values()) {
  const seen = new Set();
  let current = node.id;
  while (current) {
    assert(!seen.has(current), 'cycles must be cut');
    seen.add(current);
    current = cycle.parents.get(current);
  }
}
const changed = buildRecordBranches(input.map(x => x.id === 'b' ? { ...x, text: 'edited' } : x), [], []);
assert.equal(changed.nodes.get('a').children[1], changed.days.get('2026-09-08')[0]);
assert.equal(changed.nodes.get('a').children[1].text, 'edited');
const deleted = buildRecordBranches(input.filter(x => x.id !== 'b'), [], []);
assert.deepEqual(deleted.nodes.get('a').children.map(x => x.id), ['same']);
assert(deleted.nodes.has('c'));
assert(!deleted.parents.has('c'));
const offsets = buildRecordBranches([
  { ...record('later', '2026-09-08', 'root'), created_at: '2026-09-08T09:00:00Z' },
  { ...record('earlier', '2026-09-08', 'root'), created_at: '2026-09-08T12:00:00+09:00' },
  record('root', '2026-09-05'),
  { ...record('invalid', '2026-09-08'), created_at: 'invalid' },
], [], []);
assert.deepEqual(offsets.nodes.get('root').children.map(x => x.id), ['earlier', 'later']);
assert(!offsets.nodes.has('invalid'));
console.log('PASS: same-day, cross-day, chained branches, counts, shared edits, deletion, missing sources and cycles');
