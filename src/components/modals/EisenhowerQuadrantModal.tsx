import { X } from 'lucide-react';
import { EisenhowerQuadrant } from '../../types';
import { useSystemBack } from '../../hooks/useSystemBack';

export const EISENHOWER_QUADRANTS: Array<{
  id: EisenhowerQuadrant;
  number: string;
  title: string;
  action: string;
  tone: string;
}> = [
  { id: 'important-urgent', number: '①', title: '重要且緊急', action: '立即做', tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  { id: 'important-not-urgent', number: '②', title: '重要但不緊急', action: '排期做', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'not-important-urgent', number: '③', title: '不重要但緊急', action: '委派／快速處理', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  { id: 'not-important-not-urgent', number: '④', title: '不重要且不緊急', action: '刪除／暫緩', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
];

interface Props {
  isOpen: boolean;
  current?: EisenhowerQuadrant | null;
  title?: string;
  onSelect: (quadrant: EisenhowerQuadrant) => void;
  onClose: () => void;
}

export function EisenhowerQuadrantModal({ isOpen, current, title, onSelect, onClose }: Props) {
  useSystemBack(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="quadrant-modal-title">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="quadrant-modal-title" className="text-base font-semibold text-gray-900">選擇象限</h3>
            <p className="mt-1 truncate text-xs text-gray-500">{title || '這條記錄要放在哪裡？'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="關閉">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {EISENHOWER_QUADRANTS.map((quadrant) => (
            <button key={quadrant.id} type="button" onClick={() => onSelect(quadrant.id)} aria-pressed={current === quadrant.id}
              className={`min-h-24 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${quadrant.tone} ${current === quadrant.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
              <div className="text-lg font-semibold">{quadrant.number}</div>
              <div className="mt-1 text-xs font-semibold">{quadrant.title}</div>
              <div className="mt-0.5 text-[11px] opacity-70">{quadrant.action}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
