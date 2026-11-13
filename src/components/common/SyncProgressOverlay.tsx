import React, { useEffect, useState } from 'react';
import { subscribeSyncProgress } from '../../sync';
import { SyncProgressStatus } from '../../sync/types';
import { Cloud, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const SyncProgressOverlay: React.FC = () => {
  const [status, setStatus] = useState<SyncProgressStatus | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    return subscribeSyncProgress((nextStatus, show) => {
      setStatus(nextStatus);
      setShowOverlay(show);
    });
  }, []);

  if (!showOverlay && !status) return null;

  const percent =
    status && status.total > 0
      ? Math.min(100, Math.round((status.current / status.total) * 100))
      : status?.stage === 'done'
      ? 100
      : 0;

  const isDone = status?.stage === 'done';
  const isError = status?.stage === 'error';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
        showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-full max-w-xs bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/40 p-5 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3 text-blue-600 shadow-inner">
          {isDone ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 animate-in zoom-in duration-200" />
          ) : isError ? (
            <AlertCircle className="w-6 h-6 text-red-600 animate-in zoom-in duration-200" />
          ) : (
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          )}
        </div>

        <h4 className="text-sm font-semibold text-gray-900 mb-1">
          {isDone ? '云端同步完成' : isError ? '同步出现异常' : '正在同步云端数据'}
        </h4>

        <p className="text-[12px] text-gray-500 mb-4 min-h-[1.25rem] px-2 break-all line-clamp-2">
          {status?.message || '请稍候...'}
        </p>

        {/* 进度条 */}
        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-2 relative">
          <div
            className={`h-full transition-all duration-200 ease-out rounded-full ${
              isDone ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-blue-600'
            }`}
            style={{
              width: status?.stage === 'idle' && status.total === 0 ? '30%' : `${percent}%`,
            }}
          />
        </div>

        <div className="w-full flex items-center justify-between text-[11px] text-gray-400 font-mono px-0.5">
          <span className="flex items-center gap-1 text-gray-400">
            <Cloud className="w-3 h-3" />
            Cloudflare R2
          </span>
          <span>
            {status && status.total > 0
              ? `${status.current}/${status.total} (${percent}%)`
              : isDone
              ? '100%'
              : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
