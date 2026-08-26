import { useState, useMemo } from 'react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordItemRow } from './RecordItemRow';
import { RecordInputBar } from './RecordInputBar';
import { ThreadPickerModal } from '../../components/modals/ThreadPickerModal';
import { TagPickerModal } from '../../components/modals/TagPickerModal';
import { SettingsModal } from '../../components/modals/SettingsModal';
import { formatDateLabel } from '../../utils/dateUtils';
import { EnrichedRecordItem } from '../../types';
import { Calendar, RotateCcw, BookOpen, ArrowLeft, Cloud, Settings } from 'lucide-react';
import { isSameDay, parseISO } from 'date-fns';
import { isR2Configured, loadR2Settings } from '../../sync/credentials';

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

  const parentThread = fromThreadDetailId
    ? threads.find((t) => t.id === fromThreadDetailId)
    : null;

  // Modal State
  const [threadModalOpen, setThreadModalOpen] = useState(false);
  const [targetRecordForThread, setTargetRecordForThread] = useState<{ id: string; text: string } | null>(null);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [targetRecordForTag, setTargetRecordForTag] = useState<{ id: string; currentTagId: string | null } | null>(null);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const r2Enabled = isR2Configured() && loadR2Settings().enabled;

  // Filter records by selected date or today
  const filteredRecords = useMemo(() => {
    // If a specific date is selected (from review date click)
    if (selectedDate) {
      const target = parseISO(selectedDate);
      return records.filter((r) => isSameDay(parseISO(r.created_at), target));
    }

    // Default Main Page behavior: Show Today (or fallback to latest main date if today has 0 entries)
    const today = new Date();
    const todayRecords = records.filter((r) => isSameDay(parseISO(r.created_at), today));
    if (todayRecords.length > 0) return todayRecords;

    // In demo dataset (base date 2026-08-26), filter by the most prominent date with records
    const targetDay = parseISO('2026-08-26');
    const demoDayRecords = records.filter((r) => isSameDay(parseISO(r.created_at), targetDay));
    if (demoDayRecords.length > 0) return demoDayRecords;

    return records.slice(0, 10);
  }, [records, selectedDate]);

  // Build tree structure for records (roots vs children)
  const treeData = useMemo(() => {
    const recordMap = new Map<string, EnrichedRecordItem>();

    // Enrich all records with thread and tag info
    filteredRecords.forEach((r) => {
      recordMap.set(r.id, {
        ...r,
        thread: threads.find((t) => t.id === r.thread_id),
        tag: tags.find((t) => t.id === r.tag_id),
        children: [],
      });
    });

    const roots: EnrichedRecordItem[] = [];

    // Construct hierarchy
    recordMap.forEach((item) => {
      if (item.parent_id && recordMap.has(item.parent_id)) {
        recordMap.get(item.parent_id)!.children!.push(item);
      } else {
        roots.push(item);
      }
    });

    // Sort roots chronologically (09:12 -> 09:40 -> 11:15)
    return roots.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [filteredRecords, tags, threads]);

  const activeDateLabel = useMemo(() => {
    if (filteredRecords.length === 0) return '今天 · 0条';
    const firstDate = filteredRecords[0].created_at;
    const label = formatDateLabel(firstDate);
    return `${label} · ${filteredRecords.length}条`;
  }, [filteredRecords]);

  // Handlers for Modals
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
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {/* If navigated here from Thread Detail, show Back arrow to that Thread */}
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
            /* If navigated here from Review page's Date section, show prominent Back arrow to Review */
            <button
              onClick={backToReview}
              className="p-1 -ml-1 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1 mr-1"
              title="返回回顾页"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-medium text-gray-700">回顾</span>
            </button>
          ) : null}

          <span className="font-semibold text-gray-900 text-sm tracking-tight">
            {activeDateLabel}
          </span>

          {selectedDate && (
            <button
              onClick={resetToTodayRecord}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full"
              title="回到今天所有记录"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              回今天
            </button>
          )}
        </div>

        {/* Action Group: Sync / Settings / Review */}
        <div className="flex items-center gap-1.5">
          {/* Cloud Sync Status / Open Settings */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
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
            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1 rounded-lg hover:bg-gray-100 bg-gray-50 border border-gray-200/60 transition-colors"
            title="打开回顾页"
          >
            <BookOpen className="w-3.5 h-3.5 text-gray-600" />
            <span className="font-medium">回顾</span>
          </button>
        </div>
      </div>

      {/* 2. Timeline & Branch Tree List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3 text-gray-300">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-gray-500">暂无记录</p>
            <p className="text-xs text-gray-400 mt-1">在下方输入框写下此刻的想法吧</p>
          </div>
        ) : (
          treeData.map((item) => (
            <div key={item.id} className="border-b border-gray-100/70 last:border-b-0 pb-1 mb-1">
              <RecordItemRow
                item={item}
                level={0}
                onOpenThreadPicker={handleOpenThreadPicker}
                onOpenTagPicker={handleOpenTagPicker}
              />
            </div>
          ))
        )}
      </div>

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
    </div>
  );
};
