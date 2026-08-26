import { useState } from 'react';
import { Search, Plus, X, Sparkles } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';

interface ThreadPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (threadId: string) => void;
  currentTargetTitle?: string;
}

export const ThreadPickerModal = ({
  isOpen,
  onClose,
  onSelect,
  currentTargetTitle,
}: ThreadPickerModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const searchThreads = useFlowStore((s) => s.searchThreads);
  const getRecentThreads = useFlowStore((s) => s.getRecentThreads);
  const createThread = useFlowStore((s) => s.createThread);

  if (!isOpen) return null;

  const filteredThreads = searchThreads(searchQuery);
  const recentThreadIds = new Set(getRecentThreads(3).map((t) => t.id));

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = createThread(newTitle);
    setNewTitle('');
    setIsCreating(false);
    onSelect(created.id);
    onClose();
  };

  const handleSelect = (threadId: string) => {
    onSelect(threadId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] transition-opacity">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">关联到思维线</h3>
            {currentTargetTitle && (
              <p className="text-xs text-gray-500 truncate max-w-[280px] mt-0.5">
                目标: "{currentTargetTitle}"
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-gray-100 bg-gray-50/70">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 搜索已有思维线..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-800 transition-colors placeholder:text-gray-400"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 px-2 py-1">
          {filteredThreads.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              未找到相关思维线
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isRecent = recentThreadIds.has(thread.id);
              return (
                <button
                  key={thread.id}
                  onClick={() => handleSelect(thread.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors group"
                >
                  <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                    {thread.title}
                  </span>
                  {isRecent && (
                    <span className="inline-flex items-center text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      <Sparkles className="w-2.5 h-2.5 mr-1 text-amber-500" />
                      最近
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create New Thread Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50">
          {isCreating ? (
            <form onSubmit={handleCreateNew} className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="输入新思维线名称 (例如: 学日语)..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-gray-800"
                autoFocus
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
              >
                创建并关联
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewTitle('');
                }}
                className="px-2.5 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2.5 px-4 border border-dashed border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 rounded-lg text-sm text-gray-700 font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4 text-gray-500" />
              + 新建思维线
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
