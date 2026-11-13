import { getLocalDateKey } from './dateUtils';

/** 目前頁面的界定方式：日期翻頁不傳，標籤翻頁傳 key + keyOf。 */
export interface RecordPageScope {
  key: string;
  keyOf: (record: { tag_id: string | null; created_at: string }) => string;
}

export function recordPageKey(
  scope: RecordPageScope | undefined,
  record: { tag_id: string | null; created_at: string }
): string {
  return scope ? scope.keyOf(record) : getLocalDateKey(record.created_at);
}

/**
 * 子記錄跨頁時回傳預覽路徑（以預覽卡渲染），同頁則回傳 undefined。
 * 一旦進入預覽（inherited 有值），更深層的後代也維持預覽，與日期翻頁原本的語義一致。
 */
export function childPreviewPath(
  scope: RecordPageScope | undefined,
  currentPageKey: string,
  parentId: string,
  inheritedPreviewPath: string | undefined,
  child: { id: string; tag_id: string | null; created_at: string }
): string | undefined {
  if (!inheritedPreviewPath && recordPageKey(scope, child) === currentPageKey) return undefined;
  return `${inheritedPreviewPath ?? `${currentPageKey}-${parentId}`}-${child.id}`;
}
