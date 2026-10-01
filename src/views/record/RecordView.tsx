import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordItemRow } from './RecordItemRow';
import { RecordInputBar } from './RecordInputBar';
import { RecordSearch } from './RecordSearch';
import { FloatingBubblePin } from '../../components/record/FloatingBubblePin';
import { ThreadPickerModal } from '../../components/modals/ThreadPickerModal';
import { TagPickerModal } from '../../components/modals/TagPickerModal';
import { DeskPickerModal } from '../../components/modals/DeskPickerModal';
import { SettingsModal } from '../../components/modals/SettingsModal';
import { HomeLinkModal } from '../../components/modals/HomeLinkModal';
import { getRelativeDayMeta, getLocalDateKey } from '../../utils/dateUtils';
import { buildRecordBranches } from '../../utils/recordBranches';
import { revealElement } from '../../utils/scrollUtils';
import { EnrichedRecordItem, RecordItem } from '../../types';
import {
  Calendar,
  RotateCcw,
  BookOpen,
  ArrowLeft,
  Cloud,
  Settings,
  ArrowDown,
  Sparkles,
  Link,
  List,
  PanelsTopLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { isR2Configured, loadR2Settings } from '../../sync/credentials';

interface DayGroup {
  dateKey: string;
  label: string;
  isToday: boolean;
  isYesterday: boolean;
  count: number;
  roots: EnrichedRecordItem[];
}

export const RecordView = () => {
  const records = useFlowStore((s) => s.records);
  const tags = useFlowStore((s) => s.tags);
  const threads = useFlowStore((s) => s.threads);
  const selectedDate = useFlowStore((s) => s.selectedDate);
  const recordViewMode = useFlowStore((s) => s.recordViewMode);
  const timelineDateHeaderBackgroundOpacity = useFlowStore((s) => s.timelineDateHeaderBackgroundOpacity);
  const dailyPageDateHeaderBackgroundOpacity = useFlowStore((s) => s.dailyPageDateHeaderBackgroundOpacity);
  const setRecordViewMode = useFlowStore((s) => s.setRecordViewMode);
  const fromReviewDate = useFlowStore((s) => s.fromReviewDate);
  const fromThreadDetailId = useFlowStore((s) => s.fromThreadDetailId);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const backToReview = useFlowStore((s) => s.backToReview);
  const backToThreadDetail = useFlowStore((s) => s.backToThreadDetail);
  const resetToTodayRecord = useFlowStore((s) => s.resetToTodayRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const bindRecordToDesk = useFlowStore((s) => s.bindRecordToDesk);
  const unbindRecordFromDesk = useFlowStore((s) => s.unbindRecordFromDesk);
  const restoreRecords = useFlowStore((s) => s.restoreRecords);
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const activeQuoteRecordId = useFlowStore((s) => s.activeQuoteRecordId);
  const homeLink = useFlowStore((s) => s.homeLink);
  const setHomeLink = useFlowStore((s) => s.setHomeLink);

  const parentThread = fromThreadDetailId
    ? threads.find((t) => t.id === fromThreadDetailId)
    : null;

  // Scroll Container & Anchors
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const pageScrollerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const yesterdayDateKey = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const weekAgoDateKey = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const monthAgoDateKey = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const [visiblePageDate, setVisiblePageDate] = useState(selectedDate || todayDateKey);
  const [customPageDate, setCustomPageDate] = useState<string | null>(null);
  const visiblePageDateRef = useRef(visiblePageDate);
  const pageScrollFrameRef = useRef<number | null>(null);
  // 记录上一次已处理过的 selectedDate，用于区分「显式日期跳转」与「无关的数据变更（如勾选已完成/置顶）」
  const handledSelectedDateRef = useRef<string | null | undefined>(undefined);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const prevRecordCountRef = useRef(records.length);

  // Modal State
  const [threadModalOpen, setThreadModalOpen] = useState(false);
  const [targetRecordForThread, setTargetRecordForThread] = useState<{ id: string; text: string } | null>(null);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [targetRecordForTag, setTargetRecordForTag] = useState<{ id: string; currentTagId: string | null } | null>(null);

  const [deskModalOpen, setDeskModalOpen] = useState(false);
  const [targetRecordForDesk, setTargetRecordForDesk] = useState<string | null>(null);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [homeLinkModalOpen, setHomeLinkModalOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const undoDeleteTimerRef = useRef<number | null>(null);
  const [undoDeleteState, setUndoDeleteState] = useState<{ records: RecordItem[] } | null>(null);
  const [savedTodayHint, setSavedTodayHint] = useState<string | null>(null);
  const savedTodayHintTimerRef = useRef<number | null>(null);

  const handleRecordsDeleted = (deletedRecords: RecordItem[]) => {
    if (!deletedRecords.length) return;
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current);
    }
    setUndoDeleteState({ records: deletedRecords });
    undoDeleteTimerRef.current = window.setTimeout(() => {
      setUndoDeleteState(null);
      undoDeleteTimerRef.current = null;
    }, 7000);
  };

  const handleUndoDelete = () => {
    if (!undoDeleteState) return;
    restoreRecords(undoDeleteState.records);
    setUndoDeleteState(null);
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current);
      undoDeleteTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    if (undoDeleteTimerRef.current !== null) window.clearTimeout(undoDeleteTimerRef.current);
    if (savedTodayHintTimerRef.current !== null) window.clearTimeout(savedTodayHintTimerRef.current);
  }, []);
  const r2Enabled = isR2Configured() && loadR2Settings().enabled;

  const openHomeLink = () => {
    if (!homeLink) return;
    const rawHref = homeLink.href.trim();
    const href = /^https?:\/\//i.test(rawHref) ? rawHref : `https://${rawHref}`;
    if (!/^https?:\/\//i.test(href)) return;

    // Use a real anchor so desktop browsers and Capacitor can apply their
    // normal external-link handling (including opening the system browser).
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  };
  const startLinkPress = () => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setHomeLinkModalOpen(true);
    }, 550);
  };
  const endLinkPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  // Multi-day chronological grouping with hierarchical tree construction
  const dayGroups: DayGroup[] = useMemo(() => {
    // 1. Group records by Date (yyyy-MM-dd)
    const { days: map, parents } = buildRecordBranches(records, tags, threads);

    // 2. Sort dates in chronological ascending order (oldest date at Top -> newest/today at Bottom)
    const requiredDateKeys = recordViewMode === 'daily-pages'
      ? [todayDateKey, yesterdayDateKey, weekAgoDateKey, monthAgoDateKey, selectedDate, customPageDate]
      : [todayDateKey];
    requiredDateKeys.forEach((dateKey) => {
      if (dateKey && !map.has(dateKey)) map.set(dateKey, []);
    });

    const sortedDateKeys = Array.from(map.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    // Each day owns its real records; shared global children include later continuations.
    const groups: DayGroup[] = sortedDateKeys.map((dateKey) => {
      const dayRecords = map.get(dateKey) || [];
      const recordLookup = new Map<string, EnrichedRecordItem>();

      dayRecords.forEach((item) => {
        recordLookup.set(item.id, item);
      });

      const roots = dayRecords.filter((item) => !recordLookup.has(parents.get(item.id) ?? ''));

      // Sort roots chronologically (09:12 -> 09:40 -> 16:20)
      roots.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const meta = getRelativeDayMeta(dateKey);

      return {
        dateKey,
        label: meta.label,
        isToday: meta.isToday,
        isYesterday: meta.isYesterday,
        count: dayRecords.length,
        roots,
      };
    });

    return groups;
  }, [
    records,
    tags,
    threads,
    recordViewMode,
    todayDateKey,
    yesterdayDateKey,
    weekAgoDateKey,
    monthAgoDateKey,
    selectedDate,
    customPageDate,
  ]);

  useEffect(() => {
    visiblePageDateRef.current = visiblePageDate;
  }, [visiblePageDate]);

  const pageIndex = useMemo(
    () => Math.max(0, dayGroups.findIndex((group) => group.dateKey === visiblePageDate)),
    [dayGroups, visiblePageDate]
  );

  const scrollToPage = (index: number, behavior: ScrollBehavior = 'auto') => {
    const scroller = pageScrollerRef.current;
    const safeIndex = Math.min(Math.max(index, 0), dayGroups.length - 1);
    const target = dayGroups[safeIndex];
    if (!scroller || !target) return;
    setVisiblePageDate(target.dateKey);
    scroller.scrollTo({ left: safeIndex * scroller.clientWidth, behavior });
  };

  const jumpToDate = (dateKey: string) => {
    setCustomPageDate(dateKey);
    visiblePageDateRef.current = dateKey;
    setVisiblePageDate(dateKey);
  };

  const showSavedTodayHint = (message: string) => {
    setSavedTodayHint(message);
    if (savedTodayHintTimerRef.current !== null) {
      window.clearTimeout(savedTodayHintTimerRef.current);
    }
    savedTodayHintTimerRef.current = window.setTimeout(() => {
      setSavedTodayHint(null);
      savedTodayHintTimerRef.current = null;
    }, 4000);
  };

  const goToToday = () => {
    resetToTodayRecord();
    if (recordViewMode === 'daily-pages') {
      jumpToDate(todayDateKey);
    } else {
      revealElement(bottomAnchorRef.current, 'end');
    }
    setSavedTodayHint(null);
    if (savedTodayHintTimerRef.current !== null) {
      window.clearTimeout(savedTodayHintTimerRef.current);
      savedTodayHintTimerRef.current = null;
    }
  };

  const handleRecordCreated = (id: string) => {
    if (isViewingHistoricalPage) {
      const hasBranchContext = Boolean(activeBranchParentId || activeQuoteRecordId);
      if (hasBranchContext) {
        useFlowStore.getState().setHighlightRecordId(id);
        window.setTimeout(() => {
          const previewEl = document.querySelector<HTMLElement>(`[id^="record-preview-"][data-record-id="${id}"]`);
          const targetEl = previewEl || document.getElementById(`record-${id}`);
          if (targetEl && (previewEl || !isViewingHistoricalPage)) {
            revealElement(targetEl);
          }
          window.setTimeout(() => {
            if (useFlowStore.getState().highlightRecordId === id) useFlowStore.getState().setHighlightRecordId(null);
          }, 1600);
        }, 250);
      }
      showSavedTodayHint('已存到今天 · 回到今天');
      return;
    }

    useFlowStore.getState().setSelectedDate(todayDateKey);
    visiblePageDateRef.current = todayDateKey;
    setVisiblePageDate(todayDateKey);
    useFlowStore.getState().setHighlightRecordId(id);
    window.setTimeout(() => {
      revealElement(document.getElementById(`record-${id}`));
      window.setTimeout(() => {
        if (useFlowStore.getState().highlightRecordId === id) useFlowStore.getState().setHighlightRecordId(null);
      }, 1600);
    }, 300);
  };

  const handleSearchResult = (record: RecordItem) => {
    const dateKey = getLocalDateKey(record.created_at);
    if (recordViewMode === 'daily-pages') jumpToDate(dateKey);
    else useFlowStore.getState().setSelectedDate(dateKey);
    useFlowStore.getState().setHighlightRecordId(record.id);
    window.setTimeout(() => {
      revealElement(document.getElementById(`record-${record.id}`));
      window.setTimeout(() => {
        if (useFlowStore.getState().highlightRecordId === record.id) {
          useFlowStore.getState().setHighlightRecordId(null);
        }
      }, 1600);
    }, 350);
  };

  const handlePageScroll = () => {
    if (pageScrollFrameRef.current !== null) return;
    pageScrollFrameRef.current = window.requestAnimationFrame(() => {
      pageScrollFrameRef.current = null;
      const scroller = pageScrollerRef.current;
      if (!scroller || scroller.clientWidth === 0) return;
      const index = Math.min(
        dayGroups.length - 1,
        Math.max(0, Math.round(scroller.scrollLeft / scroller.clientWidth))
      );
      const group = dayGroups[index];
      if (group && group.dateKey !== visiblePageDateRef.current) {
        setVisiblePageDate(group.dateKey);
      }
    });
  };

  useEffect(() => () => {
    if (pageScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pageScrollFrameRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    if (recordViewMode !== 'daily-pages' || dayGroups.length === 0) return;

    // 仅当 selectedDate 实际发生变化时才视为「显式日期跳转」（从回顾/思维线进入、发送记录回到今天、点击回今天）。
    // 否则（勾选已完成/置顶等数据变更导致 dayGroups 重建）保持用户当前所在页，
    // 避免视图被持久化的 selectedDate（典型为今天）强制拽回。
    const selectedDateChanged = selectedDate !== handledSelectedDateRef.current;
    const requestedDate = selectedDateChanged
      ? selectedDate || todayDateKey
      : visiblePageDateRef.current || todayDateKey;
    let targetIndex = dayGroups.findIndex((group) => group.dateKey === requestedDate);
    if (targetIndex < 0) {
      targetIndex = dayGroups.reduce((closest, group, index) => {
        const currentDistance = Math.abs(new Date(group.dateKey).getTime() - new Date(requestedDate).getTime());
        const closestDistance = Math.abs(new Date(dayGroups[closest].dateKey).getTime() - new Date(requestedDate).getTime());
        return currentDistance < closestDistance ? index : closest;
      }, 0);
    }

    const target = dayGroups[targetIndex];
    setVisiblePageDate(target.dateKey);
    handledSelectedDateRef.current = selectedDate;
    const frame = window.requestAnimationFrame(() => {
      const scroller = pageScrollerRef.current;
      if (scroller) {
        scroller.scrollTo({
          left: targetIndex * scroller.clientWidth,
          behavior: 'auto',
        });
        visiblePageDateRef.current = target.dateKey;
        setVisiblePageDate(target.dateKey);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recordViewMode, selectedDate, dayGroups, todayDateKey]);

  useEffect(() => {
    if (recordViewMode === 'daily-pages' && !selectedDate) {
      setVisiblePageDate(todayDateKey);
    }
  }, [recordViewMode, selectedDate, todayDateKey]);

  // Total summary of today's records or active context
  const headerSummary = useMemo(() => {
    const todayGroup = dayGroups.find((g) => g.isToday);
    const todayCount = todayGroup ? todayGroup.count : 0;
    const totalCount = records.length;
    return { todayCount, totalCount };
  }, [dayGroups, records]);

  // Initial mount: Anchor to bottom (Now / Latest record)
  useLayoutEffect(() => {
    if (recordViewMode === 'timeline' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [recordViewMode]);

  // When a new record is added, glide only if nearby; otherwise jump directly.
  useEffect(() => {
    if (recordViewMode === 'timeline' && records.length > prevRecordCountRef.current) {
      revealElement(bottomAnchorRef.current, 'end');
    }
    prevRecordCountRef.current = records.length;
  }, [records.length, recordViewMode]);

  // If navigated to a specific date from Review page, scroll to that date group
  useEffect(() => {
    if (recordViewMode === 'timeline' && selectedDate && scrollContainerRef.current) {
      const targetElement = document.getElementById(`day-group-${selectedDate}`);
      if (targetElement) {
        revealElement(targetElement, 'start');
      }
    }
  }, [selectedDate, recordViewMode]);

  // Handle scroll events to detect when user has scrolled up away from bottom
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // If scrolled more than 260px above bottom, show the floating "回到此刻" button
    setShowScrollToBottom(distanceFromBottom > 260);
  };

  const scrollToBottom = () => {
    revealElement(bottomAnchorRef.current, 'end');
    if (selectedDate) {
      resetToTodayRecord();
    }
  };

  // Modals Handlers
  const handleOpenThreadPicker = (recordId: string, text: string) => {
    setTargetRecordForThread({ id: recordId, text });
    setThreadModalOpen(true);
  };

  const handleSelectThread = (threadId: string) => {
    if (targetRecordForThread) {
      updateRecord(targetRecordForThread.id, { thread_id: threadId });
    }
  };

  const handleOpenTagPicker = (recordId: string, currentTagId: string | null) => {
    setTargetRecordForTag({ id: recordId, currentTagId });
    setTagModalOpen(true);
  };

  const handleSelectTag = (tagId: string | null) => {
    if (targetRecordForTag) {
      updateRecord(targetRecordForTag.id, { tag_id: tagId });
    }
  };

  const handleOpenDeskPicker = (recordId: string) => {
    setTargetRecordForDesk(recordId);
    setDeskModalOpen(true);
  };

  const handleBindDesk = (recordId: string, drawerId: string) => {
    bindRecordToDesk(recordId, drawerId);
    setDeskModalOpen(false);
  };

  const handleUnbindDesk = (recordId: string) => {
    unbindRecordFromDesk(recordId);
    setDeskModalOpen(false);
  };

  const currentPage = dayGroups[pageIndex];
  const previousPage = pageIndex > 0 ? dayGroups[pageIndex - 1] : null;
  const nextPage = pageIndex < dayGroups.length - 1 ? dayGroups[pageIndex + 1] : null;
  const previousRecordedPage = [...dayGroups]
    .slice(0, pageIndex)
    .reverse()
    .find((group) => group.count > 0) ?? null;
  const nextRecordedPage = dayGroups.slice(pageIndex + 1).find((group) => group.count > 0) ?? null;
  const quickJumpTargets = [
    { label: '今天', dateKey: todayDateKey },
    { label: '昨天', dateKey: yesterdayDateKey },
    { label: '7天前', dateKey: weekAgoDateKey },
    { label: '30天前', dateKey: monthAgoDateKey },
  ];
  const isViewingHistoricalPage =
    recordViewMode === 'daily-pages' && visiblePageDate !== todayDateKey;

  const renderRecordTree = (group: DayGroup) => (
    <div className="space-y-0.5 pl-1">
      {group.roots.map((item) => (
        <div key={item.id} className="border-b border-gray-100/70 last:border-b-0 pb-1 mb-1">
          <RecordItemRow
            item={item}
            level={0}
            displayDate={group.dateKey}
            onOpenThreadPicker={handleOpenThreadPicker}
            onOpenTagPicker={handleOpenTagPicker}
            onOpenDeskPicker={handleOpenDeskPicker}
            onRecordsDeleted={handleRecordsDeleted}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 1. Header Bar: Date and count + Navigation buttons */}
      <div className="record-header flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
        <div className={`${mobileSearchOpen ? 'hidden md:flex' : 'flex'} min-w-0 items-center gap-2`}>
          {/* Back to Thread or Review if jumped */}
          {fromThreadDetailId ? (
            <button
              onClick={backToThreadDetail}
              className="p-1 -ml-1 text-gray-600 hover:text-blue-700 rounded-full hover:bg-blue-50 transition-colors flex items-center gap-1 mr-1 text-xs font-medium"
              title={`返回思维线「${parentThread?.title || '详情'}」`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{parentThread?.title ? `🔗 ${parentThread.title}` : '思维线'}</span>
            </button>
          ) : fromReviewDate ? (
            <button
              onClick={backToReview}
              className="p-1 -ml-1 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1 mr-1"
              title="返回回顾页"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-medium text-gray-700">回顾</span>
            </button>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm tracking-tight flex items-center gap-1.5">
              <span>超电思</span>
            </span>
            <span className="hidden text-[11px] text-gray-400 font-medium md:inline">
              今天 {headerSummary.todayCount} 条 · 共 {headerSummary.totalCount} 条
            </span>
          </div>

          {selectedDate && (
            <button
              onClick={resetToTodayRecord}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full font-medium transition-colors"
              title="回到今天最新流"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              回今天
            </button>
          )}
        </div>

        <RecordSearch records={records} onSelect={handleSearchResult}
          mobileOpen={mobileSearchOpen} setMobileOpen={setMobileSearchOpen} />

        {/* Action Group: Sync / Settings / Review */}
        <div className={`${mobileSearchOpen ? 'hidden md:flex' : 'flex'} shrink-0 items-center gap-1.5`}>
          {homeLink && (
            <button
              onPointerDown={startLinkPress}
              onPointerUp={endLinkPress}
              onPointerCancel={endLinkPress}
              onPointerLeave={endLinkPress}
              onClick={(event) => { if (longPressTriggered.current) { event.preventDefault(); return; } openHomeLink(); }}
              className="min-h-9 max-w-28 flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 px-2.5 rounded-lg hover:bg-blue-50 bg-blue-50/70 border border-blue-200/70 transition-colors"
              title="点击打开链接，长按编辑名称和地址"
            ><Link className="w-3.5 h-3.5 flex-shrink-0" /><span className="font-medium truncate">{homeLink.shownName}</span></button>
          )}
          {!homeLink && <button onClick={() => setHomeLinkModalOpen(true)} className="min-h-9 px-2 text-[11px] text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="添加主页链接">+ 链接</button>}
          {/* Cloud Sync Status / Open Settings */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className={`min-w-9 min-h-9 p-2 rounded-lg border transition-colors flex items-center justify-center ${
              r2Enabled
                ? 'text-blue-600 bg-blue-50/80 border-blue-200 hover:bg-blue-100'
                : 'text-gray-400 bg-gray-50 border-gray-200/60 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={r2Enabled ? 'R2 云端同步已开启 (点击查看设置与手动同步)' : '配置 R2 云端存储与备份'}
          >
            {r2Enabled ? <Cloud className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
          </button>

          {/* Entry to Review View */}
          <button
            onClick={() => setActiveTab('review')}
            className="min-h-9 flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 rounded-lg hover:bg-gray-100 bg-gray-50 border border-gray-200/60 transition-colors"
            title="打开回顾页"
          >
            <BookOpen className="w-3.5 h-3.5 text-gray-600" />
            <span className="font-medium">回顾</span>
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className="min-h-9 flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900 px-2.5 rounded-lg hover:bg-violet-100 bg-violet-50 border border-violet-200/70 transition-colors"
            title="打開重要 × 緊急四象限"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden font-medium sm:inline">四象限</span>
          </button>
          <button
            onClick={() => setActiveTab('value-matrix')}
            className="min-h-9 flex items-center gap-1 text-xs text-fuchsia-700 hover:text-fuchsia-900 px-2.5 rounded-lg hover:bg-fuchsia-100 bg-fuchsia-50 border border-fuchsia-200/70 transition-colors"
            title="打開價值 × 晚做損失四象限"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden font-medium sm:inline">價值象限</span>
          </button>
          <button
            onClick={() => setActiveTab('desk')}
            className="min-h-9 flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 px-2.5 rounded-lg hover:bg-emerald-100 bg-emerald-50 border border-emerald-200/70 transition-colors"
            title="打開桌邊抽屜"
          >
            <Rows3 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-700">桌邊</span>
          </button>
        </div>
      </div>

      <div className="record-mode-bar relative z-20 flex min-h-11 flex-shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-1.5">
        <div className="inline-flex h-9 w-[132px] flex-none rounded-lg bg-gray-100 p-0.5 text-[11px]" aria-label="记录页显示模式">
          <button
            type="button"
            onClick={() => setRecordViewMode('timeline')}
            aria-pressed={recordViewMode === 'timeline'}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md transition-colors ${
              recordViewMode === 'timeline' ? 'bg-white font-medium text-gray-900 shadow-xs' : 'text-gray-500'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            时间流
          </button>
          <button
            type="button"
            onClick={() => setRecordViewMode('daily-pages')}
            aria-pressed={recordViewMode === 'daily-pages'}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md transition-colors ${
              recordViewMode === 'daily-pages' ? 'bg-white font-medium text-gray-900 shadow-xs' : 'text-gray-500'
            }`}
          >
            <PanelsTopLeft className="h-3.5 w-3.5" />
            翻页
          </button>
        </div>

        {recordViewMode === 'daily-pages' && currentPage && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1 overflow-hidden">
            <button
              type="button"
              onClick={() => scrollToPage(pageIndex - 1)}
              disabled={!previousPage}
              className="flex-none rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-25"
              title={previousPage ? `上一页：${previousPage.label}` : '已经是最早一页'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 text-center leading-tight">
              <div className="truncate text-[11px] font-semibold text-gray-800">{currentPage.label}</div>
              <div className="truncate text-[9px] text-gray-400">
                {previousPage ? `← ${previousPage.label}` : '最早'} · {pageIndex + 1}/{dayGroups.length} · {nextPage ? `${nextPage.label} →` : '最新'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => scrollToPage(pageIndex + 1)}
              disabled={!nextPage}
              className="flex-none rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-25"
              title={nextPage ? `下一页：${nextPage.label}` : '已经是最新一页'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {recordViewMode === 'daily-pages' && (
        <div className="record-quick-jumps relative z-20 flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-100 bg-white px-3 py-1.5">
          {quickJumpTargets.map((target) => {
            const isActive = visiblePageDate === target.dateKey;
            return (
              <button
                key={target.label}
                type="button"
                onClick={() => jumpToDate(target.dateKey)}
                aria-pressed={isActive}
                className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {target.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker()}
            className="flex flex-shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Calendar className="h-3 w-3" />
            日历
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={customPageDate ?? ''}
            onChange={(event) => {
              if (event.target.value) jumpToDate(event.target.value);
            }}
            className="fixed -left-[9999px] h-px w-px opacity-0"
            aria-label="选择要查看的日期"
          />
        </div>
      )}

      {/* 📌 Floating Draggable Bubble Pin Note (Top Position with bounce float) */}
      <FloatingBubblePin />

      {recordViewMode === 'timeline' ? (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2 py-2 relative space-y-4"
        >
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3 text-gray-300">
                <Calendar className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-gray-500">暂无任何记录</p>
              <p className="text-xs text-gray-400 mt-1">在下方输入框写下此刻的想法，开启时间流</p>
            </div>
          ) : (
            dayGroups.map((group) => {
            const isTargetHighlight = selectedDate === group.dateKey;

            return (
              <div
                key={group.dateKey}
                id={`day-group-${group.dateKey}`}
                className={`day-section rounded-2xl transition-all duration-300 ${
                  isTargetHighlight ? 'ring-2 ring-blue-400/40 bg-blue-50/20' : ''
                }`}
              >
                {/* Sticky Date Header between Days */}
                <div className="sticky top-0 z-10 py-1.5 flex items-center justify-between pointer-events-none mb-1">
                  <div
                    className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md shadow-xs text-[11px] font-medium tracking-tight"
                    style={{
                      backgroundColor: `hsla(35, 55%, 20%, ${timelineDateHeaderBackgroundOpacity / 100})`,
                      borderColor: 'hsla(35, 55%, 40%, 0.30)',
                      borderWidth: '1px',
                      color: 'hsl(35, 20%, 95%)',
                    }}
                  >
                    <Calendar className="w-3 h-3" style={{ color: 'hsl(35, 65%, 65%)' }} />
                    <span>{group.label}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'hsla(35, 55%, 65%, 0.7)' }}>({group.count}条)</span>
                  </div>

                  {group.isToday && (
                    <div className="pointer-events-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                      <span>此刻进行时</span>
                    </div>
                  )}
                </div>

                {renderRecordTree(group)}
              </div>
            );
            })
          )}

          <div ref={bottomAnchorRef} className="h-2" />
        </div>
      ) : (
        <div
          ref={pageScrollerRef}
          onScroll={handlePageScroll}
          className="daily-page-scroller flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
          aria-label="按日期翻页浏览"
        >
          {dayGroups.map((group) => (
            <section
              key={group.dateKey}
              className="h-full w-full flex-none snap-start overflow-y-auto px-2 py-2"
              aria-label={`${group.label}，${group.count}条记录`}
            >
              <div className="min-h-full rounded-2xl bg-white">
                <div className="sticky top-0 z-10 mb-2 flex items-center justify-between bg-white/90 px-1 py-1.5 backdrop-blur-md">
                  <div
                    className="flex items-center gap-1.5 rounded-full border border-amber-900/20 px-3 py-1 text-[11px] font-medium text-amber-50 shadow-xs"
                    style={{ backgroundColor: `rgb(69 26 3 / ${dailyPageDateHeaderBackgroundOpacity / 100})` }}
                  >
                    <Calendar className="h-3 w-3 text-amber-300" />
                    <span>{group.label}</span>
                    <span className="font-mono text-[10px] text-amber-200/70">({group.count}条)</span>
                  </div>
                  {group.isToday && (
                    <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700">
                      <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                      此刻进行时
                    </div>
                  )}
                </div>

                {group.roots.length > 0 ? (
                  renderRecordTree(group)
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-gray-400">
                    <Calendar className="mb-3 h-8 w-8 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      {group.isToday ? '今天还没有记录' : `${group.label}没有记录`}
                    </p>
                    <p className="mt-1 text-xs">
                      {group.isToday ? '从下方写下此刻的第一个想法' : '可以查看前后最近有记录的日期'}
                    </p>
                    {!group.isToday && (previousRecordedPage || nextRecordedPage) && (
                      <div className="mt-4 flex items-center gap-2">
                        {previousRecordedPage && (
                          <button
                            type="button"
                            onClick={() => jumpToDate(previousRecordedPage.dateKey)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-xs"
                          >
                            ← {previousRecordedPage.label}
                          </button>
                        )}
                        {nextRecordedPage && (
                          <button
                            type="button"
                            onClick={() => jumpToDate(nextRecordedPage.dateKey)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-xs"
                          >
                            {nextRecordedPage.label} →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Floating Action: Quick Scroll back to Bottom ("回到此刻 / Today") */}
      {recordViewMode === 'timeline' && showScrollToBottom && (
        <div className="absolute right-4 bottom-24 z-30 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold shadow-xl shadow-amber-500/30 active:scale-95 transition-transform border border-amber-200/40"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>回到此刻 (今天)</span>
          </button>
        </div>
      )}

      {undoDeleteState && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-4 bottom-36 z-40 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-2.5 text-xs text-white shadow-xl"
        >
          <span className="min-w-0 truncate">
            {undoDeleteState.records.length > 1 ? '已删除记录及其分支' : '已删除记录'}
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-amber-300 transition-colors hover:bg-white/10 hover:text-amber-200"
          >
            撤销
          </button>
        </div>
      )}

      {savedTodayHint && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-4 bottom-24 z-40 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-2.5 text-xs text-white shadow-xl"
        >
          <span className="min-w-0 truncate">{savedTodayHint}</span>
          <button
            type="button"
            onClick={goToToday}
            className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-amber-300 transition-colors hover:bg-white/10 hover:text-amber-200"
          >
            回到今天
          </button>
        </div>
      )}

      {/* 3. Bottom Sticky Input Bar (Recent Thread Capsules + Input + Send) */}
      <RecordInputBar writesToToday={isViewingHistoricalPage} onRecordCreated={handleRecordCreated} />

      {/* Modals */}
      <ThreadPickerModal
        isOpen={threadModalOpen}
        onClose={() => setThreadModalOpen(false)}
        currentTargetTitle={targetRecordForThread?.text}
        onSelect={handleSelectThread}
      />

      <TagPickerModal
        isOpen={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        currentTagId={targetRecordForTag?.currentTagId ?? null}
        onSelectTag={handleSelectTag}
      />

      <DeskPickerModal
        isOpen={deskModalOpen}
        onClose={() => setDeskModalOpen(false)}
        recordId={targetRecordForDesk}
        onBind={handleBindDesk}
        onUnbind={handleUnbindDesk}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
      <HomeLinkModal
        isOpen={homeLinkModalOpen}
        initialValue={homeLink}
        onClose={() => setHomeLinkModalOpen(false)}
        onConfirm={(value) => { setHomeLink(value); setHomeLinkModalOpen(false); }}
      />
    </div>
  );
};

