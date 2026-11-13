import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Ellipsis, Gem, RefreshCw, X } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { RecordItem } from '../types';
import { formatShortDateTime, getLocalDateKey } from '../utils/dateUtils';
import { VALUE_QUADRANTS } from '../utils/valuePriority';
import { ValuePriorityWizard } from '../components/modals/ValuePriorityWizard';
import { flashRecord } from '../utils/scrollUtils';

export function ValuePriorityMatrixView() {
  const records = useFlowStore((state) => state.records);
  const setActiveTab = useFlowStore((state) => state.setActiveTab);
  const openDateRecord = useFlowStore((state) => state.openDateRecord);
  const updateRecord = useFlowStore((state) => state.updateRecord);
  const toggleCompletedRecord = useFlowStore((state) => state.toggleCompletedRecord);
  const [menuRecordId, setMenuRecordId] = useState<string | null>(null);
  const [wizardRecord, setWizardRecord] = useState<RecordItem | null>(null);
  const [showContainers, setShowContainers] = useState(true);

  const classified = useMemo(() => records.filter((record) => record.value_priority?.quadrant).sort((a, b) => {
    const ap = a.value_priority!;
    const bp = b.value_priority!;
    if (Boolean(ap.unlocks_work) !== Boolean(bp.unlocks_work)) return ap.unlocks_work ? -1 : 1;
    if (Boolean(ap.high_leverage) !== Boolean(bp.high_leverage)) return ap.high_leverage ? -1 : 1;
    return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime();
  }), [records]);
  const containers = useMemo(() => records.filter((record) => record.value_priority?.is_container), [records]);

  const jumpToRecord = (record: RecordItem) => {
    openDateRecord(getLocalDateKey(record.created_at));
    flashRecord(record.id, 250);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fafafa]">
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => setActiveTab('review')} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="返回回顧頁"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0"><h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900"><Gem className="h-4 w-4 text-violet-600" />價值 × 晚做損失</h2><p className="truncate text-[11px] text-gray-500">價值決定要不要做，晚做損失決定何時做</p></div>
          </div>
          <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{classified.length} 項</span>
        </div>
        {containers.length > 0 && <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60">
          <button type="button" onClick={() => setShowContainers((value) => !value)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-violet-800">
            <span>大任務 · {containers.length}</span>{showContainers ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showContainers && <div className="space-y-1 border-t border-violet-100 px-3 py-2">{containers.map((container) => {
            const children = records.filter((record) => record.parent_id === container.id && record.value_priority?.quadrant);
            const done = children.filter((record) => record.is_completed).length;
            return <button key={container.id} type="button" onClick={() => jumpToRecord(container)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-xs text-gray-700"><span className="truncate">{container.text}</span><span className="shrink-0 text-violet-600">{done}/{children.length} 完成</span></button>;
          })}</div>}
        </div>}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-gray-200">
        {VALUE_QUADRANTS.map((quadrant) => {
          const items = classified.filter((record) => record.value_priority?.quadrant === quadrant.id);
          return <section key={quadrant.id} className="flex min-h-0 min-w-0 flex-col bg-[#fafafa] p-1.5 sm:p-2.5">
            <div className="mb-1.5 shrink-0"><h3 className="text-[11px] font-semibold leading-tight text-gray-900 sm:text-sm"><span className="mr-1">{quadrant.number}</span>{quadrant.title}</h3><p className="mt-0.5 truncate text-[9px] text-gray-500 sm:text-[11px]">{quadrant.axes} · {quadrant.action}</p></div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-1">
              {items.map((record) => <article key={record.id} title={record.value_priority?.reason} onClick={() => jumpToRecord(record)} className="relative cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-xs hover:border-gray-300 hover:shadow-sm sm:px-2.5 sm:py-2">
                <div className="flex items-start gap-1.5">
                  <p className={`line-clamp-2 min-w-0 flex-1 break-words text-[11px] leading-[1.35] sm:text-[13px] ${record.is_completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{record.text || '（無文字記錄）'}</p>
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                    <button type="button" onClick={(event) => { event.stopPropagation(); toggleCompletedRecord(record.id); }} className={`flex h-6 w-6 items-center justify-center rounded-full ${record.is_completed ? 'bg-emerald-50 text-emerald-600' : 'text-gray-300 hover:bg-emerald-50 hover:text-emerald-600'}`} aria-label={record.is_completed ? '取消完成' : '標記完成'}><Check className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); setMenuRecordId(menuRecordId === record.id ? null : record.id); }} className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" aria-label="記錄選單"><Ellipsis className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                  {record.value_priority?.unlocks_work && <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[8px] font-medium leading-none text-violet-700 sm:text-[9px]">解鎖</span>}
                  {record.value_priority?.high_leverage && <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-medium leading-none text-blue-700 sm:text-[9px]">高槓桿</span>}
                  {record.value_priority?.is_routine && <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-medium leading-none text-emerald-700 sm:text-[9px]">日常累積</span>}
                  <span className="ml-auto shrink-0 text-[8px] text-gray-400 sm:text-[9px]">{formatShortDateTime(record.created_at)}</span>
                </div>
                {menuRecordId === record.id && <div className="absolute right-1 top-7 z-20 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-[11px] shadow-lg" onClick={(event) => event.stopPropagation()}>
                  <p className="border-b border-gray-100 px-3 py-2 text-[10px] leading-4 text-gray-500">{record.value_priority?.reason}</p>
                  <button type="button" onClick={() => { setWizardRecord(record); setMenuRecordId(null); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-gray-700 hover:bg-gray-50"><RefreshCw className="h-3 w-3" />重新判斷</button>
                  <button type="button" onClick={() => { updateRecord(record.id, { value_priority: null }); setMenuRecordId(null); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-red-600 hover:bg-red-50"><X className="h-3 w-3" />從新版移除</button>
                </div>}
              </article>)}
              {!items.length && <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-gray-200 px-2 text-center text-[10px] text-gray-400 sm:text-xs">暫無項目</div>}
            </div>
          </section>;
        })}
      </div>
      <ValuePriorityWizard isOpen={Boolean(wizardRecord)} record={wizardRecord} onClose={() => setWizardRecord(null)} />
    </div>
  );
}
