import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, Link2, X, Pencil, Check, Quote } from 'lucide-react';
import { EnrichedRecordItem, RecordItem } from '../../types';
import { formatTime, formatShortDateTime } from '../../utils/dateUtils';
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
  const activeQuoteRecordId = useFlowStore((s) => s.activeQuoteRecordId);
  const setActiveQuoteRecordId = useFlowStore((s) => s.setActiveQuoteRecordId);
  const highlightRecordId = useFlowStore((s) => s.highlightRecordId);
  const setHighlightRecordId = useFlowStore((s) => s.setHighlightRecordId);
  const openDateRecord = useFlowStore((s) => s.openDateRecord);
  const openThreadDetail = useFlowStore((s) => s.openThreadDetail);
  const deleteRecord = useFlowStore((s) => s.deleteRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const quickSelectedThreadId = useFlowStore((s) => s.quickSelectedThreadId);
  const setQuickSelectedThreadId = useFlowStore((s) => s.setQuickSelectedThreadId);
  const threads = useFlowStore((s) => s.threads);
  const records = useFlowStore((s) => s.records);

  // In-place text editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  // Delete confirm modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Popover state for multiple downstream references
  const [showDownstreamPopover, setShowDownstreamPopover] = useState(false);

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
  const isQuotingThis = activeQuoteRecordId === item.id;
  const isHighlighted = highlightRecordId === item.id;
  const hasChildren = item.children && item.children.length > 0;
  const activeQuickThread = quickSelectedThreadId
    ? threads.find((t) => t.id === quickSelectedThreadId)
    : null;

  // Upstream quoted record
  const quotedRecord = item.quote_id ? records.find((r) => r.id === item.quote_id) : null;
  // 跨日分支的子记录: level===0 说明父不在同一天树中, 分支关系已退化为引用
  const parentRecord = item.parent_id ? records.find((r) => r.id === item.parent_id) : null;
  const isCrossDayBranchChild = level === 0 && !!item.parent_id;
  const showUpstreamCard = !!item.quote_id || isCrossDayBranchChild;
  const upstreamRecord = item.quote_id ? quotedRecord : parentRecord;
  // 源记录引用色(同源同色, 无则回退琥珀)
  const upstreamColor =
    (item.quote_id ? quotedRecord?.quote_color : parentRecord?.quote_color) || item.quote_color || null;

  // Downstream records that quote this record
  const downstreamQuotes = records.filter((r) => r.quote_id === item.id);

  // Bidirectional Jump handler
  const handleJumpToRecord = (targetRecord: RecordItem) => {
    const elementId = `record-${targetRecord.id}`;
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightRecordId(targetRecord.id);
      setTimeout(() => {
        setHighlightRecordId(null);
      }, 1600);
    } else {
      const targetDate = targetRecord.created_at.split('T')[0];
      openDateRecord(targetDate);
      setHighlightRecordId(targetRecord.id);
      setTimeout(() => {
        const targetEl = document.getElementById(elementId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => {
          setHighlightRecordId(null);
        }, 1600);
      }, 250);
    }
  };

  const handleBranchClick = () => {
    if (isBranchingThis) {
      setActiveBranchParentId(null);
    } else {
      setActiveBranchParentId(item.id);
    }
  };

  const handleQuoteClick = () => {
    if (isQuotingThis) {
      setActiveQuoteRecordId(null);
    } else {
      setActiveQuoteRecordId(item.id);
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
    <div className="relative" id={`record-${item.id}`}>
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
          className={`relative group flex items-start py-2 px-2.5 rounded-lg transition-all duration-200 ${
            isHighlighted
              ? 'ring-2 ring-amber-400 bg-amber-50/90 shadow-md'
              : isBranchingThis
              ? 'bg-amber-50/90 ring-1 ring-amber-300 shadow-2xs'
              : isQuotingThis
              ? 'bg-amber-50/60 ring-1 ring-amber-300/80 shadow-2xs'
              : isEditing
              ? 'bg-blue-50/40 ring-1 ring-blue-200 shadow-2xs'
              : 'hover:bg-gray-50/90'
          }`}
          style={item.quote_color ? { boxShadow: `inset 3px 0 0 0 ${item.quote_color}` } : undefined}
        >
          {/* Timestamp: 灰色小号时间戳 */}
          <span className="text-[11.5px] font-mono text-gray-400 mt-0.5 mr-2 flex-shrink-0 w-10 select-none">
            {formatTime(item.created_at)}
          </span>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 pr-1">
            {/* Upstream Quoted Note Card (引用 或 跨日分支退化) */}
            {showUpstreamCard && (
              <div className="mb-1.5">
                {upstreamRecord ? (
                  <button
                    type="button"
                    onClick={() => handleJumpToRecord(upstreamRecord)}
                    className="group/quote text-left w-full flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all text-xs shadow-2xs cursor-pointer"
                    style={{
                      backgroundColor: upstreamColor ? `${upstreamColor}1f` : 'rgba(251,191,36,0.08)',
                      borderColor: upstreamColor ? `${upstreamColor}cc` : 'rgba(252,211,77,0.8)',
                      color: upstreamColor ?? '#78350f',
                    }}
                    title={item.quote_id ? '点击跳转到引用的原记录' : '点击跳转到跨日分支的父记录'}
                  >
                    <Quote
                      className="w-3 h-3 flex-shrink-0 group-hover/quote:scale-110 transition-transform"
                      style={{ color: upstreamColor ?? '#d97706' }}
                    />
                    <span
                      className="text-[10px] font-medium flex-shrink-0"
                      style={{ color: upstreamColor ? `${upstreamColor}cc` : '#b45309' }}
                    >
                      {formatShortDateTime(upstreamRecord.created_at)}
                    </span>
                    <span className="text-[11px] truncate font-normal">
                      {upstreamRecord.text}
                    </span>
                  </button>
                ) : (
                  <div className="text-[10.5px] text-gray-400 italic px-2 py-0.5 rounded bg-gray-50 border border-dashed border-gray-200">
                    [原记录已移除]
                  </div>
                )}
              </div>
            )}

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

            {/* Associated Thread Capsule 🔗 & Tag Badge [标签] & Downstream Quotes Badge */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {/* 🔗 Linked Thread Capsule */}
              {item.thread && (
                <button
                  onClick={() => openThreadDetail(item.thread!.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80 rounded-full transition-colors cursor-pointer"
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
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded hover:opacity-80 transition-opacity cursor-pointer"
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
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded border border-dashed border-gray-200 hover:border-gray-400 transition-all cursor-pointer"
                  title="补打标签"
                >
                  +打标签
                </button>
              )}

              {/* 💬 Downstream References Badge */}
              {downstreamQuotes.length > 0 && (
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => {
                      if (downstreamQuotes.length === 1) {
                        handleJumpToRecord(downstreamQuotes[0]);
                      } else {
                        setShowDownstreamPopover((prev) => !prev);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-colors cursor-pointer"
                    style={
                      item.quote_color
                        ? {
                            color: item.quote_color,
                            backgroundColor: `${item.quote_color}15`,
                            border: `1px solid ${item.quote_color}80`,
                          }
                        : {
                            color: '#92400e',
                            backgroundColor: 'rgba(251,191,36,0.12)',
                            border: '1px solid rgba(252,211,77,0.8)',
                          }
                    }
                    title={
                      downstreamQuotes.length === 1
                        ? `点击跳转到引用它的记录: "${downstreamQuotes[0].text}"`
                        : '点击查看所有引用它的后续记录'
                    }
                  >
                    <Quote
                      className="w-2.5 h-2.5 rotate-180"
                      style={{ color: item.quote_color ?? '#d97706' }}
                    />
                    <span>{downstreamQuotes.length}条后续引用</span>
                    {downstreamQuotes.length > 1 && <span className="text-[9px]">▾</span>}
                  </button>

                  {/* Popover if multiple downstream references */}
                  {showDownstreamPopover && downstreamQuotes.length > 1 && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setShowDownstreamPopover(false)}
                      />
                      <div className="absolute left-0 bottom-full mb-1.5 z-30 w-56 bg-white rounded-lg shadow-lg border border-amber-200/90 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-150">
                        <div className="text-[10px] text-amber-800/80 font-semibold px-1.5 py-0.5 border-b border-amber-100 mb-1">
                          后续引用记录 ({downstreamQuotes.length})
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {downstreamQuotes.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => {
                                setShowDownstreamPopover(false);
                                handleJumpToRecord(q);
                              }}
                              className="w-full text-left p-1.5 rounded hover:bg-amber-50 text-gray-800 hover:text-amber-900 transition-colors flex flex-col gap-0.5 cursor-pointer"
                            >
                              <span className="text-[10px] text-gray-400">
                                {formatShortDateTime(q.created_at)}
                              </span>
                              <span className="truncate text-[11.5px] font-normal">{q.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: ✎ (Edit), ⎇ (Branch), 💬 (Quote), ⚭ (Link Thread), ✕ (Delete) */}
          {/* 当处于编辑模式(isEditing)时隐藏普通操作按钮，避免打勾保存/取消与分支按钮挤压与点击冲突 */}
          {!isEditing && (
            <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5">
              {/* ✎ In-place Edit Button */}
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded transition-all opacity-0 group-hover:opacity-100"
                title="修改文字 (双击亦可编辑)"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

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

              {/* 💬 Quote Button */}
              <button
                onClick={handleQuoteClick}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  isQuotingThis
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400 font-bold opacity-100'
                    : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 opacity-60 group-hover:opacity-100'
                }`}
                title={isQuotingThis ? '取消引用' : '引用此记录 (💬)'}
              >
                <Quote className="w-3.5 h-3.5" />
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
          )}
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
