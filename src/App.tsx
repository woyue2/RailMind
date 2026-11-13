import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MobileShell } from './components/layout/MobileShell';
import { DeskEdgeView } from './views/DeskEdgeView';
import { RecordView } from './views/record/RecordView';
import { ReviewView } from './views/ReviewView';
import { EisenhowerMatrixView } from './views/EisenhowerMatrixView';
import { ValuePriorityMatrixView } from './views/ValuePriorityMatrixView';
import { useFlowStore } from './store/useFlowStore';

const STORAGE_KEY = 'flow-01-storage-v3';
const R2_SETTINGS_KEY = 'flow.r2.settings.v1';
const R2_SECRET_KEY = 'flow.r2.secret.v1';

interface BridgePayload {
  storage?: string;
  r2Settings?: string | null;
  r2Secret?: string | null;
  empty?: boolean;
}

/** 把 /__local_sync 的內容寫進本機儲存並重新水合；回傳是否真的套用了資料。 */
async function applyBridgePayload(data: BridgePayload | null): Promise<boolean> {
  if (!data?.storage || data.empty) return false;
  localStorage.setItem(STORAGE_KEY, data.storage);
  if (data.r2Settings) localStorage.setItem(R2_SETTINGS_KEY, data.r2Settings);
  if (data.r2Secret) localStorage.setItem(R2_SECRET_KEY, data.r2Secret);
  try {
    await useFlowStore.persist.rehydrate();
  } catch {
    try {
      const parsed = JSON.parse(data.storage);
      if (parsed?.state) useFlowStore.setState(parsed.state);
    } catch {
      window.location.reload();
    }
  }
  return true;
}

export function App() {
  const [isDeskMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'desk-edge') return true;
    if (
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    ) {
      return true;
    }
    return false;
  });

  const activeTab = useFlowStore((s) => s.activeTab);
  const records = useFlowStore((s) => s.records);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // 1. 样式激活与启动性能度量
  useEffect(() => {
    if (isDeskMode) {
      document.documentElement.classList.add('desk-edge-mode');
      document.body.classList.add('desk-edge-mode');
    }

    if (typeof window !== 'undefined' && window.performance) {
      const perf = window.performance;
      const timing = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const domLoad = timing ? Math.round(timing.domContentLoadedEventEnd - timing.startTime) : Math.round(perf.now());
      console.info(
        `[RailMind 启动统计] 模式: ${isDeskMode ? 'DeskEdge (桌面端)' : 'MobileShell (移动/Web)'} | ` +
        `DOM耗时: ${domLoad}ms | 本地记录数: ${records.length}`
      );
    }
  }, [isDeskMode]);

  // 2. 双端数据自动桥接（解决 Chrome 浏览器与 Tauri WebView2 存储隔离、数据为 0 的问题）
  useEffect(() => {
    // `/__local_sync` 只存在於 Vite dev server；Pages production 不應輪詢 404。
    if (!import.meta.env.DEV) return;

    // 场景 A：在普通浏览器（Chrome）中，自动向本地 Vite 桥接文件同步备份
    if (!isDeskMode) {
      const pushToBridge = () => {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData && records.length > 0) {
          const payload = {
            storage: localData,
            r2Settings: localStorage.getItem(R2_SETTINGS_KEY),
            r2Secret: localStorage.getItem(R2_SECRET_KEY),
            updatedAt: Date.now(),
          };
          fetch('/__local_sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {});
        }
      };

      pushToBridge();
      const interval = setInterval(pushToBridge, 5000);
      return () => clearInterval(interval);
    }

    // 场景 B：在 Tauri 桌面端中，如果检测到本地记录为空，自动轮询本地桥接文件拉取数据
    if (isDeskMode && records.length === 0) {
      const pullFromBridge = () => {
        fetch('/__local_sync')
          .then((res) => res.json())
          .then(async (data: BridgePayload) => {
            if (await applyBridgePayload(data)) {
              console.info('[RailMind 桥接] 检测到浏览器同步数据，执行热重载水合...');
            }
          })
          .catch(() => {});
      };

      pullFromBridge();
      const interval = setInterval(pullFromBridge, 2000);
      return () => clearInterval(interval);
    }
  }, [isDeskMode, records.length]);

  const handleManualImport = () => {
    setSyncStatus('正在检查同步数据...');
    fetch('/__local_sync')
      .then((res) => res.json())
      .then(async (data: BridgePayload) => {
        if (await applyBridgePayload(data)) {
          setSyncStatus('同步完成');
        } else {
          setSyncStatus('未找到浏览器数据，请先在 Chrome (localhost:3000) 刷新一下页面！');
        }
      })
      .catch(() => {
        setSyncStatus('同步失败，请检查 Vite 服务');
      });
  };

  if (isDeskMode) {
    return (
      <div className="w-full h-screen overflow-hidden bg-transparent flex justify-end relative">
        <div className="w-full h-full border-l border-black/10 shadow-2xl flex flex-col relative">
          {/* 当桌面端数据为 0 时，显示提示横幅（仅 dev 桥接可用时） */}
          {import.meta.env.DEV && records.length === 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2 z-50">
              <span className="truncate">
                {syncStatus || '检测到数据为空，请在 Chrome 刷新一次 (F5) 即可自动同步'}
              </span>
              <button
                type="button"
                onClick={handleManualImport}
                className="shrink-0 flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[11px] font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                立即同步
              </button>
            </div>
          )}

          {activeTab === 'record' ? (
            <RecordView />
          ) : activeTab === 'review' ? (
            <ReviewView />
          ) : activeTab === 'matrix' ? (
            <EisenhowerMatrixView />
          ) : activeTab === 'value-matrix' ? (
            <ValuePriorityMatrixView />
          ) : (
            <DeskEdgeView />
          )}
        </div>
      </div>
    );
  }

  return <MobileShell />;
}

export default App;
