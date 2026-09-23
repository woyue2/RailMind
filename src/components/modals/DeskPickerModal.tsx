import { useMemo } from 'react';
import { Rows3, X } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { getLocalDateKey } from '../../utils/dateUtils';

interface DeskPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 當前記錄的 id；若已綁桌邊，會顯示「已在抽屜 XXX」 */
  recordId: string | null;
  onBind: (recordId: string, drawerId: string) => void;
  onUnbind?: (recordId: string) => void;
}

/** Row 就是日期容器，日期由 row.created_at 決定，與 store/DeskEdgeView 統一。 */
function rowDateKey(row: { created_at: string }): string {
  return getLocalDateKey(row.created_at);
}

function autoTitle(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateKey;
  return `${y}年${m}月${d}日`;
}

export function DeskPickerModal({
  isOpen,
  onClose,
  recordId,
  onBind,
  onUnbind,
}: DeskPickerModalProps) {
  const rows = useFlowStore((s) => s.deskRows);
  const records = useFlowStore((s) => s.records);

  const targetRecord = recordId ? records.find((r) => r.id === recordId) : null;
  const currentEntryId = targetRecord?.desk_entry_id ?? null;

  // 聚合：按日期把所有 rows 的 drawers 分到 section
  const sections = useMemo(() => {
    const byDate = new Map<
      string,
      {
        dateKey: string;
        title: string;
        drawers: { rowId: string; drawerId: string; title: string; entryCount: number; isCurrent: boolean }[];
      }
    >();

    rows.forEach((row) => {
      const dateKey = rowDateKey(row);
      const auto = autoTitle(dateKey);
      const hasManual = row.title !== auto;
      const title = hasManual ? row.title : auto;

      let section = byDate.get(dateKey);
      if (!section) {
        section = { dateKey, title, drawers: [] };
        byDate.set(dateKey, section);
      }

      row.drawers.forEach((drawer) => {
        const isCurrent = drawer.entries.some((e) => e.id === currentEntryId);
        section!.drawers.push({
          rowId: row.id,
          drawerId: drawer.id,
          title: drawer.title,
          entryCount: drawer.entries.length,
          isCurrent,
        });
      });
    });

    // 倒序：今天在最上
    return Array.from(byDate.values()).sort(
      (a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime()
    );
  }, [rows, currentEntryId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Rows3 className="w-4 h-4 text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900">收進桌邊抽屜</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info bar */}
        <div className="px-5 py-2 border-b border-gray-100 text-[12px] text-gray-500 leading-relaxed">
          選擇一個桌邊抽屜，這條記錄會自動收進去。抽屜裡的文字反過來也會出現在時間流裡。
        </div>

        {/* Current binding clear button */}
        {currentEntryId && recordId && onUnbind && (
          <div className="px-5 py-2">
            <button
              onClick={() => {
                onUnbind(recordId);
                onClose();
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-dashed border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 text-left transition-colors flex items-center justify-between"
            >
              <span>已在桌邊，點此解綁（保留時間流記錄）</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drawer list */}
        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {sections.length === 0 && (
            <div className="text-center text-xs text-gray-400 py-8">
              桌邊還沒有抽屜，先在桌邊建立第一個抽屜吧。
            </div>
          )}
          {sections.map((section) => (
            <div key={section.dateKey} className="space-y-1.5">
              <div className="text-[11px] font-medium text-gray-500 px-1">
                {section.title} · {section.drawers.length} 個抽屜
              </div>
              <div className="grid grid-cols-2 gap-2">
                {section.drawers.map((d) => (
                  <button
                    key={d.drawerId}
                    onClick={() => {
                      if (!recordId) return;
                      onBind(recordId, d.drawerId);
                      onClose();
                    }}
                    className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors border ${
                      d.isCurrent
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-800 hover:border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium">{d.title}</span>
                      {d.isCurrent && (
                        <span className="text-[10px] text-emerald-600 shrink-0">目前</span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">{d.entryCount} 條文字</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400">
          提示：桌邊抽屜裡的文字會自動同步為時間流記錄，從時間流裡勾選的完成狀態會自動回寫。
        </div>
      </div>
    </div>
  );
}
