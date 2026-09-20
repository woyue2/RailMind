import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
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
import { quotaSafeStorage } from './quotaSafeStorage';

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
  updateDeskRowTitle: (rowId: string, title: string) => void;
  deleteDeskRow: (rowId: string) => DeskEdgeRow | null;
  restoreDeskRow: (row: DeskEdgeRow) => void;
  addDeskDrawer: (rowId: string) => DeskDrawer;
  updateDeskDrawerTitle: (drawerId: string, title: string) => void;
  deleteDeskDrawer: (drawerId: string) => { rowId: string; drawer: DeskDrawer; index: number } | null;
  restoreDeskDrawer: (rowId: string, drawer: DeskDrawer, index: number) => void;
  addDeskEntry: (drawerId: string, text: string) => void;
  updateDeskEntry: (drawerId: string, entryId: string, text: string) => void;
  deleteDeskEntry: (drawerId: string, entryId: string) => { drawerId: string; entry: DeskEntry; index: number } | null;
  restoreDeskEntry: (drawerId: string, entry: DeskEntry, index: number) => boolean;
  toggleDeskDrawer: (drawerId: string, expanded: boolean) => void;
  toggleDeskDrawerDimmed: (drawerId: string) => void;
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

        triggerAutoSync((sync) => sync?.pushRecord(newRecord));
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

        set((state) => ({
          records: state.records.filter((record) => !removedIds.has(record.id)),
        }));

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

        if (targetRecord) {
          triggerAutoSync((sync) => sync?.pushRecord(targetRecord!));
        }
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
        const newRow: DeskEdgeRow = {
          id: generateId(),
          title: `桌邊 ${get().deskRows.length + 1}`,
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
        const target = get().deskRows.find((row) => row.id === rowId);
        if (!target) return null;
        set((state) => ({
          deskRows: state.deskRows.filter((row) => row.id !== rowId),
        }));
        triggerDeskRowSync(rowId, true);
        return target;
      },

      restoreDeskRow: (row) => {
        // 撤销删除整行：清墓碑后再 upsert 并推送，否则同步会因 isDeleted 短路。
        set((state) =>
          state.deskRows.some((item) => item.id === row.id)
            ? { deskRows: state.deskRows.map((item) => (item.id === row.id ? row : item)) }
            : { deskRows: [...state.deskRows, row] }
        );
        removeTombstoneRecords('desk', [row.id]);
        triggerAutoSync((sync) => sync?.clearTombstones('desk', [row.id]));
        triggerDeskRowSync(row.id);
      },

      addDeskDrawer: (rowId) => {
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
        return newDrawer!;
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
        set((state) => ({
          deskRows: state.deskRows.map((row) =>
            row.id === ownerRow.id
              ? {
                  ...row,
                  drawers: row.drawers.filter((d) => d.id !== drawerId),
                  updated_at: nowIso,
                }
              : row
          ),
        }));
        // 抽屉已从 state 移除，所以 rowId 必须在删除前取，不能再用 deskRowIdForDrawer 反查。
        triggerDeskRowSync(removed.rowId);
        return removed;
      },

      restoreDeskDrawer: (rowId, drawer, index) => {
        const nowIso = new Date().toISOString();
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            if (row.id !== rowId) return row;
            if (row.drawers.some((d) => d.id === drawer.id)) return row;
            const drawers = [...row.drawers];
            drawers.splice(Math.max(0, Math.min(index, drawers.length)), 0, drawer);
            return { ...row, drawers, updated_at: nowIso };
          }),
        }));
        triggerDeskRowSync(rowId);
      },

      addDeskEntry: (drawerId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();
        const entry: DeskEntry = {
          id: generateId(),
          text: trimmed,
          created_at: nowIso,
          updated_at: nowIso,
        };
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            const drawer = row.drawers.find((d) => d.id === drawerId);
            return drawer
              ? {
                  ...row,
                  drawers: row.drawers.map((d) =>
                    d.id === drawerId
                      ? { ...d, entries: [...d.entries, entry], updated_at: nowIso }
                      : d
                  ),
                  updated_at: nowIso,
                }
              : row;
          }),
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      updateDeskEntry: (drawerId, entryId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const nowIso = new Date().toISOString();
        set((state) => ({
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
        }));
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
        set((state) => ({
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
        }));
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
        set((state) => ({
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
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
        return true;
      },

      toggleDeskDrawer: (drawerId, expanded) => {
        const nowIso = new Date().toISOString();
        const todayKey = getLocalDateKey(new Date().toISOString());
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            if (!row.drawers.some((d) => d.id === drawerId)) return row;
            return {
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
            };
          }),
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
      },

      toggleDeskDrawerDimmed: (drawerId) => {
        const nowIso = new Date().toISOString();
        set((state) => ({
          deskRows: state.deskRows.map((row) => {
            if (!row.drawers.some((d) => d.id === drawerId)) return row;
            return {
              ...row,
              drawers: row.drawers.map((d) =>
                d.id === drawerId
                  ? { ...d, is_dimmed: !d.is_dimmed, state_updated_at: nowIso }
                  : d
              ),
              state_updated_at: nowIso,
            };
          }),
        }));
        const rowId = deskRowIdForDrawer(drawerId);
        if (rowId) triggerDeskRowSync(rowId);
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
      // K9：单 key 承载全量数据，图片/语音以 base64 内嵌，接近 5MB 配额时
      // 原实现会静默丢数据。quotaSafeStorage 在超配额时逐级剥离附件保住元数据。
      storage: quotaSafeStorage as PersistStorage<FlowState>,
      // Navigation origin is session-only; keep the existing persistence behavior
      // for the rest of the store unchanged.
      partialize: (state): FlowState => ({ ...state, threadDetailReturnContext: null }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<FlowState>;
        return {
          ...state,
          threadDetailReturnContext: null,
          activeTab: VALID_TABS.includes(state.activeTab as ActiveTab)
            ? (state.activeTab as ActiveTab)
            : 'record',
          recordViewMode: state.recordViewMode ?? 'timeline',
          timelineDateHeaderBackgroundOpacity: state.timelineDateHeaderBackgroundOpacity ?? 30,
          dailyPageDateHeaderBackgroundOpacity: state.dailyPageDateHeaderBackgroundOpacity ?? 30,
          deskRows: state.deskRows ?? [],
          records: (state.records ?? []).map((record) => ({
            ...record,
            updated_at: record.updated_at ?? record.created_at,
          })),
        } as FlowState;
      },
    }
  )
);
