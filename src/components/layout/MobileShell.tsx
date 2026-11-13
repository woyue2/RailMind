import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BookOpen, PenTool, Rows3 } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordView } from '../../views/record/RecordView';
import { ReviewView } from '../../views/ReviewView';
import { ThreadDetailView } from '../../views/ThreadDetailView';
import { EisenhowerMatrixView } from '../../views/EisenhowerMatrixView';
import { ValuePriorityMatrixView } from '../../views/ValuePriorityMatrixView';
import { DeskEdgeView } from '../../views/DeskEdgeView';
import { SyncProgressOverlay } from '../common/SyncProgressOverlay';
import { StorageQuotaNotice } from '../common/StorageQuotaNotice';
import { isR2Configured, loadR2Settings } from '../../sync/credentials';
import { triggerR2Sync } from '../../sync';
import { SYSTEM_BACK_EVENT } from '../../hooks/useSystemBack';

/** 当前有效的 Tab 集合。持久化数据里可能残留已被移除的 Tab（如旧的 'widgets'）。 */
const KNOWN_TABS: readonly string[] = ['record', 'review', 'matrix', 'value-matrix', 'thread-detail', 'desk'];
const isKnownTab = (tab: string): boolean => KNOWN_TABS.includes(tab);

export const MobileShell = () => {
  const activeTab = useFlowStore((s) => s.activeTab);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const deskRows = useFlowStore((s) => s.deskRows);
  const backFromThreadDetail = useFlowStore((s) => s.backFromThreadDetail);
  const backToReview = useFlowStore((s) => s.backToReview);
  const backToThreadDetail = useFlowStore((s) => s.backToThreadDetail);
  const fromReviewDate = useFlowStore((s) => s.fromReviewDate);
  const fromThreadDetailId = useFlowStore((s) => s.fromThreadDetailId);
  const [deskFocusRequest, setDeskFocusRequest] = useState<{ id: string; at: number } | null>(null);
  const handleDeskFocusHandled = useCallback(() => setDeskFocusRequest(null), []);
  const drawers = useMemo(() => deskRows.flatMap((row) => row.drawers), [deskRows]);

  useEffect(() => {
    if (isR2Configured() && loadR2Settings().enabled) {
      triggerR2Sync({ manual: false }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const backEvent = new CustomEvent<{ handled: boolean }>(SYSTEM_BACK_EVENT, {
        detail: { handled: false },
      });
      window.dispatchEvent(backEvent);
      if (backEvent.detail.handled) return;

      if (activeTab === 'thread-detail') {
        backFromThreadDetail();
        return;
      }

      if (activeTab === 'record') {
        if (fromThreadDetailId) {
          backToThreadDetail();
          return;
        }
        if (fromReviewDate) {
          backToReview();
          return;
        }
      }

      if (activeTab === 'matrix' || activeTab === 'value-matrix') {
        setActiveTab('review');
        return;
      }

      if (activeTab === 'review' || activeTab === 'desk') {
        setActiveTab('record');
        return;
      }

      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove()).catch(() => {});
    };
  }, [
    activeTab,
    backFromThreadDetail,
    backToReview,
    backToThreadDetail,
    fromReviewDate,
    fromThreadDetailId,
    setActiveTab,
  ]);

  return (
    <div className="mobile-app-shell app-workspace h-dvh w-full overflow-hidden bg-slate-100 text-gray-800 flex">
      <SyncProgressOverlay />
      <StorageQuotaNotice />
      <aside className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5" aria-label="主导航">
        <div className="flex items-center gap-3 mb-8">
          <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div><h1 className="font-semibold text-lg tracking-tight">RailMind</h1><p className="text-xs text-slate-400">留住想法，串起思绪</p></div>
        </div>
        <nav className="space-y-1">
          {([{ id: 'record', label: '記錄', icon: PenTool }, { id: 'review', label: '回顧', icon: BookOpen }, { id: 'desk', label: '專案', icon: Rows3 }] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${activeTab === id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <div className="mt-8 mb-3 px-3 text-xs font-medium text-slate-400">專案 · {drawers.length}</div>
        <nav className="min-h-0 flex-1 overflow-y-auto space-y-1" aria-label="專案">
          {drawers.map((drawer) => (
            <button key={drawer.id} type="button" onClick={() => { setDeskFocusRequest({ id: drawer.id, at: Date.now() }); setActiveTab('desk'); }}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">
              <Rows3 className="h-4 w-4 shrink-0" /><span className="truncate">{drawer.title}</span>
            </button>
          ))}
          {!drawers.length && <p className="px-3 text-xs leading-6 text-slate-400">在專案頁建立抽屜後，可從這裡快速打開。</p>}
        </nav>
        <p className="mt-5 px-3 text-xs leading-5 text-slate-400">随时记录 · 慢慢整理</p>
      </aside>
      <main className="min-w-0 flex-1 flex justify-center md:p-5 lg:p-8">
        <div className="relative flex min-h-0 min-w-0 w-full max-w-5xl flex-col overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">
          {/* 运行时兜底：移除某个 Tab（v7 移除 'widgets'）后，历史持久化数据里可能残留
              已不存在的 activeTab，导致所有分支都不匹配而白屏。未知值一律回落到记录页。 */}
          {isKnownTab(activeTab) ? (
            <>
              {activeTab === 'record' && <RecordView />}
              {activeTab === 'review' && <ReviewView />}
              {activeTab === 'matrix' && <EisenhowerMatrixView />}
              {activeTab === 'value-matrix' && <ValuePriorityMatrixView />}
              {activeTab === 'thread-detail' && <ThreadDetailView />}
              {activeTab === 'desk' && (
                <DeskEdgeView focusRequest={deskFocusRequest} onFocusHandled={handleDeskFocusHandled} />
              )}
            </>
          ) : (
            <RecordView />
          )}
        </div>
      </main>
    </div>
  );
};
