import type { RecordViewMode } from '../types';

export const RECORD_VIEW_MODES: readonly RecordViewMode[] = [
  'timeline',
  'daily-pages',
  'tag-pages',
];

export function isRecordViewMode(value: unknown): value is RecordViewMode {
  return typeof value === 'string' && (RECORD_VIEW_MODES as readonly string[]).includes(value);
}
