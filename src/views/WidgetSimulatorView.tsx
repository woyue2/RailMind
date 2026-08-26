import React, { useMemo } from 'react';
import { Plus, ArrowLeft, Edit3, Sparkles } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { formatTime } from '../utils/dateUtils';

export const WidgetSimulatorView: React.FC = () => {
  const records = useFlowStore((s) => s.records);
  const setActiveTab = useFlowStore((s) => s.setActiveTab);

  // Latest 3 records sorted time-descending
  const latestThree = useMemo(() => {
    return [...records]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  }, [records]);

  const handleTriggerQuickAdd = () => {
    setActiveTab('record');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('record')}
          className="p-1 -ml-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-base font-semibold tracking-tight">桌面小组件演示</h2>
          <p className="text-[11px] text-slate-400">Home Screen Widget Simulator</p>
        </div>
      </div>

      <div className="p-6 space-y-8 flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
        {/* Simulator Info Card */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 font-medium">
            <Sparkles className="w-3 h-3 text-amber-400" />
            模拟 iOS / Android 手机桌面小组件
          </div>
          <p className="text-[11px] text-slate-400">
            只展示时间倒序最新 3 条，点击立即唤起 App 记录
          </p>
        </div>

        {/* Widget 1: 小尺寸小组件 (1x1) */}
        <div className="w-full space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase pl-1">
            1. 小尺寸 (仅快速入口)
          </span>

          <div
            onClick={handleTriggerQuickAdd}
            className="w-36 h-36 mx-auto bg-white/95 text-gray-900 rounded-3xl p-4 shadow-xl border border-white/20 flex flex-col items-center justify-center gap-2.5 cursor-pointer hover:scale-105 active:scale-95 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-sm group-hover:bg-black transition-colors">
              <Edit3 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold text-gray-900 block">记一下</span>
              <span className="text-[10px] text-gray-400">01flow</span>
            </div>
          </div>
        </div>

        {/* Widget 2: 中/大尺寸小组件 (2x2 / 4x2) */}
        <div className="w-full space-y-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase pl-1">
            2. 中/大尺寸 (最新 3 条)
          </span>

          <div className="w-full bg-white/95 text-gray-900 rounded-3xl p-4 shadow-xl border border-white/20 flex flex-col justify-between min-h-[190px]">
            <div>
              {/* Header inside widget */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                <span className="text-xs font-bold text-gray-900">最新几条</span>
                <span className="text-[10px] font-mono text-gray-400">01flow widget</span>
              </div>

              {/* 3 Records list */}
              <div className="space-y-2 py-0.5">
                {latestThree.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center">暂无记录</div>
                ) : (
                  latestThree.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs truncate">
                      <span className="text-[11px] font-mono text-gray-400 flex-shrink-0 w-8">
                        {formatTime(item.created_at)}
                      </span>
                      <span className="truncate text-gray-800 flex-1 font-normal">
                        {item.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom widget action */}
            <div className="border-t border-gray-100 pt-2.5 flex items-center justify-between mt-2">
              <span className="text-[10px] text-gray-400">点击进入记录</span>
              <button
                onClick={handleTriggerQuickAdd}
                className="inline-flex items-center gap-1 px-3 py-1 bg-gray-900 hover:bg-black text-white text-xs font-medium rounded-full shadow-xs transition-colors"
              >
                <span>记一下</span>
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
