import { useState } from 'react';
import { Tag, Plus, X, Check, Trash2 } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { QUOTE_COLOR_PALETTE as PRESET_COLORS } from '../../utils/quoteColors';
import { useSystemBack } from '../../hooks/useSystemBack';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface TagPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
}

export const TagPickerModal = ({
  isOpen,
  onClose,
  currentTagId,
  onSelectTag,
}: TagPickerModalProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; count: number } | null>(null);

  const tags = useFlowStore((s) => s.tags);
  const createTag = useFlowStore((s) => s.createTag);
  const deleteTag = useFlowStore((s) => s.deleteTag);

  useSystemBack(isOpen, onClose);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const newTag = createTag(newTagName, selectedColor);
    setNewTagName('');
    setIsCreating(false);
    onSelectTag(newTag.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900">事后打标签</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tag List */}
        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {/* Option to clear tag */}
          {currentTagId && (
            <button
              onClick={() => {
                onSelectTag(null);
                onClose();
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-dashed border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 text-left transition-colors flex items-center justify-between"
            >
              <span>清除当前标签</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {tags.map((tag) => {
              const isSelected = currentTagId === tag.id;
              return (
                <div
                  key={tag.id}
                  className={`group flex items-center rounded-lg border text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-gray-800 bg-gray-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTag(tag.id);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate text-gray-800">[{tag.name}]</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-gray-900 flex-shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDelete({
                        id: tag.id,
                        name: tag.name,
                        count: useFlowStore.getState().records.filter((r) => r.tag_id === tag.id).length,
                      })
                    }
                    className="mr-1.5 shrink-0 rounded-md p-1 text-gray-300 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    title="删除标签"
                    aria-label={`删除标签 ${tag.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Create Tag Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/60">
          {isCreating ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="标签名称 (例如: 冲动/反思)..."
                className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-gray-800"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        selectedColor === c ? 'scale-125 ring-2 ring-gray-900 ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                  >
                    创建
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-xs text-gray-600 font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新建自定义标签
            </button>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteTag(pendingDelete.id);
        }}
        title="确定要删除这个标签吗？"
        description={
          pendingDelete && pendingDelete.count > 0
            ? `该标签下有 ${pendingDelete.count} 条记录，删除后这些记录会变为「无标签」，记录本身不会被删除。`
            : '删除后无法恢复。'
        }
        recordText={pendingDelete ? `[${pendingDelete.name}]` : undefined}
      />
    </div>
  );
};
