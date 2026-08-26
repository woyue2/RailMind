import { useState, useEffect } from 'react';
import { useFlowStore } from '../../store/useFlowStore';
import { RecordView } from '../../views/record/RecordView';
import { ReviewView } from '../../views/ReviewView';
import { ThreadDetailView } from '../../views/ThreadDetailView';
import { WidgetSimulatorView } from '../../views/WidgetSimulatorView';
import {
  Smartphone,
  Maximize2,
  BookOpen,
  PenTool,
  RotateCcw,
  Layers,
  GitFork,
  Trash2,
} from 'lucide-react';

export const MobileShell = () => {
  const activeTab = useFlowStore((s) => s.activeTab);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);
  const resetToDefaultData = useFlowStore((s) => s.resetToDefaultData);

  // 检测是否是移动端原生环境 / 手机小屏模式
  const [isMobileScreen, setIsMobileScreen] = useState(false);
  const [isPhoneFrame, setIsPhoneFrame] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      // 屏幕宽度小于 640px 或在独立 PWA / Capacitor 原生环境中自动 100% 全屏
      const isMobile = window.innerWidth < 640 || window.matchMedia('(display-mode: standalone)').matches;
      setIsMobileScreen(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleClearAllData = () => {
    if (window.confirm('确定要清空所有数据（包括 Mock 数据与历史记录），开启纯净空白模式吗？')) {
      useFlowStore.setState({
        records: [],
        threads: [],
        tags: [],
        activeBranchParentId: null,
        quickSelectedThreadId: null,
        selectedDate: null,
      });
    }
  };

  // 如果是在手机屏幕/移动端真机打开，直接渲染 100% 全屏原生 App 容器
  if (isMobileScreen) {
    return (
      <div className="mobile-app-shell w-full h-dvh bg-white flex flex-col overflow-hidden select-none">
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {activeTab === 'record' && <RecordView />}
          {activeTab === 'review' && <ReviewView />}
          {activeTab === 'thread-detail' && <ThreadDetailView />}
          {activeTab === 'widgets' && <WidgetSimulatorView />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-0 sm:p-4 text-gray-800">
      {/* 桌面端开发/演示工具栏 (仅在 PC 浏览器端显示，方便演示页面跳转与数据调试) */}
      <header className="w-full max-w-4xl px-4 py-3 flex items-center justify-between text-white border-b border-slate-800 mb-0 sm:mb-4 bg-slate-950/60 backdrop-blur-md rounded-none sm:rounded-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30 font-bold font-mono text-sm">
            01
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-1.5">
              超电思 (Railmind)
              <span className="text-[10px] text-amber-400 bg-amber-950/80 border border-amber-800/60 px-1.5 py-0.2 rounded font-mono">
                App 调试外壳
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">三大页面完整串联 · 扁平虚线树 · R2 直连同步</p>
          </div>
        </div>

        {/* 3 Main Pages + Widget Switcher */}
        <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-lg border border-slate-700/60 text-xs">
          {/* Page 1: 主记录页 */}
          <button
            onClick={() => setActiveTab('record')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'record'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">1. 记录页</span>
          </button>

          {/* Page 2: 回顾页 */}
          <button
            onClick={() => setActiveTab('review')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'review'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">2. 回顾页</span>
          </button>

          {/* Page 3: 思维线详情页 */}
          <button
            onClick={() => {
              const threads = useFlowStore.getState().threads;
              const firstThreadId = threads[0]?.id || 'thread_concert';
              useFlowStore.getState().openThreadDetail(firstThreadId);
            }}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'thread-detail'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3. 思维线详情</span>
          </button>

          {/* Page 4: 桌面小组件演示 */}
          <button
            onClick={() => setActiveTab('widgets')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
              activeTab === 'widgets'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">4. 小组件</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title={isPhoneFrame ? '切换为大屏自适应模式' : '切换为手机仿真壳模式'}
          >
            {isPhoneFrame ? <Maximize2 className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
          </button>

          <button
            onClick={resetToDefaultData}
            className="p-2 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="重置为设计规范初始 Mock 数据"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleClearAllData}
            className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="清空所有数据（纯净空白模式）"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Simulator Screen Container */}
      <main
        className={`w-full transition-all duration-300 ${
          isPhoneFrame
            ? 'max-w-[390px] h-[844px] rounded-[44px] shadow-2xl border-[10px] border-slate-800 ring-1 ring-white/10 bg-white overflow-hidden flex flex-col relative'
            : 'max-w-xl h-[85vh] rounded-2xl shadow-xl bg-white overflow-hidden flex flex-col relative border border-slate-700'
        }`}
      >
        {/* iOS Dynamic Island & Status Bar (in Phone Frame mode) */}
        {isPhoneFrame && (
          <div className="h-10 bg-white w-full flex items-center justify-between px-7 pt-1 flex-shrink-0 select-none z-20 border-b border-transparent">
            <span className="text-xs font-semibold font-mono text-gray-900">09:41</span>
            {/* Dynamic Island Pill */}
            <div className="w-24 h-4 bg-black rounded-full" />
            <div className="flex items-center gap-1.5 text-xs text-gray-800 font-medium">
              <span className="text-[10px]">5G</span>
              <div className="w-5 h-2.5 border border-gray-800 rounded-xs p-0.5 flex items-center">
                <div className="w-full h-full bg-gray-800 rounded-2xs" />
              </div>
            </div>
          </div>
        )}

        {/* View Router Inside Device */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {activeTab === 'record' && <RecordView />}
          {activeTab === 'review' && <ReviewView />}
          {activeTab === 'thread-detail' && <ThreadDetailView />}
          {activeTab === 'widgets' && <WidgetSimulatorView />}
        </div>

        {/* Home Indicator Bar for Phone Frame */}
        {isPhoneFrame && (
          <div className="h-5 bg-white flex items-center justify-center flex-shrink-0 z-20">
            <div className="w-32 h-1 bg-gray-300 rounded-full" />
          </div>
        )}
      </main>
    </div>
  );
};
