// Record 数据模型
export interface RecordItem {
  id: string;
  text: string;
  created_at: string; // ISO 8601 string
  parent_id: string | null; // 结构分支关系 (父记录 ID)
  tag_id: string | null; // 事后手动打的标签 ID, 可选
  thread_id: string | null; // 手动关联的思维线 ID, 可选
  quote_id?: string | null; // 引用的历史记录 ID, 可选
  quote_color?: string | null; // 引用/分支源记录的专属色, 首次被引用时从色库随机分配
}

// Tag 标签数据模型
export interface TagItem {
  id: string;
  name: string;
  color: string; // hex color (例如 '#F87171')
}

// Thread 思维线数据模型
export interface ThreadItem {
  id: string;
  title: string; // 例如 "演唱会", "学日语", "要不要辞职"
  created_at: string; // ISO 8601 string
  last_used_at: string; // 用于"最近使用"排序, 每次有新记录关联时更新
}

export interface HomeLink {
  shownName: string;
  href: string;
  updatedAt: string;
}

// 包含关联解析的展示记录
export interface EnrichedRecordItem extends RecordItem {
  thread?: ThreadItem;
  tag?: TagItem;
  children?: EnrichedRecordItem[];
}

// 视图切换类型
export type ActiveTab = 'record' | 'review' | 'thread-detail' | 'widgets';
