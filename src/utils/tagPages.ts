import type { RecordTreeNode, TagItem } from '../types';

export const UNTAGGED_SECTION_KEY = 'untagged';

export interface TagDayGroup {
  dateKey: string;
  count: number;
  roots: RecordTreeNode[];
}

/**
 * 一個標籤一節；同一頁內縱向列出所有標籤（A-Z，未打標籤最後），
 * 標籤內再按日期分組。頂部 chips 作為錨點滾動跳轉。
 */
export interface TagSection {
  tagKey: string;
  tagLabel: string;
  color: string | null;
  isUntagged: boolean;
  count: number;
  days: TagDayGroup[];
}

/** 記錄歸屬的標籤節；標籤已刪除時視同未打標籤。 */
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
 * 標籤按名稱 A-Z（中文用拼音）排序、未打標籤最後；
 * 沒有記錄的標籤也保留一節（沒有日期小節），避免使用者以為標籤消失。
 */
export function buildTagSections(
  nodes: Map<string, RecordTreeNode>,
  tags: TagItem[],
  dateKeyOf: (record: { created_at: string }) => string
): TagSection[] {
  if (!tags.length && nodes.size === 0) return [];

  const sortedTags = [...tags].sort(
    (a, b) => a.name.localeCompare(b.name, 'zh-Hans') || a.id.localeCompare(b.id)
  );
  const validTagIds = new Set(sortedTags.map((tag) => tag.id));
  const sectionKeyFor = (record: { tag_id: string | null }) =>
    tagSectionKeyOf(record, validTagIds);

  const recordsBySection = new Map<string, RecordTreeNode[]>();
  for (const node of nodes.values()) {
    const key = sectionKeyFor(node);
    const list = recordsBySection.get(key);
    if (list) list.push(node);
    else recordsBySection.set(key, [node]);
  }

  const makeSection = (
    tagKey: string,
    tagLabel: string,
    color: string | null,
    isUntagged: boolean
  ): TagSection => {
    const sectionRecords = recordsBySection.get(tagKey) ?? [];
    const byDate = new Map<string, RecordTreeNode[]>();
    for (const record of sectionRecords) {
      const dateKey = dateKeyOf(record);
      const list = byDate.get(dateKey);
      if (list) list.push(record);
      else byDate.set(dateKey, [record]);
    }

    return {
      tagKey,
      tagLabel,
      color,
      isUntagged,
      count: sectionRecords.length,
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, dateRecords]) => ({
          dateKey,
          count: dateRecords.length,
          roots: dateRecords
            .filter((node) => {
              const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
              if (!parent) return true;
              return sectionKeyFor(parent) !== tagKey || dateKeyOf(parent) !== dateKey;
            })
            .sort(byCreatedAt),
        })),
    };
  };

  const sections = sortedTags.map((tag) =>
    makeSection(`tag:${tag.id}`, tag.name, tag.color ?? null, false)
  );
  const untaggedRecords = recordsBySection.get(UNTAGGED_SECTION_KEY) ?? [];
  if (untaggedRecords.length > 0) {
    sections.push(makeSection(UNTAGGED_SECTION_KEY, '未打標籤', null, true));
  }
  return sections;
}
