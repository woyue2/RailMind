import { create } from 'zustand';
import { persist, type PersistOptions } from 'zustand/middleware';
import {
  RecordItem,
  TagItem,
  ThreadItem,
  EnrichedRecordItem,
  HomeLink,
  AudioAttachment,
  ActiveTab,
  ValuePriorityProfile,
  DeskEdgeRow,
  DeskDrawer,
  DeskEntry,
} from '../types';
import { generateId, getLocalDateKey } from '../utils/dateUtils';
import { pickRandomQuoteColor } from '../utils/quoteColors';
import { createR2SyncService, reportR2SyncFailure } from '../sync';
import { loadR2Settings, removeTombstoneRecords } from '../sync/credentials';
import { createQuotaSafeStorage } from './quotaSafeStorage';

function triggerAutoSync(action: (sync: ReturnType<typeof createR2SyncService>) => Promise<void> | void) {
  if (!loadR2Settings().enabled) return;
  const sync = createR2SyncService();
  if (!sync) return;
  try {
    const res = action(sync);
    if (res instanceof Promise) {
      res.catch(reportR2SyncFailure);
    }
  } catch (error) {
    reportR2SyncFailure(error);
  }
}

function triggerDeskRowSync(rowId: string, deleted = false) {
  if (!loadR2Settings().enabled) return;
  const sync = createR2SyncService();
  if (!sync) return;
  if (deleted) {
    sync.deleteDeskRow(rowId).catch(reportR2SyncFailure);
    return;
  }
  const row = useFlowStore.getState().deskRows.find((item) => item.id === rowId);
  if (row) {
    sync.pushDeskRow(row).catch(reportR2SyncFailure);
  }
}

function deskRowIdForDrawer(drawerId: string): string {
  return useFlowStore.getState().deskRows.find((row) =>
    row.drawers.some((drawer) => drawer.id === drawerId)
  )?.id ?? '';
}

/**
 * 根據日期 key (yyyy-MM-dd) 生成桌邊 row 的自動標題。
 * 例如 '2026-09-23' → '2026年9月23日'。
 */
function deskRowTitleForDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateKey;
  return `${y}年${m}月${d}日`;
}

/**
 * 为「被引用/被分支」的源记录分配引用色（同源同色）：
 * - 引用（quote_id）：恒分配（首次随机，之后复用）
 * - 分支（parent_id）：仅跨天时分配（同天保持琥珀树形，不额外上色）
 *
 * addRecord 与 addRecords 共用，避免批量路径漏掉上色导致行为回归。
 * 传入 seen 集合以支持批量场景：同一次批量中同一 target 只判定/更新一次。
 */
function resolveQuoteColorUpdate(
  targetId: string | null | undefined,
  options: { parentId: string | null | undefined; quoteId: string | null | undefined },
  nowIso: string,
  seen: Set<string>
): RecordItem | null {
  if (!targetId || seen.has(targetId)) return null;
  seen.add(targetId);
  const target = useFlowStore.getState().records.find((r) => r.id === targetId);
  if (!target) return null;
  const isCrossDayBranch =
    !!options.parentId && !options.quoteId &&
    getLocalDateKey(target.created_at) !== getLocalDateKey(nowIso);
  const needColor = !!options.quoteId || isCrossDayBranch;
  if (needColor && !target.quote_color) {
    return { ...target, quote_color: pickRandomQuoteColor(), updated_at: nowIso };
  }
  return null;
}

interface FlowState {
  homeLink: HomeLink | null;
  records: RecordItem[];
  tags: TagItem[];
  threads: ThreadItem[];
  deskRows: DeskEdgeRow[];

  // Navigation & UI state
  activeTab: ActiveTab;
  selectedThreadId: string | null;
  selectedDate: string | null; // filter date in RecordView (null = default today)
  recordViewMode: 'timeline' | 'daily-pages';
  timelineDateHeaderBackgroundOpacity: number; // 时间流日期标题背景不透明度（0-100）
  dailyPageDateHeaderBackgroundOpacity: number; // 翻页日期标题背景不透明度（0-100）
  fromReviewDate: boolean; // 是否从回顾页点击某日期跳转而来
  fromThreadDetailId: string | null; // 是否从思维线详情页点击某记录跳转而来
  threadDetailReturnContext: ThreadDetailReturnContext | null;

  // Interaction state
  activeBranchParentId: string | null; // 正在分支的父记录 ID
  activeQuoteRecordId: string | null; // 正在引用的历史记录 ID
  quickSelectedThreadId: string | null; // 底部快捷胶囊选中的思维线 ID
  highlightRecordId: string | null; // 触发聚光灯呼吸高亮的记录 ID

  // Actions for Records
  addRecord: (
    text: string,
    options?: {
      parent_id?: string | null;
      tag_id?: string | null;
      thread_id?: string | null;
      quote_id?: string | null;
      imgs?: string[];
      bg_color?: string | null;
      audio?: AudioAttachment | null;
      value_priority?: ValuePriorityProfile | null;
      skipAutoSync?: boolean;
    }
  ) => RecordItem;
  /** K10：批量追加记录，避免拆解向导为 N 个子任务触发 N 轮独立 set + sync enqueue。 */
  addRecords: (
    items: Array<{
      text: string;
      options?: {
        parent_id?: string | null;
        tag_id?: string | null;
        thread_id?: string | null;
        quote_id?: string | null;
        imgs?: string[];
        bg_color?: string | null;
        audio?: AudioAttachment | null;
        value_priority?: ValuePriorityProfile | null;
      };
    }>
  ) => RecordItem[];
  updateRecord: (
    id: string,
    updates: Partial<Pick<RecordItem, 'tag_id' | 'thread_id' | 'text' | 'quote_id' | 'imgs' | 'bg_color' | 'audio' | 'is_pinned' | 'pinned_at' | 'eisenhower_quadrant' | 'value_priority'>>
  ) => void;
  deleteRecord: (id: string) => RecordItem[];
  restoreRecords: (records: RecordItem[]) => void;
  togglePinRecord: (id: string) => void;
  unpinRecord: (id: string) => void;
  toggleCompletedRecord: (id: string) => void;

  // Actions for Threads
  createThread: (title: string) => ThreadItem;
  /** 删除思维线；关联记录的 thread_id 会被置空（记录本身保留）。 */
  deleteThread: (id: string) => void;
  getRecentThreads: (limit?: number) => ThreadItem[];
  searchThreads: (query: string) => ThreadItem[];
  getThreadRecords: (threadId: string) => EnrichedRecordItem[];

  // Actions for Tags
  createTag: (name: string, color?: string) => TagItem;
  deleteTag: (id: string) => void;
  getTagRecords: (tagId: string) => EnrichedRecordItem[];

  // Navigation actions
  setActiveTab: (tab: ActiveTab) => void;
  openThreadDetail: (threadId: string) => void;
  backFromThreadDetail: () => void;
  openDateRecord: (dateStr: string) => void;
  openDateRecordFromThread: (dateStr: string, threadId: string) => void;
  backToReview: () => void;
  backToThreadDetail: () => void;
  resetToTodayRecord: () => void;
  setActiveBranchParentId: (id: string | null) => void;
  setActiveQuoteRecordId: (id: string | null) => void;
  setHighlightRecordId: (id: string | null) => void;
  setQuickSelectedThreadId: (id: string | null) => void;
  setSelectedDate: (date: string | null) => void;
  setRecordViewMode: (mode: 'timeline' | 'daily-pages') => void;
  setTimelineDateHeaderBackgroundOpacity: (opacity: number) => void;
  setDailyPageDateHeaderBackgroundOpacity: (opacity: number) => void;
  setHomeLink: (link: { shownName: string; href: string } | null) => void;

  // Actions for DeskEdge rows / drawers / entries
  addDeskRow: () => DeskEdgeRow;
  /** 按日期 key (yyyy-MM-dd) 查找對應的 row，不存在則自動建立。返回該 row。 */
  ensureDeskRowForDate: (dateKey: string) => DeskEdgeRow;
  updateDeskRowTitle: (rowId: string, title: string) => void;
  deleteDeskRow: (rowId: string) => DeskEdgeRow | null;
  restoreDeskRow: (row: DeskEdgeRow) => void;
  addDeskDrawer: (rowId: string) => DeskDrawer | null;
  updateDeskDrawerTitle: (drawerId: string, title: string) => void;
  deleteDeskDrawer: (drawerId: string) => { rowId: string; drawer: DeskDrawer; index: number } | null;
  restoreDeskDrawer: (rowId: string, drawer: DeskDrawer, index: number) => void;
  addDeskEntry: (drawerId: string, text: string) => void;
  updateDeskEntry: (drawerId: string, entryId: string, text: string) => void;
  deleteDeskEntry: (drawerId: string, entryId: string) => { drawerId: string; entry: DeskEntry; index: number } | null;
  restoreDeskEntry: (drawerId: string, entry: DeskEntry, index: number) => boolean;
  toggleDeskDrawer: (drawerId: string, expanded: boolean) => void;
  /** 改語義：批量切換該抽屜所有 entries 對應 records 的 is_completed；反轉也批量反轉。 */
  toggleDeskDrawerDimmed: (drawerId: string) => void;
  /** 主時間流記錄收進桌邊抽屜：自動建 DeskEntry + 互寫 record_id/desk_entry_id。已綁定的記錄會移動到新抽屜。 */
  bindRecordToDesk: (recordId: string, drawerId: string) => DeskEntry | null;
  /** 解綁：record 清 desk_entry_id，對應的桌邊 entry 一併刪除。 */
  unbindRecordFromDesk: (recordId: string) => void;
  /** 主時間流記錄直接作為新抽屜：以該記錄文本為標題，在該記錄日期對應的 row 建立新抽屜，並將記錄綁定進抽屜 */
  createDrawerFromRecord: (recordId: string, customTitle?: string) => DeskDrawer | null;
}

interface ThreadDetailReturnContext {
  tab: 'record' | 'review';
  selectedDate: string | null;
  recordViewMode: 'timeline' | 'daily-pages';
  fromReviewDate: boolean;
  fromThreadDetailId: string | null;
}

/**
 * 持久化数据迁移时校验 activeTab 的合法值集合。
 * 移除某个 Tab（如 v7 的 'widgets'）后，老数据里的该值会让所有渲染分支失配 → 白屏。
 */
const VALID_TABS: ActiveTab[] = ['record', 'review', 'matrix', 'value-matrix', 'thread-detail', 'desk'];

/**
 * persist 白名单：只持久化「数据」与「跨会话有意义的导航/偏好」字段。
 *
 * 为什么需要显式列举而不是 `{ ...state }`：
 * 1. `{ ...state }` 会把全部 action 函数也塞进 persist 输入，`JSON.stringify` 会静默
 *    丢弃函数，但每次都白跑一遍全量遍历（action 占 state 的绝大多数键）。
 * 2. 更重要的是，它会把**瞬时交互态**一并写盘。典型后果：在「正在分支/引用」状态下
 *    关闭 App，重开后 UI 仍停留在分支/引用模式，且指向的记录可能已被删除。
 *
 * 注意：本白名单外的字段在 rehydrate 时回落到初始值（见 (set, get) => ({...}) 的
 * `activeBranchParentId: null` 等），这正是我们想要的。**不改变已存数据的结构**，
 * 因此无需 bump persist version / 老用户无需 migrate。
 */
const PERSISTED_KEYS = [
  // —— 数据 ——
  'homeLink',
  'records',
  'tags',
  'threads',
  'deskRows',
  // —— 导航（跨会话恢复位置有意义）——
  'activeTab',
  'selectedThreadId',
  'selectedDate',
  'fromReviewDate',
  'fromThreadDetailId',
  // —— 用户偏好 ——
  'recordViewMode',
  'timelineDateHeaderBackgroundOpacity',
  'dailyPageDateHeaderBackgroundOpacity',
] as const satisfies readonly (keyof FlowState)[];

type PersistedFlowState = Pick<FlowState, (typeof PERSISTED_KEYS)[number]>;

function selectPersistedState(state: FlowState): PersistedFlowState {
  const picked = {} as PersistedFlowState;
  for (const key of PERSISTED_KEYS) {
    // 逐键拷贝：类型安全地只挑白名单字段。
    (picked as Record<string, unknown>)[key] = state[key];
  }
  return picked;
}

/**
 * 把任意来源（老版本 localStorage / migrate 输入）的持久化片段整理成
 * 「白名单内、且字段齐全」的持久化对象。
 *
 * 两处复用，保证语义一致：
 * - `migrate`：版本号变化时的迁移路径；
 * - `merge`：**每次 rehydrate** 都会走，因此即便用户版本号未变（无需 migrate），
 *   历史遗留的瞬时交互态也不会被读回 store —— 这是纯靠 migrate 覆盖不到的场景。
 */
function normalizePersistedState(persistedState: unknown): PersistedFlowState {
  const state = (persistedState ?? {}) as Partial<FlowState>;
  const hydrated: FlowState = {
    ...state,
    homeLink: state.homeLink ?? null,
    tags: Array.isArray(state.tags) ? state.tags : [],
    threads: Array.isArray(state.threads) ? state.threads : [],
    deskRows: Array.isArray(state.deskRows) ? state.deskRows : [],
    activeTab: VALID_TABS.includes(state.activeTab as ActiveTab)
      ? (state.activeTab as ActiveTab)
      : 'record',
    selectedThreadId: state.selectedThreadId ?? null,
    selectedDate: state.selectedDate ?? null,
    fromReviewDate: state.fromReviewDate === true,
    fromThreadDetailId: state.fromThreadDetailId ?? null,
    recordViewMode: state.recordViewMode === 'daily-pages' ? 'daily-pages' : 'timeline',
    timelineDateHeaderBackgroundOpacity:
      typeof state.timelineDateHeaderBackgroundOpacity === 'number'
        ? state.timelineDateHeaderBackgroundOpacity
        : 30,
    dailyPageDateHeaderBackgroundOpacity:
      typeof state.dailyPageDateHeaderBackgroundOpacity === 'number'
        ? state.dailyPageDateHeaderBackgroundOpacity
        : 30,
    records: (Array.isArray(state.records) ? state.records : []).map((record) => ({
      ...record,
      updated_at: record.updated_at ?? record.created_at,
    })),
  } as FlowState;
  return selectPersistedState(hydrated);
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      // 不内置任何示例数据：新安装为空白起点（示例数据会污染回顾/统计视图的统计口径）。
      records: [],
      tags: [],
      threads: [],
      deskRows: [],
      homeLink: null,

      activeTab: 'record',
      selectedThreadId: null,
      selectedDate: null,
      recordViewMode: 'timeline',
      timelineDateHeaderBackgroundOpacity: 30,
      dailyPageDateHeaderBackgroundOpacity: 30,
      fromReviewDate: false,
      fromThreadDetailId: null,
      threadDetailReturnContext: null,
      activeBranchParentId: null,
      activeQuoteRecordId: null,
      quickSelectedThreadId: null,
      highlightRecordId: null,

      addRecord: (text, options = {}) => {
        const nowIso = new Date().toISOString();
        const threadId = options.thread_id || null;
        const quoteId = options.quote_id || null;
        const parentId = options.parent_id || null;

        // 为"被引用/被分支"的源记录分配引用色(同源同色):
        // - 引用: 恒分配(首次随机, 之后复用)
        // - 分支: 仅跨天时分配(同天保持琥珀树形, 不额外上色)
        const targetId = quoteId || parentId;
        const targetColorUpdate = resolveQuoteColorUpdate(
          targetId,
          { parentId, quoteId },
          nowIso,
          new Set<string>()
        );

        const newRecord: RecordItem = {
          id: generateId(),
          text: text.trim(),
          created_at: nowIso,
          updated_at: nowIso,
          parent_id: parentId,
          tag_id: options.tag_id || null,
          thread_id: threadId,
          quote_id: quoteId,
          imgs: options.imgs && options.imgs.length > 0 ? options.imgs : undefined,
          bg_color: options.bg_color || null,
          audio: options.audio || undefined,
          value_priority: options.value_priority || undefined,
        };

        set((state) => {
          let updatedThreads = state.threads;
          if (threadId) {
            updatedThreads = state.threads.map((th) =>
              th.id === threadId ? { ...th, last_used_at: nowIso } : th
            );
          }

          const records = targetColorUpdate
            ? state.records.map((r) => (r.id === targetColorUpdate!.id ? targetColorUpdate! : r))
            : state.records;

          return {
            records: [...records, newRecord],
            threads: updatedThreads,
            activeBranchParentId: null,
            activeQuoteRecordId: null,
            quickSelectedThreadId: null,
          };
        });

        // skipAutoSync: 由調用方自己補完字段（如 desk_entry_id）後再推送完整版本
        if (!options.skipAutoSync) {
          triggerAutoSync((sync) => sync?.pushRecord(newRecord));
        }
        const linkedThread = threadId ? get().threads.find((thread) => thread.id === threadId) : undefined;
        if (linkedThread) triggerAutoSync((sync) => sync?.pushThread(linkedThread));
        if (targetColorUpdate) {
          triggerAutoSync((sync) => sync?.pushRecord(targetColorUpdate!));
        }

        return newRecord;
      },

      addRecords: (items) => {
        const nowIso = new Date().toISOString();
        const created: RecordItem[] = items
          .filter((item) => item.text.trim())
          .map((item) => ({
            id: generateId(),
            text: item.text.trim(),
            created_at: nowIso,
            updated_at: nowIso,
            parent_id: item.options?.parent_id || null,
            tag_id: item.options?.tag_id || null,
            thread_id: item.options?.thread_id || null,
            quote_id: item.options?.quote_id || null,
            imgs: item.options?.imgs && item.options.imgs.length > 0 ? item.options.imgs : undefined,
            bg_color: item.options?.bg_color || null,
            audio: item.options?.audio || undefined,
            value_priority: item.options?.value_priority || undefined,
          }));
        if (!created.length) return [];

        // 与 addRecord 保持行为一致：批量创建分支时同样需要给父/引用源记录分配引用色。
        // 批量场景下多个子任务通常共享同一 parent_id，seen 集合保证每个 target 只判定一次，
        // 语义等价于「第一条 addRecord 分配、后续因已有色而跳过」。
        const colorSeen = new Set<string>();
        const targetColorUpdates: RecordItem[] = [];
        created.forEach((record) => {
          const update = resolveQuoteColorUpdate(
            record.quote_id || record.parent_id,
            { parentId: record.parent_id, quoteId: record.quote_id },
            nowIso,
            colorSeen
          );
          if (update) targetColorUpdates.push(update);
        });

        // 单次 set 写入全部记录（含引用色更新），并把涉及的思维线 last_used_at 只推进一次，
        // 避免 N 次独立 set 触发 N 轮 store 订阅通知与重渲染。
        const touchedThreadIds = new Set(
          created.map((record) => record.thread_id).filter((id): id is string => Boolean(id))
        );
        const colorUpdatedIds = new Map(targetColorUpdates.map((item) => [item.id, item]));
        set((state) => ({
          records: [
            ...state.records.map((r) => colorUpdatedIds.get(r.id) ?? r),
            ...created,
          ],
          threads: touchedThreadIds.size
            ? state.threads.map((thread) =>
                touchedThreadIds.has(thread.id) ? { ...thread, last_used_at: nowIso } : thread
              )
            : state.threads,
        }));

        // 每条记录仍需独立推送（R2 是一对象一请求），但 enqueue 串行队列已保证顺序。
        created.forEach((record) => triggerAutoSync((sync) => sync?.pushRecord(record)));
        targetColorUpdates.forEach((record) => triggerAutoSync((sync) => sync?.pushRecord(record)));
        touchedThreadIds.forEach((threadId) => {
          const linkedThread = get().threads.find((thread) => thread.id === threadId);
          if (linkedThread) triggerAutoSync((sync) => sync?.pushThread(linkedThread));
        });

        return created;
      },

      updateRecord: (id, updates) => {
        const nowIso = new Date().toISOString();
        let updatedRecord: RecordItem | undefined;

        set((state) => {
          let updatedThreads = state.threads;
          if (updates.thread_id) {
            updatedThreads = state.threads.map((th) =>
              th.id === updates.thread_id ? { ...th, last_used_at: nowIso } : th
            );
          }
          const updatedRecords = state.records.map((r) => {
            if (r.id === id) {
              updatedRecord = { ...r, ...updates, updated_at: nowIso };
              return updatedRecord;
            }
            return r;
          });
          return {
            records: updatedRecords,
            threads: updatedThreads,
          };
        });

        if (updatedRecord) {
          triggerAutoSync((sync) => sync?.pushRecord(updatedRecord!));
        }
        if (updates.thread_id) {
          const linkedThread = get().threads.find((thread) => thread.id === updates.thread_id);
          if (linkedThread) triggerAutoSync((sync) => sync?.pushThread(linkedThread));
        }
      },

      deleteRecord: (id) => {
        const records = get().records;
        const removedIds = new Set<string>([id]);
        let changed = true;

        // Keep the confirmation copy honest: deleting a parent removes the full branch tree.
        while (changed) {
          changed = false;
          records.forEach((record) => {
            if (record.parent_id && removedIds.has(record.parent_id) && !removedIds.has(record.id)) {
              removedIds.add(record.id);
              changed = true;
            }
          });
        }

        const removedRecords = records.filter((record) => removedIds.has(record.id));
        if (!removedRecords.length) return [];

        // 級聯：若被刪的 records 有 desk_entry_id 或與抽屜直接關聯 → 移除 entries，且若抽屜被清空則一併刪除抽屜！
        const removedEntryIds = new Set<string>();
        const removedRecordIds = new Set<string>(removedRecords.map((r) => r.id));
        const removedRecordTexts = new Set<string>(
          removedRecords.map((r) => r.text.trim().split('\n')[0]).filter(Boolean)
        );

        removedRecords.forEach((r) => {
          if (r.desk_entry_id) removedEntryIds.add(r.desk_entry_id);
        });

        const affectedRowIds = new Set<string>();

        set((state) => {
          let deskRows = state.deskRows;
          const nowIso = new Date().toISOString();
          const drawersToDelete = new Set<string>();

          state.deskRows.forEach((row) => {
            row.drawers.forEach((drawer) => {
              const remainingEntries = drawer.entries.filter((e) => !removedEntryIds.has(e.id));
              // 條件 1: 抽屜內有條目被刪，且過濾後該抽屜無任何剩餘條目 → 刪除該抽屜
              if (drawer.entries.some((e) => removedEntryIds.has(e.id)) && remainingEntries.length === 0) {
                drawersToDelete.add(drawer.id);
                affectedRowIds.add(row.id);
              }
              // 條件 2: 抽屜的所有條目對應的 record 都全在被刪除的列表中 → 刪除該抽屜
              else if (
                drawer.entries.length > 0 &&
                drawer.entries.every((e) => e.record_id && removedRecordIds.has(e.record_id))
              ) {
                drawersToDelete.add(drawer.id);
                affectedRowIds.add(row.id);
              }
              // 條件 3: 抽屜標題恰好是被刪記錄文本（由做成抽屜生成）且無其他非關聯條目 → 刪除該抽屜
              else if (
                removedRecordTexts.has(drawer.title.trim()) &&
                remainingEntries.length === 0
              ) {
                drawersToDelete.add(drawer.id);
                affectedRowIds.add(row.id);
              } else if (drawer.entries.some((e) => removedEntryIds.has(e.id))) {
                affectedRowIds.add(row.id);
              }
            });
          });

          if (removedEntryIds.size > 0 || drawersToDelete.size > 0) {
            deskRows = state.deskRows.map((row) => ({
              ...row,
              drawers: row.drawers
                // 1. 刪除關聯抽屜
                .filter((d) => !drawersToDelete.has(d.id))
                // 2. 剩餘抽屜移除被刪 entry
                .map((d) => ({
                  ...d,
                  entries: d.entries.filter((e) => !removedEntryIds.has(e.id)),
                  updated_at: nowIso,
                })),
              updated_at: nowIso,
            }));
          }

          return {
            records: state.records.filter((record) => !removedIds.has(record.id)),
            deskRows,
          };
        });

        // 同步受影響的桌邊 rows
        affectedRowIds.forEach((rowId) => triggerDeskRowSync(rowId));

        removedRecords.forEach((record) => triggerAutoSync((sync) => sync?.deleteRecord(record.id)));
        return removedRecords;
      },

      restoreRecords: (recordsToRestore) => {
        if (!recordsToRestore.length) return;
        const existingIds = new Set(get().records.map((record) => record.id));
        const restoredRecords = recordsToRestore.filter((record) => !existingIds.has(record.id));
        if (!restoredRecords.length) return;

        set((state) => ({
          records: [...state.records, ...restoredRecords],
        }));
        // 先清除墓碑再推送，否则 pushRecord / syncEntities 会因 isDeleted 短路，
        // 导致恢复的记录在其他设备上永久隐藏。
        // 本地墓碑清除不依赖 R2 可用性（即使 enabled=true 但服务构造失败也要清），
        // 否则残缺配置下恢复的记录在补全配置后仍会被墓碑藏掉。
        const restoredIds = restoredRecords.map((record) => record.id);
        removeTombstoneRecords('record', restoredIds);
        triggerAutoSync((sync) => sync?.clearTombstones('record', restoredIds));
        restoredRecords.forEach((record) => triggerAutoSync((sync) => sync?.pushRecord(record)));
      },

      togglePinRecord: (id) => {
        const nowIso = new Date().toISOString();
        let targetRecord: RecordItem | undefined;
        set((state) => {
          const updatedRecords = state.records.map((r) => {
            if (r.id === id) {
              const nextPinned = !r.is_pinned;
              targetRecord = {
                ...r,
                is_pinned: nextPinned,
                pinned_at: nextPinned ? nowIso : null,
                updated_at: nowIso,
              };
              return targetRecord;
            }
            return r;
          });
          return { records: updatedRecords };
        });

        if (targetRecord) {
          triggerAutoSync((sync) => sync?.pushRecord(targetRecord!));
        }
      },

      unpinRecord: (id) => {
        const nowIso = new Date().toISOString();
        let targetRecord: RecordItem | undefined;
        set((state) => {
          const updatedRecords = state.records.map((r) => {
            if (r.id === id) {
              targetRecord = {
                ...r,
                is_pinned: false,
                pinned_at: null,
                updated_at: nowIso,
              };
              return targetRecord;
            }
            return r;
          });
          return { records: updatedRecords };
        });

        if (targetRecord) {
          triggerAutoSync((sync) => sync?.pushRecord(targetRecord!));
        }
      },

      toggleCompletedRecord: (id) => {
        const nowIso = new Date().toISOString();
        let targetRecord: RecordItem | undefined;
        set((state) => {
          const updatedRecords = state.records.map((r) => {
            if (r.id === id) {
              targetRecord = {
                ...r,
                is_completed: !r.is_completed,
                updated_at: nowIso,
              };
              return targetRecord;
            }
            return r;
          });
          return { records: updatedRecords };
        });

        if (!targetRecord) {
          console.warn('[toggleCompletedRecord] record 不存在:', id);
          return;
        }
        triggerAutoSync((sync) => sync?.pushRecord(targetRecord!));
      },

      createThread: (title) => {
        const nowIso = new Date().toISOString();
        const newThread: ThreadItem = {
          id: generateId(),
          title: title.trim(),
          created_at: nowIso,
          last_used_at: nowIso,
        };

        set((state) => ({
          threads: [newThread, ...state.threads],
        }));

        triggerAutoSync((sync) => sync?.pushThread(newThread));

        return newThread;
      },

      deleteThread: (id) => {
        const nowIso = new Date().toISOString();
        // 与 deleteTag 对称：解绑关联记录而非连坐删除，避免用户误删后丢失正文。
        let updatedRecords: RecordItem[] = [];
        set((state) => {
          updatedRecords = state.records
            .filter((record) => record.thread_id === id)
            .map((record) => ({ ...record, thread_id: null, updated_at: nowIso }));
          const updatedIds = new Set(updatedRecords.map((record) => record.id));
          return {
            threads: state.threads.filter((thread) => thread.id !== id),
            records: state.records.map((record) =>
              updatedIds.has(record.id)
                ? updatedRecords.find((updated) => updated.id === record.id)!
                : record
            ),
            // 若当前正停留在该思维线详情页，退出到记录页避免悬空视图。
            ...(state.selectedThreadId === id
              ? { selectedThreadId: null, activeTab: 'record' as ActiveTab }
              : {}),
            ...(state.quickSelectedThreadId === id ? { quickSelectedThreadId: null } : {}),
          };
        });
        updatedRecords.forEach((record) => triggerAutoSync((sync) => sync?.pushRecord(record)));
        triggerAutoSync((sync) => sync?.deleteThread(id));
      },

      getRecentThreads: (limit = 3) => {
        const { threads } = get();
        return [...threads]
          .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime())
          .slice(0, limit);
      },

      searchThreads: (query) => {
        const { threads } = get();
        if (!query.trim()) {
          return [...threads].sort(
            (a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
          );
        }
        const lower = query.toLowerCase();
        return threads.filter((th) => th.title.toLowerCase().includes(lower));
      },

      getThreadRecords: (threadId) => {
        const { records, threads, tags } = get();
        const thread = threads.find((t) => t.id === threadId);
        return records
          .filter((r) => r.thread_id === threadId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((r) => ({
            ...r,
            thread,
            tag: tags.find((t) => t.id === r.tag_id),
          }));
      },

      createTag: (name, color = '#60A5FA') => {
        const nowIso = new Date().toISOString();
        const newTag: TagItem = {
          id: generateId(),
          name: name.trim(),
          color,
          created_at: nowIso,
          updated_at: nowIso,
        };
        set((state) => ({
          tags: [...state.tags, newTag],
        }));
        triggerAutoSync((sync) => sync?.pushTag(newTag));
        return newTag;
      },

      deleteTag: (id) => {
        const nowIso = new Date().toISOString();
        let updatedRecords: RecordItem[] = [];
        set((state) => {
          updatedRecords = state.records
            .filter((record) => record.tag_id === id)
            .map((record) => ({ ...record, tag_id: null, updated_at: nowIso }));
          const updatedIds = new Set(updatedRecords.map((record) => record.id));
          return {
            tags: state.tags.filter((tag) => tag.id !== id),
            records: state.records.map((record) =>
              updatedIds.has(record.id) ? updatedRecords.find((updated) => updated.id === record.id)! : record
            ),
          };
        });
        updatedRecords.forEach((record) => triggerAutoSync((sync) => sync?.pushRecord(record)));
        triggerAutoSync((sync) => sync?.deleteTag(id));
      },

      getTagRecords: (tagId) => {
        const { records, threads, tags } = get();
        const tag = tags.find((t) => t.id === tagId);
        return records
          .filter((r) => r.tag_id === tagId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((r) => ({
            ...r,
            tag,
            thread: threads.find((th) => th.id === r.thread_id),
          }));
      },

      setActiveTab: (tab) => {
        set({
          activeTab: tab,
          // When switching tabs explicitly, if switching to record, clear filter unless already handled
          ...(tab === 'record'
            ? {
                selectedDate: null,
                fromReviewDate: false,
                fromThreadDetailId: null,
                threadDetailReturnContext: null,
              }
            : {}),
        });
      },

      openThreadDetail: (threadId) => {
        const { activeTab, selectedDate, recordViewMode, fromReviewDate, fromThreadDetailId } = get();
        set({
          activeTab: 'thread-detail',
          selectedThreadId: threadId,
          threadDetailReturnContext: {
            tab: activeTab === 'record' ? 'record' : 'review',
            selectedDate,
            recordViewMode,
            fromReviewDate,
            fromThreadDetailId,
          },
        });
      },

      backFromThreadDetail: () => {
        const { threadDetailReturnContext } = get();
        if (threadDetailReturnContext?.tab === 'record') {
          set({
            activeTab: 'record',
            selectedDate: threadDetailReturnContext.selectedDate,
            recordViewMode: threadDetailReturnContext.recordViewMode,
            fromReviewDate: threadDetailReturnContext.fromReviewDate,
            fromThreadDetailId: threadDetailReturnContext.fromThreadDetailId,
            threadDetailReturnContext: null,
          });
          return;
        }

        set({
          activeTab: 'review',
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
          threadDetailReturnContext: null,
        });
      },

      openDateRecord: (dateStr) => {
        set({
          activeTab: 'record',
          selectedDate: dateStr,
          fromReviewDate: true,
          fromThreadDetailId: null,
          threadDetailReturnContext: null,
        });
      },

      openDateRecordFromThread: (dateStr, threadId) => {
        set({
          activeTab: 'record',
          selectedDate: dateStr,
          fromReviewDate: false,
          fromThreadDetailId: threadId,
          threadDetailReturnContext: null,
        });
      },

      backToReview: () => {
        set({
          activeTab: 'review',
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
          threadDetailReturnContext: null,
        });
      },

      backToThreadDetail: () => {
        const { fromThreadDetailId } = get();
        if (fromThreadDetailId) {
          set({
            activeTab: 'thread-detail',
            selectedThreadId: fromThreadDetailId,
            selectedDate: null,
            fromReviewDate: false,
            fromThreadDetailId: null,
            threadDetailReturnContext: null,
          });
        } else {
          set({
            activeTab: 'review',
            selectedDate: null,
            fromReviewDate: false,
            fromThreadDetailId: null,
            threadDetailReturnContext: null,
          });
        }
      },

      resetToTodayRecord: () => {
        set({
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
          threadDetailReturnContext: null,
        });
      },

      setActiveBranchParentId: (id) => set({ activeBranchParentId: id }),

      setActiveQuoteRecordId: (id) => set({ activeQuoteRecordId: id }),

      setHighlightRecordId: (id) => set({ highlightRecordId: id }),

      setQuickSelectedThreadId: (id) =>
        set((state) => ({
          quickSelectedThreadId: state.quickSelectedThreadId === id ? null : id,
        })),

      setSelectedDate: (date) => set({ selectedDate: date }),

      setRecordViewMode: (recordViewMode) => set({ recordViewMode }),

      setTimelineDateHeaderBackgroundOpacity: (opacity) =>
        set({ timelineDateHeaderBackgroundOpacity: Math.min(100, Math.max(0, Math.round(opacity))) }),

      setDailyPageDateHeaderBackgroundOpacity: (opacity) =>
        set({ dailyPageDateHeaderBackgroundOpacity: Math.min(100, Math.max(0, Math.round(opacity))) }),

      setHomeLink: (homeLink) => {
        const nextLink = homeLink ? { ...homeLink, updatedAt: new Date().toISOString() } : null;
        set({ homeLink: nextLink });
        triggerAutoSync((sync) => sync?.pushHomeLink(nextLink));
      },

      addDeskRow: () => {
        const nowIso = new Date().toISOString();
        const todayKey = getLocalDateKey(nowIso);
        const newRow: DeskEdgeRow = {
          id: generateId(),
          title: deskRowTitleForDate(todayKey),
          drawers: [],
          created_at: nowIso,
          updated_at: nowIso,
        };
        set((state) => ({ deskRows: [...state.deskRows, newRow] }));
        triggerDeskRowSync(newRow.id);
        return newRow;
      },

      ensureDeskRowForDate: (dateKey) => {
        const rows = get().deskRows;
        // Row 的日期由 row.created_at 決定（Row 就是日期容器），直接比本地日期 key
        const match = rows.find((row) => getLocalDateKey(row.created_at) === dateKey);
        if (match) return match;
        // 不存在 → 自動建立
        const nowIso = new Date().toISOString();
        const newRow: DeskEdgeRow = {
          id: generateId(),
          title: deskRowTitleForDate(dateKey),
          drawers: [],
          created_at: nowIso,
          updated_at: nowIso,
        };
        set((state) => ({ deskRows: [...state.deskRows, newRow] }));
        triggerDeskRowSync(newRow.id);
        return newRow;
      },

      updateDeskRowTitle: (rowId, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();
        set((state) => ({
          deskRows: state.deskRows.map((row) =>
            row.id === rowId ? { ...row, title: trimmed, updated_at: nowIso } : row
          ),
        }));
        triggerDeskRowSync(rowId);
      },

      deleteDeskRow: (rowId) => {
        const nowIso = new Date().toISOString();
        const target = get().deskRows.find((row) => row.id === rowId);
        if (!target) return null;

        // 收集該 row 下所有 entries 的 record_id，級聯解綁
        const relatedRecordIds: string[] = [];
        target.drawers.forEach((d) =>
          d.entries.forEach((e) => {
            if (e.record_id) relatedRecordIds.push(e.record_id);
          })
        );

        set((state) => {
          let records = state.records;
          if (relatedRecordIds.length > 0) {
            records = state.records.map((r) =>
              relatedRecordIds.includes(r.id)
                ? { ...r, desk_entry_id: null, updated_at: nowIso }
                : r
            );
          }
          return {
            records,
            deskRows: state.deskRows.filter((row) => row.id !== rowId),
          };
        });

        // 同步解綁後的 records
        if (relatedRecordIds.length > 0) {
          const updatedRecords = get().records.filter((r) => relatedRecordIds.includes(r.id));
          updatedRecords.forEach((r) => triggerAutoSync((sync) => sync?.pushRecord(r)));
        }
        triggerDeskRowSync(rowId, true);
        return target;
      },

      restoreDeskRow: (row) => {
        // 撤销删除整行：清墓碑后再 upsert 并推送，否则同步会因 isDeleted 短路。
        // 同時恢復該 row 下所有 entries 對應 records 的 desk_entry_id（之前 deleteDeskRow 級聯解綁了）。
        const nowIso = new Date().toISOString();
        const restorations: { recordId: string; entryId: string }[] = [];
        row.drawers.forEach((d) =>
          d.entries.forEach((e) => {
            if (e.record_id && e.id) restorations.push({ recordId: e.record_id, entryId: e.id });
          })
        );

        set((state) => {
          let records = state.records;
          if (restorations.length > 0) {
            records = state.records.map((r) => {
              const match = restorations.find((x) => x.recordId === r.id);
              if (match) return { ...r, desk_entry_id: match.entryId, updated_at: nowIso };
              return r;
            });
          }
          return {
            records,
            deskRows: state.deskRows.some((item) => item.id === row.id)
              ? state.deskRows.map((item) => (item.id === row.id ? row : item))
              : [...state.deskRows, row],
          };
        });

        // 同步恢復後的 records
        restorations.forEach(({ recordId }) => {
          const updated = get().records.find((r) => r.id === recordId);
          if (updated) triggerAutoSync((sync) => sync?.pushRecord(updated));
        });
        removeTombstoneRecords('desk', [row.id]);
        triggerAutoSync((sync) => sync?.clearTombstones('desk', [row.id]));
        triggerDeskRowSync(row.id);
      },

      addDeskDrawer: (rowId) => {
        // 先確認 row 存在（防止傳入已被刪除的 rowId 導致 newDrawer 保持 null）
        const rowExists = get().deskRows.some((r) => r.id === rowId);
        if (!rowExists) {
          console.warn('[addDeskDrawer] rowId 不存在:', rowId);
          return null;
        }
        const nowIso = new Date().toISOString();
        let newDrawer: DeskDrawer | null = null;
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            if (row.id !== rowId) return row;
            newDrawer = {
              id: generateId(),
              title: `抽屜 ${row.drawers.length + 1}`,
              entries: [],
              created_at: nowIso,
              updated_at: nowIso,
            };
            return {
              ...row,
              drawers: [...row.drawers, newDrawer],
              updated_at: nowIso,
            };
          }),
        }));
        triggerDeskRowSync(rowId);
        return newDrawer;
      },

      updateDeskDrawerTitle: (drawerId, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            const drawer = row.drawers.find((d) => d.id === drawerId);
            return drawer
              ? {
                  ...row,
                  drawers: row.drawers.map((d) =>
                    d.id === drawerId ? { ...d, title: trimmed, updated_at: nowIso } : d
                  ),
                  updated_at: nowIso,
                }
              : row;
          }),
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      deleteDeskDrawer: (drawerId) => {
        const nowIso = new Date().toISOString();
        const rows = get().deskRows;
        const ownerRow = rows.find((row) => row.drawers.some((d) => d.id === drawerId));
        if (!ownerRow) return null;
        const index = ownerRow.drawers.findIndex((d) => d.id === drawerId);
        const removed = { rowId: ownerRow.id, drawer: ownerRow.drawers[index], index };

        // 收集該抽屜所有 entries 的 record_id，級聯解綁
        const relatedRecordIds = removed.drawer.entries
          .map((e) => e.record_id)
          .filter((id): id is string => Boolean(id));

        set((state) => {
          let records = state.records;
          if (relatedRecordIds.length > 0) {
            records = state.records.map((r) =>
              relatedRecordIds.includes(r.id)
                ? { ...r, desk_entry_id: null, updated_at: nowIso }
                : r
            );
          }
          return {
            records,
            deskRows: state.deskRows.map((row) =>
              row.id === ownerRow.id
                ? {
                    ...row,
                    drawers: row.drawers.filter((d) => d.id !== drawerId),
                    updated_at: nowIso,
                  }
                : row
            ),
          };
        });

        if (relatedRecordIds.length > 0) {
          const updatedRecords = get().records.filter((r) => relatedRecordIds.includes(r.id));
          updatedRecords.forEach((r) => triggerAutoSync((sync) => sync?.pushRecord(r)));
        }
        triggerDeskRowSync(removed.rowId);
        return removed;
      },

      restoreDeskDrawer: (rowId, drawer, index) => {
        const nowIso = new Date().toISOString();
        // 同時恢復該抽屜所有 entries 對應 records 的 desk_entry_id
        const restorations: { recordId: string; entryId: string }[] = [];
        drawer.entries.forEach((e) => {
          if (e.record_id && e.id) restorations.push({ recordId: e.record_id, entryId: e.id });
        });

        set((state) => {
          let records = state.records;
          if (restorations.length > 0) {
            records = state.records.map((r) => {
              const match = restorations.find((x) => x.recordId === r.id);
              if (match) return { ...r, desk_entry_id: match.entryId, updated_at: nowIso };
              return r;
            });
          }
          return {
            records,
            deskRows: state.deskRows.map((row) => {
              if (row.id !== rowId) return row;
              if (row.drawers.some((d) => d.id === drawer.id)) return row;
              const drawers = [...row.drawers];
              drawers.splice(Math.max(0, Math.min(index, drawers.length)), 0, drawer);
              return { ...row, drawers, updated_at: nowIso };
            }),
          };
        });

        restorations.forEach(({ recordId }) => {
          const updated = get().records.find((r) => r.id === recordId);
          if (updated) triggerAutoSync((sync) => sync?.pushRecord(updated));
        });
        triggerDeskRowSync(rowId);
      },

      addDeskEntry: (drawerId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();
        const newEntryId = generateId();
        // 1. 建立時間流 record，skipAutoSync=true 因為此時 record 還沒有 desk_entry_id
        //    （addRecord 內部的 thread push 不受影響，只跳過 newRecord 本身的 push）
        const record = get().addRecord(trimmed, { skipAutoSync: true });

        // 2. 補 entry 的 record_id 和 record 的 desk_entry_id（一次 set 同時改 deskRows + records）
        set((state) => ({
          records: state.records.map((r) =>
            r.id === record.id ? { ...r, desk_entry_id: newEntryId } : r
          ),
          deskRows: state.deskRows.map((row) => {
            const drawer = row.drawers.find((d) => d.id === drawerId);
            return drawer
              ? {
                  ...row,
                  drawers: row.drawers.map((d) =>
                    d.id === drawerId
                      ? {
                          ...d,
                          entries: [
                            ...d.entries,
                            {
                              id: newEntryId,
                              text: trimmed,
                              created_at: nowIso,
                              updated_at: nowIso,
                              record_id: record.id,
                            },
                          ],
                          updated_at: nowIso,
                        }
                      : d
                  ),
                  updated_at: nowIso,
                }
              : row;
          }),
        }));

        // 3. 補完 desk_entry_id 後推送完整版本（唯一的一次 push）
        const finalRecord = get().records.find((r) => r.id === record.id);
        if (finalRecord) triggerAutoSync((sync) => sync?.pushRecord(finalRecord));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      updateDeskEntry: (drawerId, entryId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();

        // 先查 entry 的 record_id，用於同步更新 record.text
        const rows = get().deskRows;
        const ownerRow = rows.find((row) =>
          row.drawers.some((d) => d.id === drawerId && d.entries.some((e) => e.id === entryId))
        );
        const existingEntry = ownerRow
          ? ownerRow.drawers.find((d) => d.id === drawerId)?.entries.find((e) => e.id === entryId)
          : undefined;
        const relatedRecordId = existingEntry?.record_id;

        set((state) => {
          let records = state.records;
          if (relatedRecordId) {
            records = state.records.map((r) =>
              r.id === relatedRecordId ? { ...r, text: trimmed, updated_at: nowIso } : r
            );
          }
          return {
            records,
            deskRows: state.deskRows.map((row) => {
              const drawer = row.drawers.find((d) => d.id === drawerId);
              return drawer
                ? {
                    ...row,
                    drawers: row.drawers.map((d) =>
                      d.id === drawerId
                        ? {
                            ...d,
                            entries: d.entries.map((e) =>
                              e.id === entryId ? { ...e, text: trimmed, updated_at: nowIso } : e
                            ),
                            updated_at: nowIso,
                          }
                        : d
                    ),
                    updated_at: nowIso,
                  }
                : row;
            }),
          };
        });

        // 同步更新後的 record
        if (relatedRecordId) {
          const updatedRecord = get().records.find((r) => r.id === relatedRecordId);
          if (updatedRecord) triggerAutoSync((sync) => sync?.pushRecord(updatedRecord));
        }
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      deleteDeskEntry: (drawerId, entryId) => {
        const nowIso = new Date().toISOString();
        const rows = get().deskRows;
        const ownerRow = rows.find((row) =>
          row.drawers.some((d) => d.id === drawerId && d.entries.some((e) => e.id === entryId))
        );
        if (!ownerRow) return null;
        const drawer = ownerRow.drawers.find((d) => d.id === drawerId)!;
        const index = drawer.entries.findIndex((e) => e.id === entryId);
        const removed = { drawerId, entry: drawer.entries[index], index };

        // 解綁 record：若 entry 有 record_id，把對應 record 的 desk_entry_id 清 null
        const relatedRecordId = removed.entry.record_id;

        set((state) => {
          let records = state.records;
          if (relatedRecordId) {
            records = state.records.map((r) =>
              r.id === relatedRecordId ? { ...r, desk_entry_id: null, updated_at: nowIso } : r
            );
          }
          return {
            records,
            deskRows: state.deskRows.map((row) =>
              row.id === ownerRow.id
                ? {
                    ...row,
                    drawers: row.drawers.map((d) =>
                      d.id === drawerId
                        ? {
                            ...d,
                            entries: d.entries.filter((e) => e.id !== entryId),
                            updated_at: nowIso,
                          }
                        : d
                    ),
                    updated_at: nowIso,
                  }
                : row
            ),
          };
        });

        // 同步解綁後的 record（若有）
        if (relatedRecordId) {
          const updatedRecord = get().records.find((r) => r.id === relatedRecordId);
          if (updatedRecord) triggerAutoSync((sync) => sync?.pushRecord(updatedRecord));
        }
        triggerDeskRowSync(ownerRow.id);
        return removed;
      },

      restoreDeskEntry: (drawerId, entry, index) => {
        const nowIso = new Date().toISOString();
        const rows = get().deskRows;
        // 撤销前校验目标抽屉仍存在：若用户删 entry → 删 drawer → 撤销 entry，
        // 目标抽屉已不在，静默 no-op 会让用户以为恢复成功。
        const drawerExists = rows.some((row) => row.drawers.some((d) => d.id === drawerId));
        if (!drawerExists) return false;

        // 同時恢復 record.desk_entry_id——但先確認 record 還在（可能用戶已經在時間流裡把它刪了）
        const relatedRecordId = entry.record_id;
        const relatedRecordExists = relatedRecordId
          ? get().records.some((r) => r.id === relatedRecordId)
          : false;
        set((state) => {
          let records = state.records;
          if (relatedRecordId && relatedRecordExists) {
            records = state.records.map((r) =>
              r.id === relatedRecordId ? { ...r, desk_entry_id: entry.id, updated_at: nowIso } : r
            );
          }
          return {
            records,
            deskRows: state.deskRows.map((row) => ({
              ...row,
              drawers: row.drawers.map((d) => {
                if (d.id !== drawerId) return d;
                if (d.entries.some((e) => e.id === entry.id)) return d;
                const entries = [...d.entries];
                entries.splice(Math.max(0, Math.min(index, entries.length)), 0, entry);
                return { ...d, entries, updated_at: nowIso };
              }),
            })),
          };
        });

        if (relatedRecordId && relatedRecordExists) {
          const updated = get().records.find((r) => r.id === relatedRecordId);
          if (updated) triggerAutoSync((sync) => sync?.pushRecord(updated));
        }
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
        return true;
      },

      toggleDeskDrawer: (drawerId, expanded) => {
        const nowIso = new Date().toISOString();
        const todayKey = getLocalDateKey(new Date().toISOString());
        // 互斥：expanded=true 時，把所有 rows 裡其他 drawer 的 expanded_override 都設成 false
        // （不限同一 row，因為 DeskEdgeView 會把多個 rows 聚合成同一日期段落顯示）
        set((state) => ({
          deskRows: state.deskRows.map((row) => ({
            ...row,
            drawers: row.drawers.map((d) => {
              if (d.id === drawerId) {
                return {
                  ...d,
                  expanded_override: expanded,
                  expanded_override_date: todayKey,
                  state_updated_at: nowIso,
                };
              }
              if (expanded) {
                return {
                  ...d,
                  expanded_override: false,
                  expanded_override_date: todayKey,
                  state_updated_at: nowIso,
                };
              }
              return d;
            }),
            state_updated_at: nowIso,
          })),
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      toggleDeskDrawerDimmed: (drawerId) => {
        const nowIso = new Date().toISOString();
        // 1. 查該抽屜所有 entries 對應的 records 的 is_completed 狀態
        const rows = get().deskRows;
        const drawer = rows.reduce<DeskDrawer | null>((acc, row) => {
          if (acc) return acc;
          return row.drawers.find((d) => d.id === drawerId) ?? null;
        }, null);
        if (!drawer) return;

        const relatedRecordIds = drawer.entries
          .map((e) => e.record_id)
          .filter((id): id is string => Boolean(id));

        // 空抽屜 → 無可 tick 條目，直接 no-op
        if (relatedRecordIds.length === 0) return;

        // 2. 決定方向：若所有 records 都已完成 → 全部取消；否則全部設為完成
        const records = get().records;
        const relatedRecords = relatedRecordIds
          .map((id) => records.find((r) => r.id === id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r));
        const allCompleted = relatedRecords.length > 0 && relatedRecords.every((r) => r.is_completed);
        const nextCompleted = !allCompleted;

        // 3. 一次 set 只改 records.is_completed（drawer 的 dimmed 從 records 派生，不需要寫 drawer.is_dimmed）
        set((state) => ({
          records: state.records.map((r) =>
            relatedRecordIds.includes(r.id)
              ? { ...r, is_completed: nextCompleted, updated_at: nowIso }
              : r
          ),
        }));

        // 4. 批量 push records
        relatedRecords.forEach((r) => {
          const updated = get().records.find((x) => x.id === r.id);
          if (updated) triggerAutoSync((sync) => sync?.pushRecord(updated));
        });
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      bindRecordToDesk: (recordId, drawerId) => {
        const nowIso = new Date().toISOString();
        const record = get().records.find((r) => r.id === recordId);
        if (!record) return null;

        // 0. 若 record 已綁桌邊 → 先查它是否已經在目標抽屜（短路避免多餘的 delete+create）
        const prevEntryId = record.desk_entry_id;
        if (prevEntryId) {
          // 找到舊 entry 所在抽屜
          const prevEntryLocation = get().deskRows.reduce<{ rowId: string; drawerId: string } | null>(
            (acc, row) => {
              if (acc) return acc;
              const drawer = row.drawers.find((d) => d.entries.some((e) => e.id === prevEntryId));
              return drawer ? { rowId: row.id, drawerId: drawer.id } : null;
            },
            null
          );
          if (prevEntryLocation && prevEntryLocation.drawerId === drawerId) {
            // 已經在目標抽屜了，什麼都不做
            return null;
          }
        }

        // 1. 若 record 已綁桌邊（且不在目標抽屜）→ 先解綁（移動語義）
        if (prevEntryId) {
          const oldOwnerRow = get().deskRows.find((row) =>
            row.drawers.some((d) => d.entries.some((e) => e.id === prevEntryId))
          );
          if (oldOwnerRow) {
            const oldOwnerRowId = oldOwnerRow.id;
            set((state) => ({
              deskRows: state.deskRows.map((row) =>
                row.id === oldOwnerRowId
                  ? {
                      ...row,
                      drawers: row.drawers.map((d) => ({
                        ...d,
                        entries: d.entries.filter((e) => e.id !== prevEntryId),
                        updated_at: nowIso,
                      })),
                      updated_at: nowIso,
                    }
                  : row
              ),
            }));
            triggerDeskRowSync(oldOwnerRowId);
          }
        }

        // 1. 確保目標 drawer 存在 + 它的 row 存在
        const targetRowId = deskRowIdForDrawer(drawerId);
        if (!targetRowId) return null;

        // 2. 建新 entry + 互寫 ID
        const newEntryId = generateId();
        let finalRowId = targetRowId;
        set((state) => ({
          records: state.records.map((r) =>
            r.id === recordId ? { ...r, desk_entry_id: newEntryId, updated_at: nowIso } : r
          ),
          deskRows: state.deskRows.map((row) => {
            if (row.id !== targetRowId) return row;
            const drawer = row.drawers.find((d) => d.id === drawerId);
            if (!drawer) return row;
            return {
              ...row,
              drawers: row.drawers.map((d) =>
                d.id === drawerId
                  ? {
                      ...d,
                      entries: [
                        ...d.entries,
                        {
                          id: newEntryId,
                          text: record.text,
                          created_at: record.created_at,
                          updated_at: nowIso,
                          record_id: record.id,
                        },
                      ],
                      updated_at: nowIso,
                    }
                  : d
              ),
              updated_at: nowIso,
            };
          }),
        }));

        // 3. push
        const finalRecord = get().records.find((r) => r.id === recordId);
        if (finalRecord) triggerAutoSync((sync) => sync?.pushRecord(finalRecord));
        triggerDeskRowSync(finalRowId);

        return {
          id: newEntryId,
          text: record.text,
          created_at: record.created_at,
          updated_at: nowIso,
          record_id: record.id,
        };
      },

      unbindRecordFromDesk: (recordId) => {
        const nowIso = new Date().toISOString();
        const record = get().records.find((r) => r.id === recordId);
        if (!record?.desk_entry_id) return;

        const entryId = record.desk_entry_id;
        // 找到 entry 所在位置
        const ownerRow = get().deskRows.find((row) =>
          row.drawers.some((d) => d.entries.some((e) => e.id === entryId))
        );

        set((state) => {
          let deskRows = state.deskRows;
          if (ownerRow) {
            deskRows = state.deskRows.map((row) =>
              row.id === ownerRow.id
                ? {
                    ...row,
                    drawers: row.drawers.map((d) => ({
                      ...d,
                      entries: d.entries.filter((e) => e.id !== entryId),
                      updated_at: nowIso,
                    })),
                    updated_at: nowIso,
                  }
                : row
            );
          }
          return {
            records: state.records.map((r) =>
              r.id === recordId ? { ...r, desk_entry_id: null, updated_at: nowIso } : r
            ),
            deskRows,
          };
        });

        if (ownerRow) triggerDeskRowSync(ownerRow.id);
        const finalRecord = get().records.find((r) => r.id === recordId);
        if (finalRecord) triggerAutoSync((sync) => sync?.pushRecord(finalRecord));
      },

      createDrawerFromRecord: (recordId, customTitle) => {
        const record = get().records.find((r) => r.id === recordId);
        if (!record) return null;

        // 若已綁定舊抽屜，先解綁
        if (record.desk_entry_id) {
          get().unbindRecordFromDesk(record.id);
        }

        const nowIso = new Date().toISOString();
        const dateKey = getLocalDateKey(record.created_at);
        const row = get().ensureDeskRowForDate(dateKey);

        const firstLine = record.text.trim().split('\n')[0] || '新抽屜';
        const title = customTitle?.trim() || (firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine);

        const newDrawerId = generateId();
        const newEntryId = generateId();

        const newEntry: DeskEntry = {
          id: newEntryId,
          text: record.text,
          created_at: record.created_at,
          updated_at: nowIso,
          record_id: record.id,
        };

        const newDrawer: DeskDrawer = {
          id: newDrawerId,
          title,
          entries: [newEntry],
          created_at: record.created_at,
          updated_at: nowIso,
        };

        set((state) => ({
          records: state.records.map((r) =>
            r.id === record.id ? { ...r, desk_entry_id: newEntryId, updated_at: nowIso } : r
          ),
          deskRows: state.deskRows.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  drawers: [...r.drawers, newDrawer],
                  updated_at: nowIso,
                }
              : r
          ),
        }));

        const finalRecord = get().records.find((r) => r.id === record.id);
        if (finalRecord) triggerAutoSync((sync) => sync?.pushRecord(finalRecord));
        triggerDeskRowSync(row.id);

        get().toggleDeskDrawer(newDrawerId, true);
        return newDrawer;
      },
    }),
    {
      // v3 prevents previously persisted development fixtures from leaking
      // into a production APK after upgrading from the prototype build.
      name: 'flow-01-storage-v3',
      // v7：K5 移除了 'widgets' Tab。老版本 localStorage 可能持久化过
      // activeTab: 'widgets'，反序列化后所有渲染分支都不匹配 → 白屏。
      // migrate 负责把非法 activeTab 兜底回 'record'，故必须 bump 版本号。
      version: 7,
      // K9：单 key 承载全量数据，图片/语音以 base64 内嵌，接近 8MB 本地预算时
      // 原实现会静默丢数据。quotaSafeStorage 在超配额时逐级剥离附件保住元数据。
      // quotaSafeStorage 是泛型工厂：显式指定持久化形状，无需在此强转。
      storage: createQuotaSafeStorage<PersistedFlowState>(),
      // 白名单持久化：排除全部 action 与瞬时交互态（activeBranchParentId /
      // activeQuoteRecordId / quickSelectedThreadId / highlightRecordId /
      // threadDetailReturnContext）。字段集合变化不影响已存数据结构 → 无需 bump version。
      //
      // 注意 partialize 只管「写」，读回来要靠下面的 merge 过滤（老用户已 v7，migrate 不会跑）。
      partialize: selectPersistedState,
      migrate: (persistedState) => normalizePersistedState(persistedState),
      // 关键：光有 migrate 不够 —— migrate 只在 version 不等时跑。老用户已经是 v7，
      // 其 localStorage 里可能仍残留旧实现写入的瞬时交互态；靠 merge 在**每次**
      // rehydrate 时过滤，才能保证这类脏字段不会被读回 store。
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedState(persistedState),
      }),
    } satisfies PersistOptions<FlowState, PersistedFlowState>
  )
);
