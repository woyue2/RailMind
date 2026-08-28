import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordItemRow } from './RecordItemRow';
import { RecordInputBar } from './RecordInputBar';
import { FloatingBubblePin } from '../../components/record/FloatingBubblePin';
import { ThreadPickerModal } from '../../components/modals/ThreadPickerModal';
import { TagPickerModal } from '../../components/modals/TagPickerModal';
import { SettingsModal } from '../../components/modals/SettingsModal';
import { HomeLinkModal } from '../../components/modals/HomeLinkModal';
import { getRelativeDayMeta } from '../../utils/dateUtils';
import { EnrichedRecordItem } from '../../types';
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
} from 'lucide-react';
import { parseISO, format } from 'date-fns';
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
  const fromReviewDate = useFlowStore((s) => s.fromReviewDate);
  const fromThreadDetailId = useFlowStore((s) => s.fromThreadDetailId);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const backToReview = useFlowStore((s) => s.backToReview);
  const backToThreadDetail = useFlowStore((s) => s.backToThreadDetail);
  const resetToTodayRecord = useFlowStore((s) => s.resetToTodayRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const homeLink = useFlowStore((s) => s.homeLink);
  const setHomeLink = useFlowStore((s) => s.setHomeLink);

  const parentThread = fromThreadDetailId
    ? threads.find((t) => t.id === fromThreadDetailId)
    : null;

  // Scroll Container & Anchors
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const prevRecordCountRef = useRef(records.length);

  // Modal State
  const [threadModalOpen, setThreadModalOpen] = useState(false);
  const [targetRecordForThread, setTargetRecordForThread] = useState<{ id: string; text: string } | null>(null);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [targetRecordForTag, setTargetRecordForTag] = useState<{ id: string; currentTagId: string | null } | null>(null);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [homeLinkModalOpen, setHomeLinkModalOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
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
    const map = new Map<string, EnrichedRecordItem[]>();

    records.forEach((r) => {
      try {
        const d = parseISO(r.created_at);
        const dateKey = format(d, 'yyyy-MM-dd');
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push({
          ...r,
          thread: threads.find((t) => t.id === r.thread_id),
          tag: tags.find((t) => t.id === r.tag_id),
          children: [],
        });
      } catch {
        // ignore invalid dates
      }
    });

    // 2. Sort dates in chronological ascending order (oldest date at Top -> newest/today at Bottom)
    const sortedDateKeys = Array.from(map.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    // 3. Construct branch-tree hierarchy within each day
    const groups: DayGroup[] = sortedDateKeys.map((dateKey) => {
      const dayRecords = map.get(dateKey) || [];
      const recordLookup = new Map<string, EnrichedRecordItem>();

      dayRecords.forEach((item) => {
        recordLookup.set(item.id, item);
      });

      const roots: EnrichedRecordItem[] = [];

      dayRecords.forEach((item) => {
        if (item.parent_id && recordLookup.has(item.parent_id)) {
          recordLookup.get(item.parent_id)!.children!.push(item);
        } else {
          roots.push(item);
        }
      });

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
  }, [records, tags, threads]);

  // Total summary of today's records or active context
  const headerSummary = useMemo(() => {
    const todayGroup = dayGroups.find((g) => g.isToday);
    const todayCount = todayGroup ? todayGroup.count : 0;
    const totalCount = records.length;
    return { todayCount, totalCount };
  }, [dayGroups, records]);

  // Initial mount: Anchor to bottom smoothly (Now / Latest record)
  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  // When a new record is added, smoothly scroll to bottom
  useEffect(() => {
    if (records.length > prevRecordCountRef.current) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevRecordCountRef.current = records.length;
  }, [records.length]);

  // If navigated to a specific date from Review page, scroll to that date group
  useEffect(() => {
    if (selectedDate && scrollContainerRef.current) {
      const targetElement = document.getElementById(`day-group-${selectedDate}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [selectedDate]);

  // Handle scroll events to detect when user has scrolled up away from bottom
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // If scrolled more than 260px above bottom, show the floating "回到此刻" button
    setShowScrollToBottom(distanceFromBottom > 260);
  };

  const scrollToBottom = () => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 1. Header Bar: Date and count + Navigation buttons */}
      <div className="record-header flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
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
            <span className="text-[11px] text-gray-400 font-medium">
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

        {/* Action Group: Sync / Settings / Review */}
        <div className="flex items-center gap-1.5">
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
        </div>
      </div>

      {/* 📌 Floating Draggable Bubble Pin Note (Top Position with bounce float) */}
      <FloatingBubblePin />

      {/* 2. Continuous Multi-Day Timeline Stream (Past at Top -> Now at Bottom) */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 relative scroll-smooth space-y-4"
      >
        {dayGroups.length === 0 ? (
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
                      backgroundColor: 'hsla(35, 55%, 20%, 0.70)',
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

                {/* Day's Tree Stream */}
                <div className="space-y-0.5 pl-1">
                  {group.roots.map((item) => (
                    <div key={item.id} className="border-b border-gray-100/70 last:border-b-0 pb-1 mb-1">
                      <RecordItemRow
                        item={item}
                        level={0}
                        onOpenThreadPicker={handleOpenThreadPicker}
                        onOpenTagPicker={handleOpenTagPicker}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Bottom invisible anchor to maintain positioning at Now */}
        <div ref={bottomAnchorRef} className="h-2" />
      </div>

      {/* Floating Action: Quick Scroll back to Bottom ("回到此刻 / Today") */}
      {showScrollToBottom && (
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

      {/* 3. Bottom Sticky Input Bar (Recent Thread Capsules + Input + Send) */}
      <RecordInputBar />

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
