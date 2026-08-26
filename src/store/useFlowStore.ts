import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RecordItem, TagItem, ThreadItem, EnrichedRecordItem } from '../types';
import { generateId } from '../utils/dateUtils';
import { createR2SyncService } from '../sync';
import { loadR2Settings } from '../sync/credentials';

function triggerAutoSync(action: (sync: ReturnType<typeof createR2SyncService>) => Promise<void> | void) {
  if (!loadR2Settings().enabled) return;
  const sync = createR2SyncService();
  if (!sync) return;
  try {
    const res = action(sync);
    if (res instanceof Promise) {
      res.catch(() => {});
    }
  } catch {
    // ignore
  }
}

interface FlowState {
  records: RecordItem[];
  tags: TagItem[];
  threads: ThreadItem[];

  // Navigation & UI state
  activeTab: 'record' | 'review' | 'thread-detail' | 'widgets';
  selectedThreadId: string | null;
  selectedDate: string | null; // filter date in RecordView (null = default today)
  fromReviewDate: boolean; // 是否从回顾页点击某日期跳转而来
  fromThreadDetailId: string | null; // 是否从思维线详情页点击某记录跳转而来

  // Interaction state
  activeBranchParentId: string | null; // 正在分支的父记录 ID
  quickSelectedThreadId: string | null; // 底部快捷胶囊选中的思维线 ID

  // Actions for Records
  addRecord: (text: string, options?: { parent_id?: string | null; tag_id?: string | null; thread_id?: string | null }) => RecordItem;
  updateRecord: (id: string, updates: Partial<Pick<RecordItem, 'tag_id' | 'thread_id' | 'text'>>) => void;
  deleteRecord: (id: string) => void;

  // Actions for Threads
  createThread: (title: string) => ThreadItem;
  getRecentThreads: (limit?: number) => ThreadItem[];
  searchThreads: (query: string) => ThreadItem[];
  getThreadRecords: (threadId: string) => EnrichedRecordItem[];

  // Actions for Tags
  createTag: (name: string, color?: string) => TagItem;
  deleteTag: (id: string) => void;
  getTagRecords: (tagId: string) => EnrichedRecordItem[];

  // Navigation actions
  setActiveTab: (tab: 'record' | 'review' | 'thread-detail' | 'widgets') => void;
  openThreadDetail: (threadId: string) => void;
  openDateRecord: (dateStr: string) => void;
  openDateRecordFromThread: (dateStr: string, threadId: string) => void;
  backToReview: () => void;
  backToThreadDetail: () => void;
  resetToTodayRecord: () => void;
  setActiveBranchParentId: (id: string | null) => void;
  setQuickSelectedThreadId: (id: string | null) => void;
  setSelectedDate: (date: string | null) => void;
  resetToDefaultData: () => void;
}

// Initial Mock Seed Data
const initialTags: TagItem[] = [
  { id: 'tag_1', name: '情绪化', color: '#F87171' }, // Red-400
  { id: 'tag_2', name: '跟风', color: '#FB923C' },   // Orange-400
  { id: 'tag_3', name: '认真规划', color: '#34D399' }, // Emerald-400
  { id: 'tag_4', name: '随想', color: '#818CF8' },   // Indigo-400
  { id: 'tag_5', name: '工作复盘', color: '#60A5FA' }, // Blue-400
  { id: 'tag_6', name: '灵感火花', color: '#F472B6' }, // Pink-400
];

const initialThreads: ThreadItem[] = [
  {
    id: 'thread_concert',
    title: '演唱会',
    created_at: '2026-08-26T09:40:00.000Z',
    last_used_at: '2026-10-04T18:30:00.000Z',
  },
  {
    id: 'thread_japanese',
    title: '学日语',
    created_at: '2026-07-10T10:00:00.000Z',
    last_used_at: '2026-08-26T08:30:00.000Z',
  },
  {
    id: 'thread_career',
    title: '要不要辞职',
    created_at: '2026-08-01T15:00:00.000Z',
    last_used_at: '2026-08-25T21:00:00.000Z',
  },
  {
    id: 'thread_side_project',
    title: '副业计划',
    created_at: '2026-08-15T12:00:00.000Z',
    last_used_at: '2026-08-24T14:15:00.000Z',
  },
  {
    id: 'thread_reading',
    title: '深度阅读',
    created_at: '2026-08-10T09:00:00.000Z',
    last_used_at: '2026-08-22T19:00:00.000Z',
  },
  {
    id: 'thread_fitness',
    title: '跑步健身',
    created_at: '2026-07-20T07:00:00.000Z',
    last_used_at: '2026-08-20T06:30:00.000Z',
  },
];

const initialRecords: RecordItem[] = [
  // 8月26日 (Today) 主场景
  {
    id: 'rec_1',
    text: '先随便记记，今天感觉一般',
    created_at: '2026-08-26T09:12:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: null,
  },
  {
    id: 'rec_2',
    text: '10月3日去看演唱会',
    created_at: '2026-08-26T09:40:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: 'thread_concert',
  },
  {
    id: 'rec_3',
    text: '因为B更快能看到效果',
    created_at: '2026-08-26T10:05:00.000Z',
    parent_id: 'rec_2',
    tag_id: null,
    thread_id: null,
  },
  {
    id: 'rec_4',
    text: '那就先定第一步',
    created_at: '2026-08-26T10:40:00.000Z',
    parent_id: 'rec_3',
    tag_id: null,
    thread_id: null,
  },
  {
    id: 'rec_5',
    text: '不过也可能三分钟热度',
    created_at: '2026-08-26T10:20:00.000Z',
    parent_id: 'rec_2',
    tag_id: 'tag_1', // [情绪化]
    thread_id: null,
  },
  {
    id: 'rec_6',
    text: '中午又觉得A也没那么差',
    created_at: '2026-08-26T11:15:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: null,
  },
  {
    id: 'rec_7',
    text: '下午抽空背了20个单词，感觉还行',
    created_at: '2026-08-26T16:20:00.000Z',
    parent_id: null,
    tag_id: 'tag_3', // [认真规划]
    thread_id: 'thread_japanese',
  },

  // 跨时间思维线记录 (演示演唱会从期待到现场回顾)
  {
    id: 'rec_c2',
    text: '开始期待演唱会了。',
    created_at: '2026-09-12T14:30:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: 'thread_concert',
  },
  {
    id: 'rec_c3',
    text: '今天真的去看了。',
    created_at: '2026-10-03T20:00:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: 'thread_concert',
  },
  {
    id: 'rec_c4',
    text: '现场比我想象中差一点。',
    created_at: '2026-10-04T18:30:00.000Z',
    parent_id: null,
    tag_id: null,
    thread_id: 'thread_concert',
  },

  // 历史记录 (供回顾页展示)
  {
    id: 'rec_past_1',
    text: '想换方向做B',
    created_at: '2026-08-19T09:40:00.000Z',
    parent_id: null,
    tag_id: 'tag_2', // [跟风]
    thread_id: 'thread_side_project',
  },
  {
    id: 'rec_past_fit',
    text: '早起晨跑5公里，出了一身汗很爽',
    created_at: '2026-08-20T06:30:00.000Z',
    parent_id: null,
    tag_id: 'tag_4', // [随想]
    thread_id: 'thread_fitness',
  },
  {
    id: 'rec_past_2',
    text: '看到朋友做副业月入几万',
    created_at: '2026-08-21T21:02:00.000Z',
    parent_id: null,
    tag_id: 'tag_2', // [跟风]
    thread_id: 'thread_side_project',
  },
  {
    id: 'rec_past_read',
    text: '读完《原则》第一部分，关于现实与沉淀的思考',
    created_at: '2026-08-22T19:00:00.000Z',
    parent_id: null,
    tag_id: 'tag_5', // [工作复盘]
    thread_id: 'thread_reading',
  },
  {
    id: 'rec_past_3',
    text: '又想换方向了，还是得脚踏实地',
    created_at: '2026-08-24T14:15:00.000Z',
    parent_id: null,
    tag_id: 'tag_2', // [跟风]
    thread_id: 'thread_side_project',
  },
  {
    id: 'rec_past_4',
    text: '跟领导提了调岗的想法，等答复',
    created_at: '2026-08-25T17:30:00.000Z',
    parent_id: null,
    tag_id: 'tag_3', // [认真规划]
    thread_id: 'thread_career',
  },
];

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      records: initialRecords,
      tags: initialTags,
      threads: initialThreads,

      activeTab: 'record',
      selectedThreadId: null,
      selectedDate: null,
      fromReviewDate: false,
      fromThreadDetailId: null,
      activeBranchParentId: null,
      quickSelectedThreadId: null,

      addRecord: (text, options = {}) => {
        const nowIso = new Date().toISOString();
        const threadId = options.thread_id || null;

        const newRecord: RecordItem = {
          id: generateId(),
          text: text.trim(),
          created_at: nowIso,
          parent_id: options.parent_id || null,
          tag_id: options.tag_id || null,
          thread_id: threadId,
        };

        set((state) => {
          let updatedThreads = state.threads;
          if (threadId) {
            updatedThreads = state.threads.map((th) =>
              th.id === threadId ? { ...th, last_used_at: nowIso } : th
            );
          }

          return {
            records: [...state.records, newRecord],
            threads: updatedThreads,
            activeBranchParentId: null,
            quickSelectedThreadId: null,
          };
        });

        triggerAutoSync((sync) => sync?.pushRecord(newRecord));

        return newRecord;
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
              updatedRecord = { ...r, ...updates };
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
      },

      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((r) => r.id !== id && r.parent_id !== id),
        }));

        triggerAutoSync((sync) => sync?.deleteRecord(id));
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
        const newTag: TagItem = {
          id: generateId(),
          name: name.trim(),
          color,
        };
        set((state) => ({
          tags: [...state.tags, newTag],
        }));
        triggerAutoSync((sync) => sync?.pushTag(newTag));
        return newTag;
      },

      deleteTag: (id) => {
        set((state) => ({
          tags: state.tags.filter((t) => t.id !== id),
          records: state.records.map((r) => (r.tag_id === id ? { ...r, tag_id: null } : r)),
        }));
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
          ...(tab === 'record' ? { selectedDate: null, fromReviewDate: false, fromThreadDetailId: null } : {}),
        });
      },

      openThreadDetail: (threadId) => {
        set({
          activeTab: 'thread-detail',
          selectedThreadId: threadId,
        });
      },

      openDateRecord: (dateStr) => {
        set({
          activeTab: 'record',
          selectedDate: dateStr,
          fromReviewDate: true,
          fromThreadDetailId: null,
        });
      },

      openDateRecordFromThread: (dateStr, threadId) => {
        set({
          activeTab: 'record',
          selectedDate: dateStr,
          fromReviewDate: false,
          fromThreadDetailId: threadId,
        });
      },

      backToReview: () => {
        set({
          activeTab: 'review',
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
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
          });
        } else {
          set({
            activeTab: 'review',
            selectedDate: null,
            fromReviewDate: false,
            fromThreadDetailId: null,
          });
        }
      },

      resetToTodayRecord: () => {
        set({
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
        });
      },

      setActiveBranchParentId: (id) => set({ activeBranchParentId: id }),

      setQuickSelectedThreadId: (id) =>
        set((state) => ({
          quickSelectedThreadId: state.quickSelectedThreadId === id ? null : id,
        })),

      setSelectedDate: (date) => set({ selectedDate: date }),

      resetToDefaultData: () => {
        set({
          records: initialRecords,
          tags: initialTags,
          threads: initialThreads,
          activeBranchParentId: null,
          quickSelectedThreadId: null,
          selectedThreadId: null,
          selectedDate: null,
          fromReviewDate: false,
          fromThreadDetailId: null,
        });
      },
    }),
    {
      name: 'flow-01-storage-v2',
    }
  )
);
