import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BookOpen, GitFork, PenTool } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordView } from '../../views/record/RecordView';
import { ReviewView } from '../../views/ReviewView';
import { ThreadDetailView } from '../../views/ThreadDetailView';
import { WidgetSimulatorView } from '../../views/WidgetSimulatorView';
import { SyncProgressOverlay } from '../common/SyncProgressOverlay';
import { isR2Configured, loadR2Settings } from '../../sync/credentials';
import { triggerR2Sync } from '../../sync';
import { SYSTEM_BACK_EVENT } from '../../hooks/useSystemBack';

export const MobileShell = () => {
  const activeTab = useFlowStore((s) => s.activeTab);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const threads = useFlowStore((s) => s.threads);
  const selectedThreadId = useFlowStore((s) => s.selectedThreadId);
  const openThreadDetail = useFlowStore((s) => s.openThreadDetail);
  const backFromThreadDetail = useFlowStore((s) => s.backFromThreadDetail);
  const backToReview = useFlowStore((s) => s.backToReview);
  const backToThreadDetail = useFlowStore((s) => s.backToThreadDetail);
  const fromReviewDate = useFlowStore((s) => s.fromReviewDate);
  const fromThreadDetailId = useFlowStore((s) => s.fromThreadDetailId);

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

      if (activeTab === 'review' || activeTab === 'widgets') {
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
      <aside className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5" aria-label="主导航">
        <div className="flex items-center gap-3 mb-8">
          <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div><h1 className="font-semibold text-lg tracking-tight">RailMind</h1><p className="text-xs text-slate-400">留住想法，串起思绪</p></div>
        </div>
        <nav className="space-y-1">
          {([{ id: 'record', label: '记录', icon: PenTool }, { id: 'review', label: '回顾', icon: BookOpen }] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${activeTab === id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <div className="mt-8 mb-3 px-3 text-xs font-medium text-slate-400">思维线 · {threads.length}</div>
        <nav className="min-h-0 flex-1 overflow-y-auto space-y-1" aria-label="思维线">
          {threads.map((thread) => (
            <button key={thread.id} type="button" onClick={() => openThreadDetail(thread.id)}
              aria-current={activeTab === 'thread-detail' && selectedThreadId === thread.id ? 'page' : undefined}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${activeTab === 'thread-detail' && selectedThreadId === thread.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <GitFork className="h-4 w-4 shrink-0" /><span className="truncate">{thread.title}</span>
            </button>
          ))}
          {!threads.length && <p className="px-3 text-xs leading-6 text-slate-400">在记录中建立思维线后，可从这里快速打开。</p>}
        </nav>
        <p className="mt-5 px-3 text-xs leading-5 text-slate-400">随时记录 · 慢慢整理</p>
      </aside>
      <main className="min-w-0 flex-1 flex justify-center md:p-5 lg:p-8">
        <div className="relative flex min-h-0 min-w-0 w-full max-w-5xl flex-col overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">
          {activeTab === 'record' && <RecordView />}
          {activeTab === 'review' && <ReviewView />}
          {activeTab === 'thread-detail' && <ThreadDetailView />}
          {activeTab === 'widgets' && <WidgetSimulatorView />}
        </div>
      </main>
    </div>
  );
};
