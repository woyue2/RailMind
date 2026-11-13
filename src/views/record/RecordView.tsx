import { useState, useMemo, useRef, useEffect, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { useFlowStore } from '../../store/useFlowStore';
import { useTagSectionState } from './tagPageState';
import { RecordItemRow } from './RecordItemRow';
import { RecordInputBar } from './RecordInputBar';
import { RecordSearch } from './RecordSearch';
import { FloatingBubblePin } from '../../components/record/FloatingBubblePin';
import { ThreadPickerModal } from '../../components/modals/ThreadPickerModal';
import { TagPickerModal } from '../../components/modals/TagPickerModal';
import { DeskPickerModal } from '../../components/modals/DeskPickerModal';
import { SettingsModal } from '../../components/modals/SettingsModal';
import { HomeLinkModal } from '../../components/modals/HomeLinkModal';
import { getRelativeDayMeta, getLocalDateKey, appDateKey, appDateKeyOffset } from '../../utils/dateUtils';
import { buildRecordBranches } from '../../utils/recordBranches';
import { buildDrawerByEntryId } from '../../utils/deskLookup';
import {
  buildDateTagSections,
  tagSectionKeyOf,
  type TagDaySection,
} from '../../utils/tagPages';
import { flashRecord, revealElement } from '../../utils/scrollUtils';
import { RecordTreeNode, RecordItem, RecordViewMode } from '../../types';
import {
  Calendar,
  BookOpen,
  ArrowLeft,
  Cloud,
  Settings,
  ArrowDown,
  Sparkles,
  Link,
  List,
  PanelsTopLeft,
  Rows3,
  Tag,
  Tags,
} from 'lucide-react';
import { isR2Configured, loadR2Settings } from '../../sync/credentials';

interface DayGroup {
  dateKey: string;
  label: string;
  isToday: boolean;
  isYesterday: boolean;
  count: number;
  roots: RecordTreeNode[];
}

/** 從 startIndex 起沿 step 方向找最近一个有记录的日期页。 */
function findRecordedPage(groups: DayGroup[], startIndex: number, step: 1 | -1): DayGroup | null {
  for (let index = startIndex; index >= 0 && index < groups.length; index += step) {
    if (groups[index].count > 0) return groups[index];
  }
  return null;
}

/** 日期翻页与标签翻页共用的横向快照滚动容器（外壳与 section 样式保持单一来源）。 */
function PagedScroller<T>({
  pages,
  getKey,
  scrollerRef,
  onScroll,
  ariaLabel,
  sectionAriaLabel,
  renderPage,
  getSectionId,
  onSectionScroll,
}: {
  pages: T[];
  getKey: (page: T) => string;
  scrollerRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  ariaLabel: string;
  sectionAriaLabel: (page: T) => string;
  renderPage: (page: T) => ReactNode;
  getSectionId?: (page: T) => string;
  onSectionScroll?: (page: T) => void;
}) {
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className="daily-page-scroller flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      aria-label={ariaLabel}
    >
      {pages.map((page) => (
        <section
          key={getKey(page)}
          id={getSectionId?.(page)}
          onScroll={onSectionScroll ? () => onSectionScroll(page) : undefined}
          className="h-full w-full flex-none snap-start overflow-y-auto px-2 py-2"
          aria-label={sectionAriaLabel(page)}
        >
          {renderPage(page)}
        </section>
      ))}
    </div>
  );
}

/** 翻页快捷条上的胶囊按钮，日期页与标签页共用同一套选中样式。 */
function QuickChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-amber-400 bg-amber-50 text-amber-800'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
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
  const selectedTagKey = useTagSectionState((s) => s.selectedTagKey);
  const setSelectedTagKey = useTagSectionState((s) => s.setSelectedTagKey);
  const fromReviewDate = useFlowStore((s) => s.fromReviewDate);
  const fromThreadDetailId = useFlowStore((s) => s.fromThreadDetailId);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const backToReview = useFlowStore((s) => s.backToReview);
  const backToThreadDetail = useFlowStore((s) => s.backToThreadDetail);
  const resetToTodayRecord = useFlowStore((s) => s.resetToTodayRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const bindRecordToDesk = useFlowStore((s) => s.bindRecordToDesk);
  const unbindRecordFromDesk = useFlowStore((s) => s.unbindRecordFromDesk);
  const createDrawerFromRecord = useFlowStore((s) => s.createDrawerFromRecord);
  const deskRows = useFlowStore((s) => s.deskRows);
  const restoreRecords = useFlowStore((s) => s.restoreRecords);
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const activeQuoteRecordId = useFlowStore((s) => s.activeQuoteRecordId);
  const homeLink = useFlowStore((s) => s.homeLink);
  const setHomeLink = useFlowStore((s) => s.setHomeLink);

  // 建立 entryId -> 抽屜 的快速映射表
  const drawerByEntryId = useMemo(() => buildDrawerByEntryId(deskRows), [deskRows]);

  const parentThread = fromThreadDetailId
    ? threads.find((t) => t.id === fromThreadDetailId)
    : null;

  // Scroll Container & Anchors
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const pageScrollerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const todayDateKey = appDateKey();
  const yesterdayDateKey = appDateKeyOffset(1);
  const weekAgoDateKey = appDateKeyOffset(7);
  const monthAgoDateKey = appDateKeyOffset(30);
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

  // 展示树只建一次，日期页与标签页共用。
  const branchTree = useMemo(
    () => buildRecordBranches(records, tags, threads),
    [records, tags, threads]
  );

  // Multi-day chronological grouping with hierarchical tree construction
  const dayGroups: DayGroup[] = useMemo(() => {
    // 1. Group records by Date (yyyy-MM-dd)
    // 複製一份 map：補齊空白日期頁時不能污染共用的 branchTree。
    const map = new Map(branchTree.days);
    const parents = branchTree.parents;

    // 2. Sort dates in chronological ascending order (oldest date at Top -> newest/today at Bottom)
    const requiredDateKeys = recordViewMode !== 'timeline'
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
      const recordLookup = new Map<string, RecordTreeNode>();

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
    branchTree,
    recordViewMode,
    todayDateKey,
    yesterdayDateKey,
    weekAgoDateKey,
    monthAgoDateKey,
    selectedDate,
    customPageDate,
  ]);

  // 標籤視圖：頁面按日期翻頁，頁內再按標籤分節
  // （只含當天有記錄的標籤，A-Z、未打標籤最後）。
  const tagSectionsByDate = useMemo(() => {
    const map = new Map<string, TagDaySection[]>();
    if (recordViewMode !== 'tag-pages') return map;
    for (const [dateKey, dayRecords] of branchTree.days) {
      map.set(
        dateKey,
        buildDateTagSections(dayRecords, branchTree.nodes, tags, dateKey, (record) =>
          getLocalDateKey(record.created_at)
        )
      );
    }
    return map;
  }, [recordViewMode, branchTree, tags]);
  const currentTagSections = tagSectionsByDate.get(visiblePageDate) ?? [];
  const tagKeyForRecord = useMemo(() => {
    const validTagIds = new Set(tags.map((tag) => tag.id));
    return (record: Pick<RecordItem, 'tag_id'>) => tagSectionKeyOf(record, validTagIds);
  }, [tags]);
  const tagSectionKeyFor = useMemo(() => {
    const validTagIds = new Set(tags.map((tag) => tag.id));
    return (record: Pick<RecordItem, 'tag_id' | 'created_at'>) =>
      `${tagSectionKeyOf(record, validTagIds)}@${getLocalDateKey(record.created_at)}`;
  }, [tags]);
  const tagSectionScrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    visiblePageDateRef.current = visiblePageDate;
  }, [visiblePageDate]);

  const pageIndex = useMemo(
    () => Math.max(0, dayGroups.findIndex((group) => group.dateKey === visiblePageDate)),
    [dayGroups, visiblePageDate]
  );

  const jumpToDate = (dateKey: string) => {
    setCustomPageDate(dateKey);
    visiblePageDateRef.current = dateKey;
    setVisiblePageDate(dateKey);
  };

  /**
   * 三種模式共用「目前日期」：切換時對齊同一天。
   * 標籤視圖本身就是按日期翻頁，所以進入/離開時同步 selectedDate 與 visiblePageDate 即可。
   */
  const handleViewModeChange = (next: RecordViewMode) => {
    if (next === recordViewMode) return;
    const dateKey =
      recordViewMode === 'timeline'
        ? selectedDate || visiblePageDate || todayDateKey
        : visiblePageDate || selectedDate || todayDateKey;
    if (recordViewMode === 'tag-pages') {
      // 離開標籤視圖：保留目前日期頁。
      visiblePageDateRef.current = dateKey;
      setVisiblePageDate(dateKey);
      setCustomPageDate(dateKey);
    }
    useFlowStore.getState().setSelectedDate(dateKey);
    setRecordViewMode(next);
  };

  /** 頁面內元素相對該頁捲動頂部的偏移。 */
  const pageOffsetOf = (pageElement: HTMLElement, element: HTMLElement): number =>
    element.getBoundingClientRect().top -
    pageElement.getBoundingClientRect().top +
    pageElement.scrollTop;

  /** 在某個日期頁內滾動到指定標籤分節。 */
  const scrollToDateTagSection = (dateKey: string, tagKey: string): boolean => {
    const pageElement = document.getElementById(`tag-page-${dateKey}`);
    const anchor = document.getElementById(`tag-day-${dateKey}-${tagKey}`);
    if (!pageElement || !anchor) return false;
    pageElement.scrollTo({
      top: Math.max(0, pageOffsetOf(pageElement, anchor) - 8),
      behavior: 'auto',
    });
    setSelectedTagKey(tagKey);
    return true;
  };

  /** 日期頁內滾動時更新作用中的標籤 chip。 */
  const handleTagSectionScroll = (dateKey: string) => {
    if (tagSectionScrollFrameRef.current !== null) return;
    tagSectionScrollFrameRef.current = window.requestAnimationFrame(() => {
      tagSectionScrollFrameRef.current = null;
      if (useFlowStore.getState().recordViewMode !== 'tag-pages') return;
      const pageElement = document.getElementById(`tag-page-${dateKey}`);
      if (!pageElement) return;
      const top = pageElement.scrollTop + 12;
      let active: TagDaySection | null = null;
      for (const section of tagSectionsByDate.get(dateKey) ?? []) {
        const element = document.getElementById(`tag-day-${dateKey}-${section.tagKey}`);
        if (element && pageOffsetOf(pageElement, element) <= top) active = section;
      }
      if (active && active.tagKey !== useTagSectionState.getState().selectedTagKey) {
        setSelectedTagKey(active.tagKey);
      }
    });
  };

  // 切換日期頁後，若原本的標籤不在這一天，改選當天第一個標籤分節。
  useEffect(() => {
    if (recordViewMode !== 'tag-pages') return;
    const sections = tagSectionsByDate.get(visiblePageDate) ?? [];
    if (!sections.length) return;
    if (!sections.some((section) => section.tagKey === selectedTagKey)) {
      setSelectedTagKey(sections[0].tagKey);
    }
  }, [recordViewMode, visiblePageDate, tagSectionsByDate, selectedTagKey]);

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

  const handleRecordCreated = (id: string) => {
    if (recordViewMode === 'tag-pages') {
      // 新記錄預設無標籤、落在今天：若目前就在今天的頁面，直接高亮。
      if (visiblePageDate === todayDateKey) flashRecord(id, 300);
      showSavedTodayHint('已存入「未打標籤」');
      return;
    }

    if (isViewingHistoricalPage) {
      const hasBranchContext = Boolean(activeBranchParentId || activeQuoteRecordId);
      if (hasBranchContext) {
        flashRecord(id, 250, () =>
          document.querySelector<HTMLElement>(`[id^="record-preview-"][data-record-id="${id}"]`)
        );
      }
      showSavedTodayHint('已存到今天');
      return;
    }

    useFlowStore.getState().setSelectedDate(todayDateKey);
    visiblePageDateRef.current = todayDateKey;
    setVisiblePageDate(todayDateKey);
    flashRecord(id, 300);
  };

  const handleSearchResult = (record: RecordItem) => {
    const dateKey = getLocalDateKey(record.created_at);
    if (recordViewMode === 'daily-pages') jumpToDate(dateKey);
    else if (recordViewMode === 'tag-pages') {
      if (visiblePageDate !== dateKey) jumpToDate(dateKey);
      scrollToDateTagSection(dateKey, tagKeyForRecord(record));
    } else useFlowStore.getState().setSelectedDate(dateKey);
    flashRecord(record.id, 350);
  };

  const handlePageScroll = () => {
    if (pageScrollFrameRef.current !== null) return;
    pageScrollFrameRef.current = window.requestAnimationFrame(() => {
      pageScrollFrameRef.current = null;
      if (useFlowStore.getState().recordViewMode === 'timeline') return;
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
    if (tagSectionScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(tagSectionScrollFrameRef.current);
    }
  }, []);

  // 切換模式時取消上一個模式排隊中的滾動回呼，避免它改寫新模式的頁碼。
  useEffect(() => {
    if (pageScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pageScrollFrameRef.current);
      pageScrollFrameRef.current = null;
    }
    if (tagSectionScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(tagSectionScrollFrameRef.current);
      tagSectionScrollFrameRef.current = null;
    }
  }, [recordViewMode]);

  useLayoutEffect(() => {
    if (
      (recordViewMode !== 'daily-pages' && recordViewMode !== 'tag-pages') ||
      dayGroups.length === 0
    ) {
      return;
    }

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
    if (recordViewMode !== 'timeline' && !selectedDate) {
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

  const handleCreateDrawerFromRecord = (recordId: string) => {
    createDrawerFromRecord(recordId);
  };

  const previousRecordedPage = findRecordedPage(dayGroups, pageIndex - 1, -1);
  const nextRecordedPage = findRecordedPage(dayGroups, pageIndex + 1, 1);
  const quickJumpTargets = [
    { label: '今天', dateKey: todayDateKey },
    { label: '昨天', dateKey: yesterdayDateKey },
    { label: '7天前', dateKey: weekAgoDateKey },
    { label: '30天前', dateKey: monthAgoDateKey },
  ];
  const isViewingHistoricalPage =
    recordViewMode === 'daily-pages' && visiblePageDate !== todayDateKey;
  const isNestedEntry = Boolean(fromReviewDate || fromThreadDetailId);

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
            onCreateDrawerFromRecord={handleCreateDrawerFromRecord}
            deskDrawerTitle={item.desk_entry_id ? drawerByEntryId.get(item.desk_entry_id)?.title : undefined}
            onRecordsDeleted={handleRecordsDeleted}
          />
        </div>
      ))}
    </div>
  );

  const handleJumpToTagRecord = (record: RecordItem) => {
    const dateKey = getLocalDateKey(record.created_at);
    if (visiblePageDate !== dateKey) jumpToDate(dateKey);
    scrollToDateTagSection(dateKey, tagKeyForRecord(record));
    flashRecord(record.id, 300);
  };

  const renderTagTree = (section: TagDaySection, dateKey: string) => (
    <div className="space-y-0.5 pl-1">
      {section.roots.map((item) => (
        <div key={item.id} className="border-b border-gray-100/70 last:border-b-0 pb-1 mb-1">
          <RecordItemRow
            item={item}
            level={0}
            page={{ key: `${section.tagKey}@${dateKey}`, keyOf: tagSectionKeyFor }}
            onJumpToRecord={handleJumpToTagRecord}
            onOpenThreadPicker={handleOpenThreadPicker}
            onOpenTagPicker={handleOpenTagPicker}
            onOpenDeskPicker={handleOpenDeskPicker}
            onCreateDrawerFromRecord={handleCreateDrawerFromRecord}
            deskDrawerTitle={item.desk_entry_id ? drawerByEntryId.get(item.desk_entry_id)?.title : undefined}
            onRecordsDeleted={handleRecordsDeleted}
          />
        </div>
      ))}
    </div>
  );

  const renderDayPage = (group: DayGroup) => (
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
  );

  /** 標籤視圖的日期頁：頁首是日期，頁內按標籤分節（只含當天有記錄的標籤）。 */
  const renderTagDatePage = (group: DayGroup) => {
    const sections = tagSectionsByDate.get(group.dateKey) ?? [];
    return (
      <div className="min-h-full rounded-2xl bg-white">
        <div className="sticky top-0 z-10 mb-2 flex items-center justify-between bg-white/90 px-1 py-1.5 backdrop-blur-md">
          <div
            className="flex items-center gap-1.5 rounded-full border border-amber-900/20 px-3 py-1 text-[11px] font-medium text-amber-50 shadow-xs"
            style={{
              backgroundColor: `rgb(69 26 3 / ${dailyPageDateHeaderBackgroundOpacity / 100})`,
            }}
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

        {sections.length > 0 ? (
          <div className="space-y-2">
            {sections.map((section) => (
              <section key={section.tagKey} id={`tag-day-${group.dateKey}-${section.tagKey}`}>
                <div className="mb-1 flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                    {section.isUntagged ? (
                      <Tag className="h-3 w-3 text-gray-400" />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: section.color ?? '#9CA3AF' }}
                      />
                    )}
                    <span>{section.tagLabel}</span>
                    <span className="font-mono text-[10px] text-gray-400">
                      ({section.count}条)
                    </span>
                  </div>
                </div>
                {renderTagTree(section, group.dateKey)}
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-gray-400">
            <Tag className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">这一天没有记录</p>
            <p className="mt-1 text-xs">可以左右滑动查看其他日期</p>
          </div>
        )}
      </div>
    );
  };

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

          <div className={`${isNestedEntry ? 'hidden md:flex' : 'flex'} items-center gap-2`}>
            <span className="font-bold text-gray-900 text-sm tracking-tight flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span>超电思</span>
            </span>
            <span className="hidden text-[11px] text-gray-400 font-medium md:inline">
              今天 {headerSummary.todayCount} 条 · 共 {headerSummary.totalCount} 条
            </span>
          </div>
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
              className="hidden sm:flex min-h-9 max-w-28 items-center gap-1 text-xs text-blue-700 hover:text-blue-900 px-2.5 rounded-lg hover:bg-blue-50 bg-blue-50/70 border border-blue-200/70 transition-colors"
              title="点击打开链接，长按编辑名称和地址"
            ><Link className="w-3.5 h-3.5 flex-shrink-0" /><span className="font-medium truncate">{homeLink.shownName}</span></button>
          )}
          {!homeLink && <button onClick={() => setHomeLinkModalOpen(true)} className="hidden sm:flex min-h-9 px-2 text-[11px] text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="添加主页链接">+ 链接</button>}
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

          <div
            role="group"
            aria-label="记录页显示模式"
            className="flex min-h-9 items-center rounded-lg border border-gray-200/60 bg-gray-50 p-0.5"
          >
            {([
              { id: 'timeline', label: '时间流', icon: List },
              { id: 'daily-pages', label: '翻页', icon: PanelsTopLeft },
              { id: 'tag-pages', label: '标签', icon: Tags },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleViewModeChange(id)}
                aria-pressed={recordViewMode === id}
                aria-label={label}
                title={label}
                className={`flex min-h-8 min-w-8 items-center justify-center rounded-md transition-colors ${
                  recordViewMode === id
                    ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-200'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* Entry to Review View */}
          {!isNestedEntry && (
          <button
            onClick={() => setActiveTab('review')}
            className="min-h-9 flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 rounded-lg hover:bg-gray-100 bg-gray-50 border border-gray-200/60 transition-colors"
            title="打开回顾页"
          >
            <BookOpen className="w-3.5 h-3.5 text-gray-600" />
            <span className="font-medium">回顾</span>
          </button>
          )}
          <button
            onClick={() => setActiveTab('desk')}
            className="min-h-9 flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 px-2.5 rounded-lg hover:bg-emerald-100 bg-emerald-50 border border-emerald-200/70 transition-colors"
            title="打開專案"
          >
            <Rows3 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-700">專案</span>
          </button>
        </div>
      </div>

      {recordViewMode !== 'timeline' && (
        <div className="flex flex-col border-b border-gray-100 bg-white">
          <div className="record-quick-jumps relative z-20 flex flex-shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-1.5">
            <div className="flex flex-shrink-0 items-center rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white">
              {dayGroups[pageIndex]?.dateKey === visiblePageDate
                ? dayGroups[pageIndex].label
                : visiblePageDate}
            </div>
            {quickJumpTargets.map((target) => (
              <QuickChip
                key={target.label}
                active={visiblePageDate === target.dateKey}
                onClick={() => jumpToDate(target.dateKey)}
              >
                {target.label}
              </QuickChip>
            ))}
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
          {recordViewMode === 'tag-pages' && currentTagSections.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-1.5">
              {currentTagSections.map((section) => (
                <QuickChip
                  key={section.tagKey}
                  active={section.tagKey === selectedTagKey}
                  onClick={() => scrollToDateTagSection(visiblePageDate, section.tagKey)}
                >
                  {section.isUntagged ? (
                    <Tag className="h-2.5 w-2.5" />
                  ) : (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: section.color ?? '#9CA3AF' }}
                    />
                  )}
                  <span>{section.tagLabel}</span>
                  <span className="font-mono text-[10px] text-gray-400">{section.count}</span>
                </QuickChip>
              ))}
            </div>
          )}
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
      ) : recordViewMode === 'daily-pages' ? (
        <PagedScroller
          pages={dayGroups}
          getKey={(group) => group.dateKey}
          scrollerRef={pageScrollerRef}
          onScroll={handlePageScroll}
          ariaLabel="按日期翻页浏览"
          sectionAriaLabel={(group) => `${group.label}，${group.count}条记录`}
          renderPage={renderDayPage}
        />
      ) : (
        <PagedScroller
          pages={dayGroups}
          getKey={(group) => group.dateKey}
          scrollerRef={pageScrollerRef}
          onScroll={handlePageScroll}
          ariaLabel="按日期翻页浏览（标签分节）"
          sectionAriaLabel={(group) => `${group.label}，${group.count}条记录`}
          getSectionId={(group) => `tag-page-${group.dateKey}`}
          onSectionScroll={(group) => handleTagSectionScroll(group.dateKey)}
          renderPage={renderTagDatePage}
        />
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
        onCreateDrawer={handleCreateDrawerFromRecord}
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

