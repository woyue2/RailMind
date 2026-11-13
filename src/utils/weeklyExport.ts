import type { RecordItem, TagItem, ThreadItem } from '../types';
import { appDateKey, appStartOfDay, APP_TIME_ZONE } from './dateUtils';

export type TextRecord = Omit<RecordItem, 'imgs' | 'audio'>;

export interface WeeklyExport {
  schema_version: 1;
  exported_at: string;
  range: { start: string; end: string; timezone: string };
  records: TextRecord[];
  context_records: TextRecord[];
  tags: TagItem[];
  threads: ThreadItem[];
  unresolved_record_ids: string[];
}

function localDate(date: Date): string {
  return appDateKey(date);
}

function textOnly(record: RecordItem): TextRecord {
  const { imgs, audio, ...text } = record;
  return text;
}

function chronological(a: RecordItem, b: RecordItem): number {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0)
    || a.id.localeCompare(b.id);
}

export function buildWeeklyExport(
  records: RecordItem[], tags: TagItem[], threads: ThreadItem[], now = new Date(),
  scope: 'week' | 'all' = 'week',
): { data: WeeklyExport; filename: string } {
  const start = new Date(appStartOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
  const byId = new Map(records.map((record) => [record.id, record]));
  const weekly = [...byId.values()].filter((record) => {
    if (scope === 'all') return true;
    const time = Date.parse(record.created_at);
    return time >= start.getTime() && time <= now.getTime();
  }).sort(chronological);
  if (scope === 'all') {
    const earliest = weekly.find((record) => Number.isFinite(Date.parse(record.created_at)));
    start.setTime(earliest ? Date.parse(earliest.created_at) : now.getTime());
  }
  const seen = new Set(weekly.map((record) => record.id));
  const unresolved = new Set<string>();
  const context: RecordItem[] = [];
  const pending = [...weekly];
  for (let index = 0; index < pending.length; index++) {
    const record = pending[index];
    for (const id of [record.parent_id, record.quote_id]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const linked = byId.get(id);
      if (!linked) {
        unresolved.add(id);
        continue;
      }
      context.push(linked);
      pending.push(linked);
    }
  }
  const tagIds = new Set(pending.map((record) => record.tag_id));
  const threadIds = new Set(pending.map((record) => record.thread_id));
  return {
    filename: scope === 'all' ? `RailMind_all_${localDate(now)}.json` : `RailMind_${localDate(start)}_${localDate(now)}.json`,
    data: {
      schema_version: 1,
      exported_at: now.toISOString(),
      range: { start: start.toISOString(), end: now.toISOString(), timezone: APP_TIME_ZONE },
      records: weekly.map(textOnly),
      context_records: context.sort(chronological).map(textOnly),
      tags: scope === 'all' ? [...tags] : tags.filter((tag) => tagIds.has(tag.id)),
      threads: scope === 'all' ? [...threads] : threads.filter((thread) => threadIds.has(thread.id)),
      unresolved_record_ids: [...unresolved].sort(),
    },
  };
}
