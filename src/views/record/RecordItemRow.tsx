import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, Link2, X, Pencil, Check } from 'lucide-react';
import { EnrichedRecordItem } from '../../types';
import { formatTime } from '../../utils/dateUtils';
import { useFlowStore } from '../../store/useFlowStore';
import { ConfirmDeleteModal } from '../../components/modals/ConfirmDeleteModal';

interface RecordItemRowProps {
  item: EnrichedRecordItem;
  level: number;
  isLastChild?: boolean;
  onOpenThreadPicker: (recordId: string, currentText: string) => void;
  onOpenTagPicker: (recordId: string, currentTagId: string | null) => void;
}

export const RecordItemRow: React.FC<RecordItemRowProps> = ({
  item,
  level,
  isLastChild = false,
  onOpenThreadPicker,
  onOpenTagPicker,
}) => {
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const setActiveBranchParentId = useFlowStore((s) => s.setActiveBranchParentId);
  const openThreadDetail = useFlowStore((s) => s.openThreadDetail);
  const deleteRecord = useFlowStore((s) => s.deleteRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const quickSelectedThreadId = useFlowStore((s) => s.quickSelectedThreadId);
  const setQuickSelectedThreadId = useFlowStore((s) => s.setQuickSelectedThreadId);
  const threads = useFlowStore((s) => s.threads);

  // In-place text editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  // Delete confirm modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Keep editText in sync when item.text changes externally
  useEffect(() => {
    setEditText(item.text);
  }, [item.text]);

  // Focus input when entering editing mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const isBranchingThis = activeBranchParentId === item.id;
  const hasChildren = item.children && item.children.length > 0;
  const activeQuickThread = quickSelectedThreadId
    ? threads.find((t) => t.id === quickSelectedThreadId)
    : null;

  const handleBranchClick = () => {
    if (isBranchingThis) {
      setActiveBranchParentId(null);
    } else {
      setActiveBranchParentId(item.id);
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) {
      updateRecord(item.id, { text: trimmed });
    } else {
      setEditText(item.text);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(item.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Direct linkage or open thread picker
  const handleThreadLinkClick = () => {
    if (quickSelectedThreadId) {
      // Direct link without popup!
      updateRecord(item.id, { thread_id: quickSelectedThreadId });
      setQuickSelectedThreadId(null); // Turn off highlight
    } else {
      onOpenThreadPicker(item.id, item.text);
    }
  };

  return (
    <div className="relative">
      {/*
        Node Row Container:
        - 每一层子分支由左侧父容器的虚线导轨引导 (border-l)
        - 当前子节点通过水平虚线分支延伸连接 (├─ 或 └─)
      */}
      <div className="relative">
        {/* Horizontal Dashed Branch Connector for level > 0 */}
        {level > 0 && (
          <>
            <div
              className="absolute pointer-events-none border-b-[1.5px] border-dashed border-slate-300"
              style={{
                left: '-12px',
                top: '17px',
                width: '10px',
              }}
            />
            {/* If last child, mask the container's left border below the branch point to form a clean └─ corner */}
            {isLastChild && (
              <div
                className="absolute pointer-events-none bg-white"
                style={{
                  left: '-14px',
                  top: '18px',
                  bottom: '0px',
                  width: '4px',
                }}
              />
            )}
          </>
        )}

        {/* Row Content Card - scoped with 'group' so hover only triggers this row's actions */}
        <div
          className={`relative group flex items-start py-2 px-2.5 rounded-lg transition-all ${
            isBranchingThis
              ? 'bg-amber-50/90 ring-1 ring-amber-300 shadow-2xs'
              : isEditing
              ? 'bg-blue-50/40 ring-1 ring-blue-200 shadow-2xs'
              : 'hover:bg-gray-50/90'
          }`}
        >
          {/* Timestamp: 灰色小号时间戳 */}
          <span className="text-[11.5px] font-mono text-gray-400 mt-0.5 mr-2 flex-shrink-0 w-10 select-none">
            {formatTime(item.created_at)}
          </span>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 pr-1">
            {/* Record text or inline editing input */}
            {isEditing ? (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  ref={inputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-[13.5px] text-gray-900 bg-white border border-blue-400 rounded-md px-2 py-0.5 outline-none ring-2 ring-blue-100 shadow-2xs font-normal"
                  placeholder="修改记录文字..."
                />
                <button
                  onClick={handleSaveEdit}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  title="保存 (Enter)"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                  title="取消 (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDoubleClick={() => setIsEditing(true)}
                className="text-[13.5px] text-gray-900 leading-snug break-words font-normal cursor-text select-text"
                title="双击可直接修改文字"
              >
                {item.text}
              </div>
            )}

            {/* Associated Thread Capsule 🔗 & Tag Badge [标签] */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {/* 🔗 Linked Thread Capsule */}
              {item.thread && (
                <button
                  onClick={() => openThreadDetail(item.thread!.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 rounded-full transition-colors"
                  title="点击跳转到该思维线详情页"
                >
                  <span className="text-[10px]">🔗</span>
                  <span>{item.thread.title}</span>
                </button>
              )}

              {/* [标签] Tag Badge */}
              {item.tag ? (
                <button
                  onClick={() => onOpenTagPicker(item.id, item.tag_id)}
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded hover:opacity-80 transition-opacity"
                  style={{
                    color: item.tag.color,
                    backgroundColor: `${item.tag.color}15`,
                  }}
                  title="点击修改或移除标签"
                >
                  <span>[{item.tag.name}]</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenTagPicker(item.id, null)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded border border-dashed border-gray-200 hover:border-gray-400 transition-all"
                  title="补打标签"
                >
                  +打标签
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons: ✎ (Edit), ⎇ (Branch), ⚭ (Link Thread), ✕ (Delete) */}
          <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5">
            {/* ✎ In-place Edit Button */}
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded transition-all opacity-0 group-hover:opacity-100"
                title="修改文字 (双击亦可编辑)"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {/* ⎇ Branch Button */}
            <button
              onClick={handleBranchClick}
              className={`p-1.5 rounded transition-all flex items-center justify-center ${
                isBranchingThis
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400 font-bold'
                  : 'text-gray-400 hover:text-gray-800 hover:bg-gray-100 opacity-60 group-hover:opacity-100'
              }`}
              title={isBranchingThis ? '取消分支' : '新建分支子记录 (⎇)'}
            >
              <GitBranch className="w-3.5 h-3.5" />
            </button>

            {/* ⚭ Link Thread Button (Enhanced with quick direct linkage) */}
            <button
              onClick={handleThreadLinkClick}
              className={`p-1.5 rounded transition-all ${
                activeQuickThread
                  ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-300 font-medium opacity-100'
                  : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-60 group-hover:opacity-100'
              }`}
              title={
                activeQuickThread
                  ? `点击直接关联至选中的「${activeQuickThread.title}」`
                  : '关联到思维线 (⚭)'
              }
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>

            {/* Delete button (Pops up confirmation modal) */}
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="p-1.5 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除记录"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => deleteRecord(item.id)}
        recordText={item.text}
        hasChildren={hasChildren}
      />

      {/*
        Render Nested Children Recursively:
        方案 B: 连续虚线左边框 (border-l-[1.5px] border-dashed border-slate-300)
      */}
      {hasChildren && (
        <div className="relative ml-[22px] pl-[12px] border-l-[1.5px] border-dashed border-slate-300 my-0.5 space-y-0.5">
          {item.children!.map((child, idx) => (
            <RecordItemRow
              key={child.id}
              item={child}
              level={level + 1}
              isLastChild={idx === item.children!.length - 1}
              onOpenThreadPicker={onOpenThreadPicker}
              onOpenTagPicker={onOpenTagPicker}
            />
          ))}
        </div>
      )}
    </div>
  );
};
