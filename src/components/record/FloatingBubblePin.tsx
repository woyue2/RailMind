import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { Pin, X, Volume2, Image as ImageIcon } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordItem } from '../../types';
import { getLocalDateKey } from '../../utils/dateUtils';

export const FloatingBubblePin: React.FC = () => {
  const records = useFlowStore((s) => s.records);
  const unpinRecord = useFlowStore((s) => s.unpinRecord);
  const openDateRecord = useFlowStore((s) => s.openDateRecord);
  const setHighlightRecordId = useFlowStore((s) => s.setHighlightRecordId);

  // Filter pinned records (sorted newest pinned first)
  const pinnedRecords = useMemo(() => {
    return records
      .filter((r) => r.is_pinned)
      .sort((a, b) => {
        const timeA = new Date(a.pinned_at || a.created_at).getTime();
        const timeB = new Date(b.pinned_at || b.created_at).getTime();
        return timeB - timeA;
      });
  }, [records]);

  // Current active pinned record index when multiple are pinned
  const [activePinIndex, setActivePinIndex] = useState(0);

  // Drag state
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  const clampPosition = useCallback((candidate: { x: number; y: number }) => {
    const bubble = bubbleRef.current;
    if (!bubble) return candidate;

    const parent = bubble.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const parentWidth = parent?.clientWidth ?? window.innerWidth;
    const parentHeight = parent?.clientHeight ?? window.innerHeight;
    const header = document.querySelector<HTMLElement>('.record-header');
    const inputBar = document.querySelector<HTMLElement>('.record-input-bar');
    const minX = 8;
    const maxX = Math.max(minX, parentWidth - bubble.offsetWidth - 8);
    const minY = Math.max(8, (header?.getBoundingClientRect().bottom ?? parentRect.top) - parentRect.top + 8);
    const bottomInset = inputBar
      ? Math.max(8, parentRect.bottom - inputBar.getBoundingClientRect().top + 8)
      : 8;
    const maxY = Math.max(minY, parentHeight - bubble.offsetHeight - bottomInset);

    return {
      x: Math.max(minX, Math.min(candidate.x, maxX)),
      y: Math.max(minY, Math.min(candidate.y, maxY)),
    };
  }, []);

  useLayoutEffect(() => {
    if (!pinnedRecords.length) return;
    setPos((previous) => clampPosition(previous ?? { x: 12, y: 12 }));
  }, [clampPosition, pinnedRecords.length]);

  useEffect(() => {
    const reclamp = () => setPos((previous) => (previous ? clampPosition(previous) : previous));
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    window.visualViewport?.addEventListener('resize', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
      window.visualViewport?.removeEventListener('resize', reclamp);
    };
  }, [clampPosition]);

  if (pinnedRecords.length === 0) return null;

  // Safe bounds guard for active index
  const safeIndex = Math.min(activePinIndex, pinnedRecords.length - 1);
  const currentPin = pinnedRecords[safeIndex];

  // Jump to timeline note handler
  const handleJumpToOriginal = (record: RecordItem) => {
    const elementId = `record-${record.id}`;
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightRecordId(record.id);
      setTimeout(() => {
        setHighlightRecordId(null);
      }, 1600);
    } else {
      const targetDate = getLocalDateKey(record.created_at);
      openDateRecord(targetDate);
      setHighlightRecordId(record.id);
      setTimeout(() => {
        const targetEl = document.getElementById(elementId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => {
          setHighlightRecordId(null);
        }, 1600);
      }, 250);
    }
  };

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Avoid starting drag if clicking unpin X or switch buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const parent = bubbleRef.current.offsetParent as HTMLElement | null;
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };

    isDraggingRef.current = true;
    hasMovedRef.current = false;
    bubbleRef.current.setPointerCapture(e.pointerId);

    const curX = pos ? pos.x : rect.left - parentRect.left;
    const curY = pos ? pos.y : rect.top - parentRect.top;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: curX,
      initY: curY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !bubbleRef.current) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    setPos(
      clampPosition({
        x: dragStartRef.current.initX + dx,
        y: dragStartRef.current.initY + dy,
      })
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    bubbleRef.current?.releasePointerCapture(e.pointerId);

    // If user merely tapped without dragging, trigger jump to original note
    if (!hasMovedRef.current) {
      handleJumpToOriginal(currentPin);
    }
  };

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={
        pos
          ? {
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              position: 'absolute',
              maxWidth: 'calc(100% - 24px)',
            }
          : {
              top: '56px',
              left: '12px',
              right: '12px',
              position: 'absolute',
            }
      }
      className="z-10 pointer-events-auto touch-none cursor-grab active:cursor-grabbing select-none"
    >
      {/* Gentle Floating & Bouncing Animation Container */}
      <div className="animate-bubble-float transition-shadow duration-300">
        <div
          className="relative rounded-2xl px-3 py-2 flex items-center gap-2 border bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-amber-400/40 dark:border-amber-500/30 shadow-md shadow-amber-500/10 active:scale-[0.98] transition-transform group"
          style={{
            backgroundColor: currentPin.bg_color ? `${currentPin.bg_color}e6` : undefined,
          }}
        >
          {/* 📌 Pin Icon */}
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-amber-400/20 text-amber-500 dark:text-amber-400 text-xs">
            <Pin className="w-3 h-3 fill-amber-500" />
          </div>

          {/* Note Pure Content (Max 2 lines, ellipsis) */}
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-xs text-gray-800 dark:text-gray-100 font-medium leading-snug line-clamp-2 break-words">
              {currentPin.text || (currentPin.audio ? '[语音便签]' : currentPin.imgs?.length ? '[图片便签]' : '...')}
            </p>

            {/* Media badges if present */}
            {(currentPin.audio || (currentPin.imgs && currentPin.imgs.length > 0)) && (
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                {currentPin.audio && (
                  <span className="inline-flex items-center gap-0.5">
                    <Volume2 className="w-2.5 h-2.5" />
                    {currentPin.audio.duration}s
                  </span>
                )}
                {currentPin.imgs && currentPin.imgs.length > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <ImageIcon className="w-2.5 h-2.5" />
                    {currentPin.imgs.length}图
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Multiple Pinned Indicator & Switcher */}
          {pinnedRecords.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActivePinIndex((prev) => (prev + 1) % pinnedRecords.length);
              }}
              className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
              title="切换下一条置顶"
            >
              {safeIndex + 1}/{pinnedRecords.length}
            </button>
          )}

          {/* Quick Unpin Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              unpinRecord(currentPin.id);
            }}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="取消置顶"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
