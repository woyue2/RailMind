import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckSquare,
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
import type { DeskDrawer, DeskEdgeRow } from '../types';

function latestEntryText(drawer: DeskDrawer): string {
  const last = drawer.entries[drawer.entries.length - 1];
  return last ? last.text : '';
}

export function DeskEdgeView() {
  const rows = useFlowStore((s) => s.deskRows);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const addDeskRow = useFlowStore((s) => s.addDeskRow);
  const updateDeskRowTitle = useFlowStore((s) => s.updateDeskRowTitle);
  const deleteDeskRow = useFlowStore((s) => s.deleteDeskRow);
  const addDeskDrawer = useFlowStore((s) => s.addDeskDrawer);
  const updateDeskDrawerTitle = useFlowStore((s) => s.updateDeskDrawerTitle);
  const deleteDeskDrawer = useFlowStore((s) => s.deleteDeskDrawer);
  const addDeskEntry = useFlowStore((s) => s.addDeskEntry);
  const updateDeskEntry = useFlowStore((s) => s.updateDeskEntry);
  const deleteDeskEntry = useFlowStore((s) => s.deleteDeskEntry);
  const toggleDeskDrawer = useFlowStore((s) => s.toggleDeskDrawer);
  const toggleDeskDrawerDimmed = useFlowStore((s) => s.toggleDeskDrawerDimmed);

  const todayKey = getLocalDateKey(new Date().toISOString());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState('');
  const [editingDrawerId, setEditingDrawerId] = useState<string | null>(null);
  const [drawerDraft, setDrawerDraft] = useState('');
  const [editingEntryKey, setEditingEntryKey] = useState<{ drawerId: string; entryId: string } | null>(null);
  const [entryDraft, setEntryDraft] = useState('');
  const [drawerDrafts, setDrawerDrafts] = useState<Record<string, string>>({});
  const drawerInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

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

  const handleAddRow = () => {
    const row = addDeskRow();
    setEditingRowId(row.id);
    setRowDraft(row.title);
  };

  const handleAddDrawer = (row: DeskEdgeRow) => {
    const oldActiveId = row.drawers.find((d) => isExpanded.get(d.id))?.id;
    const drawer = addDeskDrawer(row.id);
    if (oldActiveId && oldActiveId !== drawer.id) {
      toggleDeskDrawer(oldActiveId, false);
    }
    window.setTimeout(() => {
      drawerInputRefs.current[drawer.id]?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      drawerInputRefs.current[drawer.id]?.focus();
    }, 0);
  };

  const startEditingRow = (row: DeskEdgeRow) => {
    setEditingRowId(row.id);
    setRowDraft(row.title);
  };

  const saveEditingRow = (rowId: string) => {
    updateDeskRowTitle(rowId, rowDraft);
    setEditingRowId(null);
  };

  const startEditingDrawer = (drawer: DeskDrawer) => {
    setEditingDrawerId(drawer.id);
    setDrawerDraft(drawer.title);
  };

  const saveEditingDrawer = (drawerId: string) => {
    updateDeskDrawerTitle(drawerId, drawerDraft);
    setEditingDrawerId(null);
  };

  const handleAddEntry = (drawerId: string) => {
    addDeskEntry(drawerId, drawerDrafts[drawerId] ?? '');
    setDrawerDrafts((prev) => ({ ...prev, [drawerId]: '' }));
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
              <p className="truncate text-[11px] text-gray-500">純手動新增 · 一行就是一條桌邊</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" />
            新增一行
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-8 sm:p-5">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-white shadow-sm text-emerald-600">
              <Rows3 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-gray-700">還沒有桌邊</p>
            <p className="max-w-xs text-xs leading-5 text-gray-400">點「新增一行」建立第一條桌子邊緣，再往裡面加橫向排列的抽屜。</p>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Plus className="h-4 w-4" />
              新增一行
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const isEditingRow = editingRowId === row.id;
              const activeExpandedId =
                row.drawers.reduce<DeskDrawer | null>((acc, drawer) => {
                  if (!isExpanded.get(drawer.id)) return acc;
                  if (!acc) return drawer;
                  const currentTime = new Date(drawer.updated_at ?? drawer.created_at).getTime();
                  const bestTime = new Date(acc.updated_at ?? acc.created_at).getTime();
                  return currentTime > bestTime ? drawer : acc;
                }, null)?.id ?? null;
              return (
                <section
                  key={row.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
                    {isEditingRow ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <input
                          value={rowDraft}
                          onChange={(e) => setRowDraft(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm text-gray-900 focus:border-emerald-300 focus:outline-none"
                          aria-label="桌邊名稱"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditingRow(row.id)}
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
                      <>
                        <button
                          type="button"
                          onClick={() => startEditingRow(row)}
                          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          title="編輯桌邊名稱"
                        >
                          <span className="truncate text-sm font-semibold text-gray-900">{row.title}</span>
                          <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-emerald-600" />
                        </button>
                        <span className="shrink-0 text-[11px] text-gray-400">{row.drawers.length} 個抽屜</span>
                        <button
                          type="button"
                          onClick={() => deleteDeskRow(row.id)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="刪除這一行與所有抽屜"
                          aria-label="刪除這一行"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {!isEditingRow && (
                      <button
                        type="button"
                        onClick={() => handleAddDrawer(row)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新增抽屜
                      </button>
                    )}
                  </div>

                  <div className="p-3 sm:p-4">
                    {row.drawers.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAddDrawer(row)}
                        className="flex w-full min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-xs">新增第一個抽屜</span>
                      </button>
                    ) : (
                      <>
                        <div className="flex gap-2 overflow-x-auto pb-2" aria-label={`${row.title} 的抽屜列`}>
                          {row.drawers.map((drawer) => {
                            const expanded = activeExpandedId === drawer.id;
                            const dimmed = Boolean(drawer.is_dimmed);
                            const summary = latestEntryText(drawer);
                            return (
                              <div
                                key={drawer.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  const next = !expanded;
                                  if (next) {
                                    row.drawers.forEach((other) => {
                                      if (other.id !== drawer.id && isExpanded.get(other.id)) {
                                        toggleDeskDrawer(other.id, false);
                                      }
                                    });
                                  } else {
                                    row.drawers.forEach((other) => {
                                      if (other.id !== drawer.id && isExpanded.get(other.id)) {
                                        toggleDeskDrawer(other.id, false);
                                      }
                                    });
                                  }
                                  toggleDeskDrawer(drawer.id, next);
                                  if (next && drawer.entries.length === 0) {
                                    window.setTimeout(() => {
                                      drawerInputRefs.current[drawer.id]?.scrollIntoView({ block: 'center', behavior: 'auto' });
                                      drawerInputRefs.current[drawer.id]?.focus();
                                    }, 0);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    const next = !expanded;
                                    if (next) {
                                      row.drawers.forEach((other) => {
                                        if (other.id !== drawer.id && isExpanded.get(other.id)) {
                                          toggleDeskDrawer(other.id, false);
                                        }
                                      });
                                    } else {
                                      row.drawers.forEach((other) => {
                                        if (other.id !== drawer.id && isExpanded.get(other.id)) {
                                          toggleDeskDrawer(other.id, false);
                                        }
                                      });
                                    }
                                    toggleDeskDrawer(drawer.id, next);
                                  }
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
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleDeskDrawerDimmed(drawer.id);
                                      }}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-700/70 hover:bg-white/70 hover:text-emerald-900"
                                      title={dimmed ? '取消變暗' : '點擊讓抽屜變暗'}
                                      aria-label={dimmed ? '取消變暗' : '讓抽屜變暗'}
                                    >
                                      {dimmed ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
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
                                  {summary || '空抽屜'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {row.drawers
                          .filter((drawer) => activeExpandedId === drawer.id)
                          .map((drawer) => {
                            const isEditingDr = editingDrawerId === drawer.id;
                            const dimmed = Boolean(drawer.is_dimmed);
                            return (
                              <section
                                key={drawer.id}
                                className={`mt-3 overflow-hidden rounded-xl border bg-white/60 ${
                                  dimmed
                                    ? 'border-slate-200/80 bg-slate-100/70 text-slate-500'
                                    : 'border-emerald-200 bg-emerald-50/70'
                                }`}
                              >
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
                                      onClick={() => startEditingDrawer(drawer)}
                                      className="group flex min-w-0 flex-1 items-center gap-1 text-left"
                                      title="編輯抽屜名稱"
                                    >
                                      <span className={`truncate text-sm font-semibold ${dimmed ? 'text-slate-500' : 'text-emerald-900'}`}>{drawer.title}</span>
                                      <Pencil className={`h-3.5 w-3.5 shrink-0 ${dimmed ? 'text-slate-300 group-hover:text-slate-500' : 'text-emerald-300 group-hover:text-emerald-600'}`} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleDeskDrawerDimmed(drawer.id)}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100"
                                    title={dimmed ? '取消變暗' : '點擊讓抽屜變暗'}
                                    aria-label={dimmed ? '取消變暗' : '讓抽屜變暗'}
                                  >
                                    {dimmed ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      row.drawers.forEach((other) => {
                                        if (other.id !== drawer.id && isExpanded.get(other.id)) {
                                          toggleDeskDrawer(other.id, false);
                                        }
                                      });
                                      toggleDeskDrawer(drawer.id, false);
                                    }}
                                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-xs text-emerald-700 hover:bg-emerald-100"
                                  >
                                    收縮
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteDeskDrawer(drawer.id)}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                    title="刪除抽屜"
                                    aria-label="刪除抽屜"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>

                                <div className="space-y-2 p-3">
                                  {drawer.entries.length === 0 ? (
                                    <p className="text-xs text-emerald-800/60">這個抽屜還沒有文字，直接在下方新增。</p>
                                  ) : (
                                    drawer.entries.map((entry) => {
                                      const isEditingEntry =
                                        editingEntryKey?.drawerId === drawer.id && editingEntryKey.entryId === entry.id;
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
                                        <div key={entry.id} className="group rounded-xl border border-emerald-200/70 bg-white/80 p-2.5">
                                          <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-mono text-[10px] text-emerald-800/50">{formatTime(entry.created_at)}</span>
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
                                                onClick={() => deleteDeskEntry(drawer.id, entry.id)}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                title="刪除文字"
                                                aria-label="刪除文字"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800">
                                            {entry.text}
                                          </p>
                                        </div>
                                      );
                                    })
                                  )}

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
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
