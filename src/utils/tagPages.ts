import type { RecordTreeNode, TagItem } from '../types';

export const UNTAGGED_SECTION_KEY = 'untagged';

/** 某一天頁面內的一個標籤分節；只包含當天有記錄的標籤。 */
export interface TagDaySection {
  tagKey: string;
  tagLabel: string;
  color: string | null;
  isUntagged: boolean;
  count: number;
  roots: RecordTreeNode[];
}

/** 記錄歸屬的標籤分節；標籤已刪除時視同未打標籤。 */
export function tagSectionKeyOf(
  record: { tag_id: string | null },
  validTagIds: Set<string>
): string {
  return record.tag_id && validTagIds.has(record.tag_id)
    ? `tag:${record.tag_id}`
    : UNTAGGED_SECTION_KEY;
}

function byCreatedAt(a: RecordTreeNode, b: RecordTreeNode): number {
  return (
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
    a.id.localeCompare(b.id)
  );
}

/**
 * 把某一天的記錄按標籤分節：標籤按名稱 A-Z（中文拼音）、未打標籤最後；
 * 只保留當天有記錄的標籤。分節內的 roots 是「父記錄不在同標籤同一天」的節點，
 * 與日期翻頁的跨日預覽規則一致。
 */
export function buildDateTagSections(
  dayRecords: RecordTreeNode[],
  nodes: Map<string, RecordTreeNode>,
  tags: TagItem[],
  dateKey: string,
  dateKeyOf: (record: { created_at: string }) => string
): TagDaySection[] {
  if (!dayRecords.length) return [];

  const sortedTags = [...tags].sort(
    (a, b) => a.name.localeCompare(b.name, 'zh-Hans') || a.id.localeCompare(b.id)
  );
  const validTagIds = new Set(sortedTags.map((tag) => tag.id));
  const sectionKeyFor = (record: { tag_id: string | null }) =>
    tagSectionKeyOf(record, validTagIds);

  const recordsBySection = new Map<string, RecordTreeNode[]>();
  for (const record of dayRecords) {
    const key = sectionKeyFor(record);
    const list = recordsBySection.get(key);
    if (list) list.push(record);
    else recordsBySection.set(key, [record]);
  }

  const makeSection = (
    tagKey: string,
    tagLabel: string,
    color: string | null,
    isUntagged: boolean
  ): TagDaySection => {
    const sectionRecords = recordsBySection.get(tagKey) ?? [];
    return {
      tagKey,
      tagLabel,
      color,
      isUntagged,
      count: sectionRecords.length,
      roots: sectionRecords
        .filter((node) => {
          const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
          if (!parent) return true;
          return sectionKeyFor(parent) !== tagKey || dateKeyOf(parent) !== dateKey;
        })
        .sort(byCreatedAt),
    };
  };

  const sections = sortedTags
    .filter((tag) => (recordsBySection.get(`tag:${tag.id}`)?.length ?? 0) > 0)
    .map((tag) => makeSection(`tag:${tag.id}`, tag.name, tag.color ?? null, false));
  if ((recordsBySection.get(UNTAGGED_SECTION_KEY)?.length ?? 0) > 0) {
    sections.push(makeSection(UNTAGGED_SECTION_KEY, '未打標籤', null, true));
  }
  return sections;
}
