import type { RecordItem, TagItem, ThreadItem, DeskEdgeRow } from '../types';

type RevisionOfInput = Partial<RecordItem & TagItem & ThreadItem & DeskEdgeRow>;

export function revisionOf(item: RevisionOfInput): number {
  if (!item) return Number.NaN;

  const timestamps = [
    item.updated_at,
    item.state_updated_at,
    item.last_used_at,
    item.created_at,
  ];
  let best = Number.NaN;
  for (const timestamp of timestamps) {
    if (typeof timestamp !== 'string') continue;
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed) && (Number.isNaN(best) || parsed > best)) {
      best = parsed;
    }
  }
  return best;
}
