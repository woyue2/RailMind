import type { EnrichedRecordItem, RecordItem, TagItem, ThreadItem } from '../types';
import { getLocalDateKey } from './dateUtils';

/** Shared display nodes only: persisted records remain flat and unique. */
export function buildRecordBranches(records: RecordItem[], tags: TagItem[], threads: ThreadItem[]) {
  const nodes = new Map<string, EnrichedRecordItem>();
  const days = new Map<string, EnrichedRecordItem[]>();
  const parents = new Map<string, string>();
  const tagLookup = new Map(tags.map((tag) => [tag.id, tag]));
  const threadLookup = new Map(threads.map((thread) => [thread.id, thread]));
  const ordered = [...records].sort((a, b) =>
    (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || a.id.localeCompare(b.id));
  for (const record of ordered) {
    const day = getLocalDateKey(record.created_at);
    if (!day) continue;
    const node = { ...record, tag: tagLookup.get(record.tag_id ?? ''),
      thread: threadLookup.get(record.thread_id ?? ''), children: [] };
    nodes.set(record.id, node);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(node);
  }
  for (const node of nodes.values()) {
    if (!node.parent_id || !nodes.has(node.parent_id)) continue;
    let ancestor: string | undefined = node.parent_id;
    while (ancestor && ancestor !== node.id) ancestor = parents.get(ancestor);
    if (ancestor === node.id) continue;
    parents.set(node.id, node.parent_id);
    nodes.get(node.parent_id)!.children!.push(node);
  }
  return { days, nodes, parents };
}
