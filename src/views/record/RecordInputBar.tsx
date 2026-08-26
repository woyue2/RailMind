import React, { useState, useRef, useEffect } from 'react';
import { Send, X, GitBranch, Sparkles } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';

export const RecordInputBar: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const getRecentThreads = useFlowStore((s) => s.getRecentThreads);
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const setActiveBranchParentId = useFlowStore((s) => s.setActiveBranchParentId);
  const quickSelectedThreadId = useFlowStore((s) => s.quickSelectedThreadId);
  const setQuickSelectedThreadId = useFlowStore((s) => s.setQuickSelectedThreadId);
  const addRecord = useFlowStore((s) => s.addRecord);
  const records = useFlowStore((s) => s.records);

  const recentThreads = getRecentThreads(3);

  // Parent record info if in branching mode
  const parentRecord = activeBranchParentId
    ? records.find((r) => r.id === activeBranchParentId)
    : null;

  // Auto focus input when branching mode turns on
  useEffect(() => {
    if (activeBranchParentId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeBranchParentId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    addRecord(inputText, {
      parent_id: activeBranchParentId,
      thread_id: quickSelectedThreadId,
    });

    setInputText('');
  };

  return (
    <div className="record-input-bar border-t border-gray-100 bg-white/95 backdrop-blur-md px-3 pt-2 pb-3">
      {/* 1. Branching State Alert (if active) */}
      {parentRecord && (
        <div className="mb-2 px-2.5 py-1.5 bg-amber-50/90 border border-amber-200/80 rounded-lg flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 truncate pr-2">
            <GitBranch className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
            <span className="text-[11px] font-medium text-amber-800">分支于:</span>
            <span className="truncate text-amber-700">"{parentRecord.text}"</span>
          </div>
          <button
            onClick={() => setActiveBranchParentId(null)}
            className="text-amber-700 hover:text-amber-900 p-0.5"
            title="取消分支模式"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. "最近" Thread Quick Capsules Row */}
      {recentThreads.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] text-gray-400 font-normal flex-shrink-0 pl-1">最近:</span>
          {recentThreads.map((thread) => {
            const isSelected = quickSelectedThreadId === thread.id;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setQuickSelectedThreadId(thread.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-normal transition-all flex-shrink-0 flex items-center gap-1 border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200/80'
                }`}
                title={isSelected ? '已选中，再次点击取消' : `点击直接关联「${thread.title}」`}
              >
                {isSelected && <Sparkles className="w-2.5 h-2.5" />}
                <span>[{thread.title}]</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Bottom Sticky Single Line Input + Send Button */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              activeBranchParentId
                ? '输入分支子想法...'
                : quickSelectedThreadId
                ? '此刻在想什么 (将关联选中思维线)...'
                : '此刻在想什么...'
            }
            className="w-full pl-3.5 pr-8 py-2.5 bg-gray-50 border border-gray-200/90 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-800 transition-colors"
          />
          {inputText && (
            <button
              type="button"
              onClick={() => setInputText('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
            inputText.trim()
              ? 'bg-gray-900 text-white hover:bg-black active:scale-95 shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="发送记录 (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
