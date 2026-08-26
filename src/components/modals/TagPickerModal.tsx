import { useState } from 'react';
import { Tag, Plus, X, Check } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';

interface TagPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
}

const PRESET_COLORS = [
  '#F87171', // Red
  '#FB923C', // Orange
  '#FBBF24', // Amber
  '#34D399', // Emerald
  '#60A5FA', // Blue
  '#818CF8', // Indigo
  '#A78BFA', // Purple
  '#9CA3AF', // Gray
];

export const TagPickerModal = ({
  isOpen,
  onClose,
  currentTagId,
  onSelectTag,
}: TagPickerModalProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  const tags = useFlowStore((s) => s.tags);
  const createTag = useFlowStore((s) => s.createTag);

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
                <button
                  key={tag.id}
                  onClick={() => {
                    onSelectTag(tag.id);
                    onClose();
                  }}
                  className={`px-3 py-2 rounded-lg border text-left flex items-center justify-between text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-gray-800 bg-gray-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
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
    </div>
  );
};
