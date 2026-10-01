import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { MobileShell } from './components/layout/MobileShell';
import { DeskEdgeView } from './views/DeskEdgeView';
import { RecordView } from './views/record/RecordView';
import { ReviewView } from './views/ReviewView';
import { useFlowStore } from './store/useFlowStore';

const STORAGE_KEY = 'flow-01-storage-v3';
const R2_SETTINGS_KEY = 'flow.r2.settings.v1';
const R2_SECRET_KEY = 'flow.r2.secret.v1';

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

  // 1. 样式激活
  useEffect(() => {
    if (isDeskMode) {
      document.documentElement.classList.add('desk-edge-mode');
      document.body.classList.add('desk-edge-mode');
    }
  }, [isDeskMode]);

  // 2. 双端数据自动桥接（解决 Chrome 浏览器与 Tauri WebView2 存储隔离、数据为 0 的问题）
  useEffect(() => {
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
          .then((data) => {
            if (data && data.storage && !data.empty) {
              localStorage.setItem(STORAGE_KEY, data.storage);
              if (data.r2Settings) localStorage.setItem(R2_SETTINGS_KEY, data.r2Settings);
              if (data.r2Secret) localStorage.setItem(R2_SECRET_KEY, data.r2Secret);
              window.location.reload();
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
      .then((data) => {
        if (data && data.storage && !data.empty) {
          localStorage.setItem(STORAGE_KEY, data.storage);
          if (data.r2Settings) localStorage.setItem(R2_SETTINGS_KEY, data.r2Settings);
          if (data.r2Secret) localStorage.setItem(R2_SECRET_KEY, data.r2Secret);
          window.location.reload();
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
          {/* 当桌面端数据为 0 时，显示提示横幅 */}
          {records.length === 0 && (
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
