// Audio 录音/语音便签附件
export interface AudioAttachment {
  url: string; // Base64 audio data URL (audio/webm or audio/mp4)
  duration: number; // Duration in seconds (e.g. 15)
  format?: string; // 'audio/webm' | 'audio/mp4'
}

export type EisenhowerQuadrant =
  | 'important-urgent'
  | 'important-not-urgent'
  | 'not-important-urgent'
  | 'not-important-not-urgent';

export type ValueQuadrant =
  | 'action'
  | 'investment'
  | 'firefighting'
  | 'eliminate';

export interface ValuePriorityProfile {
  quadrant?: ValueQuadrant;
  is_routine: boolean;
  high_value?: boolean;
  high_delay_loss?: boolean;
  high_leverage?: boolean;
  unlocks_work?: boolean;
  is_container?: boolean;
  reason?: string;
}

// Record 数据模型
export interface RecordItem {
  id: string;
  text: string;
  created_at: string; // ISO 8601 创建时间（不可变）
  updated_at?: string; // ISO 8601 最近修改时间（兼容旧数据可缺省）
  parent_id: string | null; // 结构分支关系 (父记录 ID)
  tag_id: string | null; // 事后手动打的标签 ID, 可选
  thread_id: string | null; // 手动关联的思维线 ID, 可选
  quote_id?: string | null; // 引用的历史记录 ID, 可选
  quote_color?: string | null; // 引用/分支源记录的专属色, 首次被引用时从色库随机分配
  imgs?: string[]; // 附带的图片 Base64 数组 (最多 4 张)
  bg_color?: string | null; // 单条便签自定义背景色 (null/undefined 为默认无色)
  audio?: AudioAttachment | null; // 附带的语音录音便签
  is_pinned?: boolean; // 是否置顶为浮动气泡便签
  pinned_at?: string | null; // 置顶时间戳 (ISO 8601 string)
  is_completed?: boolean; // 是否已完成（兼容旧数据可缺省）
  eisenhower_quadrant?: EisenhowerQuadrant | null; // 艾森豪矩陣象限；空值表示未加入
  value_priority?: ValuePriorityProfile | null; // 價值 × 晚做損失新版四象限；與舊矩陣獨立
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

export interface DeskEntry {
  id: string;
  text: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface DeskDrawer {
  id: string;
  title: string;
  entries: DeskEntry[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601 last content or title edit
  state_updated_at?: string; // ISO 8601 last expand/dim UI state change
  is_dimmed?: boolean; // tick 按下時讓抽屜變暗
  expanded_override?: boolean | null;
  expanded_override_date?: string | null; // YYYY-MM-DD
}

export interface DeskEdgeRow {
  id: string;
  title: string;
  drawers: DeskDrawer[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601 last title/drawer/content edit
  state_updated_at?: string; // ISO 8601 last expand/dim UI state change
}

// 包含关联解析的展示记录
export interface EnrichedRecordItem extends RecordItem {
  thread?: ThreadItem;
  tag?: TagItem;
  children?: EnrichedRecordItem[];
}

// 视图切换类型
export type ActiveTab = 'record' | 'review' | 'matrix' | 'value-matrix' | 'thread-detail' | 'widgets' | 'desk';
