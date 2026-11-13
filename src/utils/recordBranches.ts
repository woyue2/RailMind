import type { RecordTreeNode, RecordItem, TagItem, ThreadItem } from '../types';
import { getLocalDateKey } from './dateUtils';

/** Shared display nodes only: persisted records remain flat and unique. */
export function buildRecordBranches(records: RecordItem[], tags: TagItem[], threads: ThreadItem[]) {
  const nodes = new Map<string, RecordTreeNode>();
  const days = new Map<string, RecordTreeNode[]>();
  const parents = new Map<string, string>();
  const tagLookup = new Map(tags.map((tag) => [tag.id, tag]));
  const threadLookup = new Map(threads.map((thread) => [thread.id, thread]));
  const ordered = [...records].sort((a, b) =>
    (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || a.id.localeCompare(b.id));
  for (const record of ordered) {
    const day = getLocalDateKey(record.created_at);
    if (!day) continue;
    const node: RecordTreeNode = {
      ...record,
      tag: tagLookup.get(record.tag_id ?? ''),
      thread: threadLookup.get(record.thread_id ?? ''),
      children: [],
      parentRecord: undefined,
      quotedRecord: undefined,
      downstreamQuotes: [],
    };
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

  const quotesByTarget = new Map<string, RecordTreeNode[]>();
  for (const node of nodes.values()) {
    if (!node.quote_id) continue;
    const list = quotesByTarget.get(node.quote_id) ?? [];
    list.push(node);
    quotesByTarget.set(node.quote_id, list);
  }
  for (const node of nodes.values()) {
    node.parentRecord = node.parent_id ? nodes.get(node.parent_id) : undefined;
    node.quotedRecord = node.quote_id ? nodes.get(node.quote_id) : undefined;
    node.downstreamQuotes = quotesByTarget.get(node.id) ?? [];
  }

  // 葉節點不寫入 progress（只有分組會顯示進度），共用常數避免每次重建都配置物件。
  const LEAF_DONE = { total: 1, done: 1 };
  const LEAF_TODO = { total: 1, done: 0 };
  const computeProgress = (node: RecordTreeNode): { total: number; done: number } => {
    if (node.progress) return node.progress;
    if (!node.children || node.children.length === 0) {
      return node.is_completed ? LEAF_DONE : LEAF_TODO;
    }
    let total = 0;
    let done = 0;
    for (const child of node.children) {
      const childProgress = computeProgress(child);
      total += childProgress.total;
      done += childProgress.done;
    }
    node.progress = { total, done };
    return node.progress;
  };
  for (const node of nodes.values()) computeProgress(node);

  return { days, nodes, parents };
}
