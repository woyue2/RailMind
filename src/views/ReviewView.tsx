import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, ArrowLeft, Tag, Calendar, Layers } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { formatShortDateTime } from '../utils/dateUtils';
import { parseISO, format } from 'date-fns';

export const ReviewView = () => {
  const records = useFlowStore((s) => s.records);
  const tags = useFlowStore((s) => s.tags);
  const threads = useFlowStore((s) => s.threads);
  const getTagRecords = useFlowStore((s) => s.getTagRecords);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const openThreadDetail = useFlowStore((s) => s.openThreadDetail);
  const openDateRecord = useFlowStore((s) => s.openDateRecord);

  // Accordion open/close state for Tags
  const [expandedTagIds, setExpandedTagIds] = useState<Record<string, boolean>>({
    tag_2: true, // Default expand [跟风] matching example in doc
  });

  const toggleTagExpand = (tagId: string) => {
    setExpandedTagIds((prev) => ({
      ...prev,
      [tagId]: !prev[tagId],
    }));
  };

  // Group records by Date (YYYY-MM-DD), sorted newest first
  const dateGroups = useMemo(() => {
    const map = new Map<string, { dateKey: string; displayDate: string; count: number }>();

    records.forEach((r) => {
      try {
        const d = parseISO(r.created_at);
        const dateKey = format(d, 'yyyy-MM-dd');
        const displayDate = format(d, 'M月d日');

        if (!map.has(dateKey)) {
          map.set(dateKey, { dateKey, displayDate, count: 0 });
        }
        map.get(dateKey)!.count += 1;
      } catch {
        // ignore invalid dates
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime()
    );
  }, [records]);

  // Group records by Thread with counts, sorted by last_used_at newest first
  const threadGroups = useMemo(() => {
    return [...threads]
      .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime())
      .map((th) => {
        const count = records.filter((r) => r.thread_id === th.id).length;
        return {
          ...th,
          count,
        };
      });
  }, [threads, records]);

  // Navigate to RecordView for that date
  const handleDateClick = (dateKey: string) => {
    openDateRecord(dateKey);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] overflow-y-auto">
      {/* Header with back button */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200/80 bg-white sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('record')}
          className="p-1 -ml-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors"
          title="返回记录页"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-gray-900 tracking-tight">回顾</h2>
      </div>

      <div className="p-4 space-y-5 pb-8">
        {/* Section 1: 按标签 (By Tag) - 首屏显示前4个，其余滚动侧边栏查看 */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-gray-500 tracking-wide">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              <span>按标签</span>
            </div>
            <span className="text-[11px] font-normal text-gray-400">共 {tags.length} 个标签</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="review-card-scroll divide-y divide-gray-100">
              {tags.map((tag) => {
                const tagRecords = getTagRecords(tag.id);
                const isExpanded = !!expandedTagIds[tag.id];

                return (
                  <div key={tag.id} className="transition-colors">
                    {/* Tag Header Row */}
                    <button
                      onClick={() => toggleTagExpand(tag.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 text-xs font-medium rounded"
                          style={{
                            color: tag.color,
                            backgroundColor: `${tag.color}15`,
                          }}
                        >
                          [{tag.name}]
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{tagRecords.length} 条</span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Accordion Expanded Preview List */}
                    {isExpanded && (
                      <div className="bg-gray-50/60 px-4 py-2 border-t border-gray-100/80 space-y-2">
                        {tagRecords.length === 0 ? (
                          <div className="text-xs text-gray-400 py-1.5 pl-2">暂无标记此标签的记录</div>
                        ) : (
                          tagRecords.map((rec) => (
                            <div
                              key={rec.id}
                              className="flex items-start gap-2.5 text-xs py-1 text-gray-700 pl-1"
                            >
                              <span className="text-[11px] font-mono text-gray-400 flex-shrink-0 pt-0.5">
                                {formatShortDateTime(rec.created_at)}
                              </span>
                              <span className="flex-1 break-words">{rec.text}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 2: 按日期 (By Date) - 首屏显示前4个最新日期，其余滚动侧边栏查看 */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-gray-500 tracking-wide">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>按日期</span>
            </div>
            <span className="text-[11px] font-normal text-gray-400">共 {dateGroups.length} 天</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="review-card-scroll divide-y divide-gray-100">
              {dateGroups.map((grp) => (
                <button
                  key={grp.dateKey}
                  onClick={() => handleDateClick(grp.dateKey)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/80 transition-colors text-left group"
                >
                  <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                    {grp.displayDate}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{grp.count} 条</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: 按思维线 (By Thread) - 首屏显示前4个活跃思维线，其余滚动侧边栏查看 */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-gray-500 tracking-wide">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>按思维线</span>
            </div>
            <span className="text-[11px] font-normal text-gray-400">共 {threadGroups.length} 条思维线</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="review-card-scroll divide-y divide-gray-100">
              {threadGroups.map((th) => (
                <button
                  key={th.id}
                  onClick={() => openThreadDetail(th.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/80 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors">
                      {th.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{th.count} 条</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
