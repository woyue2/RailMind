import React, { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, ExternalLink } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { formatSimpleDate, formatTime, calculateDaysBetween } from '../utils/dateUtils';
import { parseISO, differenceInDays, format } from 'date-fns';
import { ImageViewerModal } from '../components/modals/ImageViewerModal';

export const ThreadDetailView: React.FC = () => {
  const selectedThreadId = useFlowStore((s) => s.selectedThreadId);
  const threads = useFlowStore((s) => s.threads);
  const getThreadRecords = useFlowStore((s) => s.getThreadRecords);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const openDateRecordFromThread = useFlowStore((s) => s.openDateRecordFromThread);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const handleOpenViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const thread = threads.find((t) => t.id === selectedThreadId);
  const records = useMemo(() => {
    if (!selectedThreadId) return [];
    return getThreadRecords(selectedThreadId);
  }, [selectedThreadId, getThreadRecords]);

  // Calculate total span in days
  const spanDays = useMemo(() => {
    if (records.length <= 1) return 1;
    const firstDate = parseISO(records[0].created_at);
    const lastDate = parseISO(records[records.length - 1].created_at);
    const diff = Math.abs(differenceInDays(lastDate, firstDate));
    return diff === 0 ? 1 : diff;
  }, [records]);

  if (!thread) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 bg-white">
        <p className="text-sm text-gray-500 mb-4">未找到该思维线</p>
        <button
          onClick={() => setActiveTab('review')}
          className="px-4 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg"
        >
          返回回顾页
        </button>
      </div>
    );
  }

  const handleJumpToDateRecord = (isoDate: string) => {
    try {
      const dateKey = format(parseISO(isoDate), 'yyyy-MM-dd');
      openDateRecordFromThread(dateKey, thread.id);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {/* 1. Header Bar: Thread Title & Subtitle */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('review')}
            className="p-1 -ml-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors"
            title="返回回顾页"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {thread.title}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              共 {records.length} 条记录 · 跨度 {spanDays} 天
            </p>
          </div>
        </div>
      </div>

      {/* 2. Continuous Vertical Timeline */}
      <div className="p-6 flex-1">
        {records.length === 0 ? (
          <div className="py-20 text-center text-xs text-gray-400">
            该思维线下暂无记录
          </div>
        ) : (
          <div className="relative pl-6 space-y-0">
            {records.map((item, index) => {
              const isLast = index === records.length - 1;
              const prevItem = index > 0 ? records[index - 1] : null;
              const daysFromPrev = prevItem
                ? calculateDaysBetween(prevItem.created_at, item.created_at)
                : 0;

              return (
                <div key={item.id} className="relative">
                  {/* Interval "N天后" indicator between nodes */}
                  {index > 0 && daysFromPrev > 0 && (
                    <div className="relative py-4 my-1">
                      {/* Vertical background connector line */}
                      <div className="absolute -left-6 top-0 bottom-0 w-0.5 bg-gray-200/90" />
                      {/* Days after indicator label badge */}
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-mono text-gray-500 bg-gray-100/90 rounded-full border border-gray-200/60 ml-2">
                        <Sparkles className="w-2.5 h-2.5 text-gray-400" />
                        <span>{daysFromPrev === 0 ? '同日' : `${daysFromPrev}天后`}</span>
                      </div>
                    </div>
                  )}

                  {/* Timeline Node Item */}
                  <div className="relative flex items-start pt-1 pb-2 group">
                    {/* Vertical connecting line to next item if not last */}
                    {!isLast && (
                      <div className="absolute -left-6 top-3 bottom-0 w-0.5 bg-gray-200/90 pointer-events-none" />
                    )}

                    {/* Uniform Neutral Solid Dot Node ● */}
                    <div className="absolute -left-[27.5px] top-2.5 w-2.5 h-2.5 rounded-full bg-gray-700 ring-4 ring-white" />

                    {/* Node Content Card (Clickable to jump to date context) */}
                    <div
                      onClick={() => handleJumpToDateRecord(item.created_at)}
                      className="flex-1 pl-2 cursor-pointer"
                      title="点击查看当天上下文记录"
                    >
                      {/* Date header with context jump indicator */}
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1 pr-1">
                        <span className="font-semibold">● {formatSimpleDate(item.created_at)} {formatTime(item.created_at)}</span>
                        <span className="text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">
                          查看当天上下文 <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </div>

                      {/* Original Record Text Card */}
                      <div className="text-sm text-gray-800 leading-relaxed break-words bg-gray-50/70 p-3 rounded-xl border border-gray-100 group-hover:bg-blue-50/40 group-hover:border-blue-200/60 group-hover:shadow-2xs transition-all">
                        {item.text && <div>{item.text}</div>}
                        {/* Note Images Preview */}
                        {item.imgs && item.imgs.length > 0 && (
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            {item.imgs.length === 1 ? (
                              <div
                                onClick={() => handleOpenViewer(item.imgs!, 0)}
                                className="relative max-w-xs max-h-40 rounded-lg overflow-hidden border border-gray-200 shadow-2xs cursor-zoom-in"
                              >
                                <img
                                  src={item.imgs[0]}
                                  alt="便签图片"
                                  className="w-full h-full max-h-40 object-cover hover:scale-102 transition-transform"
                                />
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5 max-w-xs">
                                {item.imgs.map((src, imgIdx) => (
                                  <div
                                    key={imgIdx}
                                    onClick={() => handleOpenViewer(item.imgs!, imgIdx)}
                                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 shadow-2xs cursor-zoom-in"
                                  >
                                    <img
                                      src={src}
                                      alt={`便签图片 ${imgIdx + 1}`}
                                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Associated Tag if present */}
                      {item.tag && (
                        <div className="mt-1.5 pl-1">
                          <span
                            className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded"
                            style={{
                              color: item.tag.color,
                              backgroundColor: `${item.tag.color}15`,
                            }}
                          >
                            [{item.tag.name}]
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Viewer Full-Screen Modal */}
      <ImageViewerModal
        isOpen={viewerOpen}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
};
