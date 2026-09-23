import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Pencil,
  Plus,
  Rows3,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { getLocalDateKey, formatTime } from '../utils/dateUtils';
import { ConfirmDeleteModal } from '../components/modals/ConfirmDeleteModal';
import type { DeskDrawer, DeskEdgeRow } from '../types';

type PendingDelete =
  | { kind: 'drawer'; drawer: DeskDrawer }
  | { kind: 'entry'; drawerId: string; entryId: string };

type UndoState =
  | { kind: 'drawer'; rowId: string; drawer: DeskDrawer; index: number; label: string }
  | { kind: 'entry'; drawerId: string; entry: DeskDrawer['entries'][number]; index: number; label: string };

interface DaySection {
  dateKey: string; // yyyy-MM-dd
  title: string; // 顯示用的標題，自動或手動
  rowIds: string[]; // 包含這個日期的所有 row id
  drawers: { rowId: string; drawer: DeskDrawer }[];
  hasManualTitle: boolean;
}

function deskRowTitleForDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateKey;
  return `${y}年${m}月${d}日`;
}

function rowAutoDateKey(row: DeskEdgeRow): string {
  // Row 就是日期容器，日期由 row.created_at 決定，永不變
  return getLocalDateKey(row.created_at);
}

function latestEntryText(drawer: DeskDrawer): string {
  const last = drawer.entries[drawer.entries.length - 1];
  return last ? last.text : '';
}

export function DeskEdgeView() {
  const rows = useFlowStore((s) => s.deskRows);
  const records = useFlowStore((s) => s.records);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const ensureDeskRowForDate = useFlowStore((s) => s.ensureDeskRowForDate);
  const updateDeskRowTitle = useFlowStore((s) => s.updateDeskRowTitle);
  const addDeskDrawer = useFlowStore((s) => s.addDeskDrawer);
  const updateDeskDrawerTitle = useFlowStore((s) => s.updateDeskDrawerTitle);
  const deleteDeskDrawer = useFlowStore((s) => s.deleteDeskDrawer);
  const addDeskEntry = useFlowStore((s) => s.addDeskEntry);
  const updateDeskEntry = useFlowStore((s) => s.updateDeskEntry);
  const deleteDeskEntry = useFlowStore((s) => s.deleteDeskEntry);
  const restoreDeskDrawer = useFlowStore((s) => s.restoreDeskDrawer);
  const restoreDeskEntry = useFlowStore((s) => s.restoreDeskEntry);
  const toggleDeskDrawer = useFlowStore((s) => s.toggleDeskDrawer);
  const toggleDeskDrawerDimmed = useFlowStore((s) => s.toggleDeskDrawerDimmed);
  const toggleCompletedRecord = useFlowStore((s) => s.toggleCompletedRecord);

  const todayKey = getLocalDateKey(new Date().toISOString());
  const [editingDrawerId, setEditingDrawerId] = useState<string | null>(null);
  const [drawerDraft, setDrawerDraft] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState('');
  const [editingEntryKey, setEditingEntryKey] = useState<{ drawerId: string; entryId: string } | null>(null);
  const [entryDraft, setEntryDraft] = useState('');
  const [drawerDrafts, setDrawerDrafts] = useState<Record<string, string>>({});
  const drawerInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // 聚合：把所有 rows 的 drawers 按日期分組
  const daySections: DaySection[] = useMemo(() => {
    const byDate = new Map<string, DaySection>();

    rows.forEach((row) => {
      const dateKey = rowAutoDateKey(row);
      const autoTitle = deskRowTitleForDate(dateKey);
      const hasManualTitle = row.title !== autoTitle;

      let section = byDate.get(dateKey);
      if (!section) {
        section = {
          dateKey,
          title: autoTitle,
          rowIds: [],
          drawers: [],
          hasManualTitle: false,
        };
        byDate.set(dateKey, section);
      }
      section.rowIds.push(row.id);
      section.hasManualTitle = section.hasManualTitle || hasManualTitle;
      if (hasManualTitle && section.title === autoTitle) {
        // 若該日期有任何 row 手動改過標題，用第一個手動的（簡化策略）
        section.title = row.title;
      }

      row.drawers.forEach((drawer) => {
        section!.drawers.push({ rowId: row.id, drawer });
      });
    });

    // 倒序：今天在最上；同時過濾掉空 row 產生的「0 個抽屜」空段落
    return Array.from(byDate.values())
      .filter((s) => s.drawers.length > 0)
      .sort((a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime());
  }, [rows]);

  // record.is_completed 狀態查詢表
  const recordIsCompletedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    records.forEach((r) => {
      map.set(r.id, Boolean(r.is_completed));
    });
    return map;
  }, [records]);

  // drawer 級：是否所有 entries 對應的 records 都已完成
  const drawerAllCompletedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    daySections.forEach((section) => {
      section.drawers.forEach(({ drawer }) => {
        if (drawer.entries.length === 0) return;
        const allDone = drawer.entries.every(
          (e) => e.record_id && recordIsCompletedMap.get(e.record_id) === true
        );
        map.set(drawer.id, allDone);
      });
    });
    return map;
  }, [daySections, recordIsCompletedMap]);

  // 展開/收縮狀態（沿用既有 toggleDeskDrawer）
  const isExpanded = useMemo(() => {
    const map = new Map<string, boolean>();
    rows.forEach((row) =>
      row.drawers.forEach((drawer) => {
        const lastKey = getLocalDateKey(drawer.updated_at ?? drawer.created_at);
        const defaultExpanded = lastKey === todayKey;
        map.set(
          drawer.id,
          drawer.expanded_override_date === todayKey
            ? Boolean(drawer.expanded_override)
            : defaultExpanded
        );
      })
    );
    return map;
  }, [rows, todayKey]);

  const showUndo = (state: UndoState) => {
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    setUndoState(state);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoState(null);
      undoTimerRef.current = null;
    }, 6000);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'drawer') {
      const removed = deleteDeskDrawer(pendingDelete.drawer.id);
      if (removed) {
        showUndo({
          kind: 'drawer',
          rowId: removed.rowId,
          drawer: removed.drawer,
          index: removed.index,
          label: `已删除抽屉「${removed.drawer.title}」`,
        });
      }
    } else {
      const removed = deleteDeskEntry(pendingDelete.drawerId, pendingDelete.entryId);
      if (removed) {
        showUndo({
          kind: 'entry',
          drawerId: removed.drawerId,
          entry: removed.entry,
          index: removed.index,
          label: '已删除文字',
        });
      }
    }
  };

  const handleUndoDelete = () => {
    if (!undoState) return;
    if (undoState.kind === 'drawer') {
      restoreDeskDrawer(undoState.rowId, undoState.drawer, undoState.index);
    } else {
      const ok = restoreDeskEntry(undoState.drawerId, undoState.entry, undoState.index);
      if (!ok) {
        if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
        setUndoState({ ...undoState, label: '所在抽屉已被删除，无法撤销' });
        undoTimerRef.current = window.setTimeout(() => {
          setUndoState(null);
          undoTimerRef.current = null;
        }, 4000);
        return;
      }
    }
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoState(null);
  };

  const handleAddDrawerToToday = () => {
    const row = ensureDeskRowForDate(todayKey);
    const drawer = addDeskDrawer(row.id);
    if (drawer) toggleDeskDrawer(drawer.id, true);
  };

  const handleAddDrawerToSection = (section: DaySection) => {
    const row = ensureDeskRowForDate(section.dateKey);
    const drawer = addDeskDrawer(row.id);
    if (drawer) toggleDeskDrawer(drawer.id, true);
  };

  const handleSectionTitleClick = (section: DaySection) => {
    const rowId = section.rowIds[0]; // 取該日期第一個 row 來編輯
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setEditingRowId(row.id);
    setRowDraft(row.title);
  };

  const saveSectionTitle = (rowId: string) => {
    updateDeskRowTitle(rowId, rowDraft);
    setEditingRowId(null);
  };

  const handleAddEntry = (drawerId: string) => {
    addDeskEntry(drawerId, drawerDrafts[drawerId] ?? '');
    setDrawerDrafts((prev) => ({ ...prev, [drawerId]: '' }));
  };

  const saveEditingDrawer = (drawerId: string) => {
    updateDeskDrawerTitle(drawerId, drawerDraft);
    setEditingDrawerId(null);
  };

  const startEditingEntry = (drawerId: string, entryId: string, text: string) => {
    setEditingEntryKey({ drawerId, entryId });
    setEntryDraft(text);
  };

  const saveEditingEntry = () => {
    if (!editingEntryKey) return;
    updateDeskEntry(editingEntryKey.drawerId, editingEntryKey.entryId, entryDraft);
    setEditingEntryKey(null);
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f7faf8]">
        <header className="shrink-0 border-b border-emerald-100 bg-white px-3 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('record')}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                title="返回記錄頁"
                aria-label="返回記錄頁"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
                  <Rows3 className="h-4 w-4 text-emerald-600" />
                  桌邊抽屜
                </h2>
                <p className="truncate text-[11px] text-gray-500">按日期自動聚合 · 新增抽屜即同步時間流</p>
              </div>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-white shadow-sm text-emerald-600">
              <Rows3 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-gray-700">還沒有抽屜</p>
            <p className="max-w-xs text-xs leading-5 text-gray-400">
              點下方按鈕建立第一個抽屜，抽屜裡的文字會自動同步到時間流。
            </p>
            <button
              type="button"
              onClick={handleAddDrawerToToday}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Plus className="h-4 w-4" />
              今天新增抽屜
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7faf8]">
      {/* Header */}
      <header className="shrink-0 border-b border-emerald-100 bg-white px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('record')}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              title="返回記錄頁"
              aria-label="返回記錄頁"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
                <Rows3 className="h-4 w-4 text-emerald-600" />
                桌邊抽屜
              </h2>
              <p className="truncate text-[11px] text-gray-500">按日期自動聚合 · 抽屜 ↔ 時間流同步</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddDrawerToToday}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" />
            今天新增抽屜
          </button>
        </div>
      </header>

      {/* Main scroll area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-8 sm:p-5 space-y-6">
        {daySections.map((section) => {
          const totalDrawers = section.drawers.length;
          return (
            <section key={section.dateKey} className="space-y-3">
              {/* Section header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {editingRowId === section.rowIds[0] ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <input
                        value={rowDraft}
                        onChange={(e) => setRowDraft(e.target.value)}
                        className="min-w-0 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm text-gray-900 focus:border-emerald-300 focus:outline-none"
                        aria-label="日期段落名稱"
                      />
                      <button
                        type="button"
                        onClick={() => saveSectionTitle(section.rowIds[0])}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                        aria-label="儲存名稱"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRowId(null)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                        aria-label="取消編輯"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSectionTitleClick(section)}
                      className="group flex min-w-0 items-center gap-1 text-left"
                      title="點擊編輯日期段落名稱"
                    >
                      <span className="text-sm font-semibold text-gray-900">{section.title}</span>
                      <Pencil className="h-3 w-3 shrink-0 text-gray-300 transition-colors group-hover:text-emerald-600" />
                    </button>
                  )}
                  <span className="shrink-0 text-[11px] text-gray-400">{totalDrawers} 個抽屜</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddDrawerToSection(section)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus className="h-3 w-3" />
                  新增抽屜
                </button>
              </div>

              {/* Drawers horizontal snap list */}
              {section.drawers.length > 0 && (
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-2 snap-x snap-mandatory">
                    {section.drawers.map(({ drawer }) => {
                      const expanded = Boolean(isExpanded.get(drawer.id));
                      const allDone = Boolean(drawerAllCompletedMap.get(drawer.id));
                      const hasAny = drawer.entries.some((e) => e.record_id && recordIsCompletedMap.get(e.record_id));
                      const dimmed = allDone && drawer.entries.length > 0;

                      return (
                        <button
                          key={drawer.id}
                          type="button"
                          onClick={() => {
                            // 互斥由 store 的 toggleDeskDrawer 全範圍處理，這裡只傳當前切換值
                            toggleDeskDrawer(drawer.id, !expanded);
                          }}
                          className={`group flex min-w-[132px] max-w-[180px] shrink-0 snap-start flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                            dimmed
                              ? 'border-slate-200 bg-slate-100 text-slate-500 opacity-75'
                              : expanded
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-emerald-200/70 bg-emerald-50/60 text-emerald-900/70 opacity-75'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold">{drawer.title}</span>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {/* 抽屜級 tick */}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleDeskDrawerDimmed(drawer.id);
                                }}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                                  allDone && drawer.entries.length > 0
                                    ? 'bg-emerald-500 text-white'
                                    : 'text-emerald-700/70 hover:bg-white/70 hover:text-emerald-900'
                                }`}
                                title={allDone ? '取消全部完成' : '全部標記完成'}
                                aria-label={allDone ? '取消全部完成' : '全部標記完成'}
                              >
                                {allDone && drawer.entries.length > 0 ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <Square className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 text-emerald-600 transition-transform ${expanded ? 'rotate-90' : ''}`}
                              />
                            </span>
                          </span>
                          <span
                            className={`line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-snug ${
                              dimmed
                                ? 'text-slate-500'
                                : expanded
                                ? 'text-emerald-800'
                                : 'text-emerald-900/50'
                            }`}
                          >
                            {latestEntryText(drawer) || '空抽屜'}
                          </span>
                          {drawer.entries.length > 0 && (
                            <span className="text-[10px] font-mono text-gray-400">{drawer.entries.length} 條</span>
                          )}
                          {hasAny && !allDone && (
                            <span className="text-[10px] font-mono text-emerald-500">⏳ 部分完成</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expanded drawer detail panels */}
              {section.drawers
                .filter(({ drawer }) => isExpanded.get(drawer.id))
                .map(({ drawer }) => {
                  const isEditingDr = editingDrawerId === drawer.id;
                  const allDone = drawerAllCompletedMap.get(drawer.id);
                  return (
                    <section
                      key={drawer.id}
                      className={`mt-1 overflow-hidden rounded-xl border bg-white/60 ${
                        drawerAllCompletedMap.get(drawer.id) && drawer.entries.length > 0
                          ? 'border-slate-200/80 bg-slate-100/70 text-slate-500'
                          : 'border-emerald-200 bg-emerald-50/70'
                      }`}
                    >
                      {/* Drawer header: title editing + tick + collapse + delete */}
                      <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200/70 px-3 py-2.5">
                        {isEditingDr ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input
                              value={drawerDraft}
                              onChange={(e) => setDrawerDraft(e.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none"
                              aria-label="抽屜名稱"
                            />
                            <button
                              type="button"
                              onClick={() => saveEditingDrawer(drawer.id)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100"
                              aria-label="儲存抽屜名稱"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDrawerId(null)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                              aria-label="取消編輯"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDrawerId(drawer.id);
                              setDrawerDraft(drawer.title);
                            }}
                            className="group flex min-w-0 flex-1 items-center gap-1 text-left"
                            title="編輯抽屜名稱"
                          >
                            <span className={`truncate text-sm font-semibold ${allDone ? 'text-slate-500' : 'text-emerald-900'}`}>{drawer.title}</span>
                            <Pencil className={`h-3.5 w-3.5 shrink-0 ${allDone ? 'text-slate-300 group-hover:text-slate-500' : 'text-emerald-300 group-hover:text-emerald-600'}`} />
                          </button>
                        )}
                        {/* 抽屜級 tick（展開面板內） */}
                        <button
                          type="button"
                          onClick={() => toggleDeskDrawerDimmed(drawer.id)}
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            allDone && drawer.entries.length > 0
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                              : 'text-emerald-700 hover:bg-emerald-100'
                          }`}
                          title={allDone ? '取消全部完成' : '全部標記完成'}
                          aria-label={allDone ? '取消全部完成' : '全部標記完成'}
                        >
                          {allDone && drawer.entries.length > 0 ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDeskDrawer(drawer.id, false)}
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-xs text-emerald-700 hover:bg-emerald-100"
                        >
                          收縮
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ kind: 'drawer', drawer })}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="刪除抽屜"
                          aria-label="刪除抽屜"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Entries list */}
                      <div className="space-y-2 p-3">
                        {drawer.entries.length === 0 ? (
                          <p className="text-xs text-emerald-800/60">這個抽屜還沒有文字，直接在下方新增。</p>
                        ) : (
                          drawer.entries.map((entry) => {
                            const isEditingEntry =
                              editingEntryKey?.drawerId === drawer.id && editingEntryKey.entryId === entry.id;
                            const entryDone = entry.record_id ? recordIsCompletedMap.get(entry.record_id) === true : false;

                            if (isEditingEntry) {
                              return (
                                <div key={entry.id} className="rounded-xl border border-emerald-200 bg-white p-2">
                                  <textarea
                                    value={entryDraft}
                                    onChange={(e) => setEntryDraft(e.target.value)}
                                    rows={2}
                                    className="w-full resize-none rounded-lg bg-transparent px-1 py-1 text-sm text-gray-800 focus:outline-none"
                                    aria-label="編輯文字內容"
                                  />
                                  <div className="flex justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={saveEditingEntry}
                                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700"
                                    >
                                      儲存
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingEntryKey(null)}
                                      className="inline-flex h-7 items-center rounded-lg px-2 text-xs text-gray-500 hover:bg-gray-100"
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={entry.id}
                                className={`group rounded-xl border bg-white/80 p-2.5 transition-colors ${
                                  entryDone
                                    ? 'border-emerald-200/50 bg-emerald-50/30'
                                    : 'border-emerald-200/70 bg-white/80'
                                }`}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {/* 條目級 tick：只有 record 真存在於 store 才顯示（防止 R2 時序或級聯刪除後的孤兒 entry） */}
                                    {entry.record_id && recordIsCompletedMap.has(entry.record_id) && (
                                      <button
                                        type="button"
                                        onClick={() => toggleCompletedRecord(entry.record_id!)}
                                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                                          entryDone
                                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                            : 'border border-emerald-300 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
                                        }`}
                                        title={entryDone ? '取消完成' : '標記完成'}
                                        aria-label={entryDone ? '取消完成' : '標記完成'}
                                      >
                                        {entryDone ? <Check className="h-3 w-3" /> : null}
                                      </button>
                                    )}
                                    <span className={`font-mono text-[10px] ${entryDone ? 'text-emerald-400' : 'text-emerald-800/50'}`}>
                                      {formatTime(entry.created_at)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditingEntry(drawer.id, entry.id, entry.text)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                                      title="編輯文字"
                                      aria-label="編輯文字"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPendingDelete({
                                          kind: 'entry',
                                          drawerId: drawer.id,
                                          entryId: entry.id,
                                        })
                                      }
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                                      title="刪除文字（同時解綁時間流記錄）"
                                      aria-label="刪除文字"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed ${
                                  entryDone ? 'text-gray-400 line-through' : 'text-gray-800'
                                }`}>
                                  {entry.text}
                                </p>
                              </div>
                            );
                          })
                        )}

                        {/* 新增 entry */}
                        <div className="pt-1">
                          <div className="flex items-end gap-2">
                            <textarea
                              ref={(el) => {
                                drawerInputRefs.current[drawer.id] = el;
                              }}
                              value={drawerDrafts[drawer.id] ?? ''}
                              onChange={(e) =>
                                setDrawerDrafts((prev) => ({ ...prev, [drawer.id]: e.target.value }))
                              }
                              placeholder="繼續在這個抽屜新增文字..."
                              rows={2}
                              className="min-h-12 flex-1 resize-none rounded-lg border border-emerald-200 bg-white/90 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddEntry(drawer.id)}
                              className="inline-flex h-12 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              新增
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })}
            </section>
          );
        })}

        {daySections.length === 0 && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center py-20">
            <p className="text-sm font-medium text-gray-500">點上方「今天新增抽屜」建立第一個抽屜</p>
          </div>
        )}
      </div>

      {/* Undo toast */}
      {undoState && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-4 bottom-6 z-40 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-2.5 text-xs text-white shadow-xl"
        >
          <span className="min-w-0 truncate">{undoState.label}</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-amber-300 transition-colors hover:bg-white/10 hover:text-amber-200"
          >
            撤销
          </button>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={
          pendingDelete?.kind === 'drawer'
            ? '确定要删除这个抽屉吗？'
            : '确定要删除这条文字吗？'
        }
        description={
          pendingDelete?.kind === 'drawer'
            ? '该抽屉中的所有文字会从桌邊移除，對應的時間流記錄會解綁保留（仍在時間流裡可見，但不再標記為桌邊來源）。'
            : '對應的時間流記錄會解綁保留（仍在時間流裡可見）。'
        }
        recordText={
          pendingDelete?.kind === 'drawer'
            ? pendingDelete.drawer.title
            : undefined
        }
        hasChildren={pendingDelete?.kind === 'drawer' && pendingDelete.drawer.entries.length > 0}
        childWarning={
          pendingDelete?.kind === 'drawer' && pendingDelete.drawer.entries.length > 0
            ? `⚠️ 注意：该抽屉下的 ${pendingDelete.drawer.entries.length} 条文字会一并从桌邊移除（時間流記錄保留）。`
            : undefined
        }
      />
    </div>
  );
}
