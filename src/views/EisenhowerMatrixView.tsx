import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Ellipsis, LayoutGrid, X } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { EisenhowerQuadrant, RecordItem } from '../types';
import { formatShortDateTime, getLocalDateKey } from '../utils/dateUtils';
import { EISENHOWER_QUADRANTS, EisenhowerQuadrantModal } from '../components/modals/EisenhowerQuadrantModal';
import { flashRecord } from '../utils/scrollUtils';

export function EisenhowerMatrixView() {
  const records = useFlowStore((state) => state.records);
  const setActiveTab = useFlowStore((state) => state.setActiveTab);
  const openDateRecord = useFlowStore((state) => state.openDateRecord);
  const updateRecord = useFlowStore((state) => state.updateRecord);
  const toggleCompletedRecord = useFlowStore((state) => state.toggleCompletedRecord);
  const [menuRecordId, setMenuRecordId] = useState<string | null>(null);
  const [movingRecord, setMovingRecord] = useState<RecordItem | null>(null);

  const matrixRecords = useMemo(
    () => records.filter((record) => record.eisenhower_quadrant)
      .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()),
    [records],
  );

  const jumpToRecord = (record: RecordItem) => {
    openDateRecord(getLocalDateKey(record.created_at));
    flashRecord(record.id, 250);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fafafa]">
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => setActiveTab('review')} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="返回回顧頁" aria-label="返回回顧頁">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900"><LayoutGrid className="h-4 w-4 text-violet-600" />重要 × 緊急</h2>
              <p className="truncate text-[11px] text-gray-500">不要把「很急」誤認成「很重要」</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{matrixRecords.length} 項</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-gray-200">
        {EISENHOWER_QUADRANTS.map((quadrant) => {
          const items = matrixRecords.filter((record) => record.eisenhower_quadrant === quadrant.id);
          return (
            <section key={quadrant.id} className="flex min-h-0 min-w-0 flex-col bg-[#fafafa] p-2 sm:p-4" aria-labelledby={`quadrant-${quadrant.id}`}>
              <div className="mb-2 shrink-0">
                <h3 id={`quadrant-${quadrant.id}`} className="text-[11px] font-semibold leading-tight text-gray-900 sm:text-sm">
                  <span className="mr-1">{quadrant.number}</span>{quadrant.title}
                </h3>
                <p className="mt-0.5 text-[10px] text-gray-500 sm:text-xs">{quadrant.action}</p>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
                {items.map((record) => (
                  <article key={record.id} onClick={() => jumpToRecord(record)}
                    className="relative cursor-pointer rounded-xl border border-gray-200 bg-white p-2 shadow-xs transition-shadow hover:shadow-sm sm:p-3">
                    <div className="flex items-start gap-1">
                      <p className={`min-w-0 flex-1 break-words text-[11px] leading-snug sm:text-[13px] ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {record.text || '（無文字記錄）'}
                      </p>
                      <button type="button" onClick={(event) => { event.stopPropagation(); setMenuRecordId(menuRecordId === record.id ? null : record.id); }}
                        className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="記錄選單">
                        <Ellipsis className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="truncate text-[9px] text-gray-400 sm:text-[11px]">{formatShortDateTime(record.created_at)}</span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); toggleCompletedRecord(record.id); }}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${record.is_completed ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-gray-200 text-gray-300 hover:border-emerald-200 hover:text-emerald-600'}`}
                        aria-label={record.is_completed ? '取消完成' : '標記完成'} aria-pressed={Boolean(record.is_completed)}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {menuRecordId === record.id && (
                      <div className="absolute right-1 top-8 z-20 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-[11px] shadow-lg sm:w-36 sm:text-xs" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => { setMovingRecord(record); setMenuRecordId(null); }} className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50">移至其他象限</button>
                        <button type="button" onClick={() => { updateRecord(record.id, { eisenhower_quadrant: null }); setMenuRecordId(null); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-red-600 hover:bg-red-50"><X className="h-3 w-3" />從矩陣移除</button>
                      </div>
                    )}
                  </article>
                ))}
                {!items.length && <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-gray-200 text-[10px] text-gray-400 sm:text-xs">暫無項目</div>}
              </div>
            </section>
          );
        })}
      </div>

      <EisenhowerQuadrantModal
        isOpen={Boolean(movingRecord)}
        current={movingRecord?.eisenhower_quadrant as EisenhowerQuadrant | undefined}
        title={movingRecord?.text}
        onClose={() => setMovingRecord(null)}
        onSelect={(quadrant) => {
          if (movingRecord) updateRecord(movingRecord.id, { eisenhower_quadrant: quadrant });
          setMovingRecord(null);
        }}
      />
    </div>
  );
}
