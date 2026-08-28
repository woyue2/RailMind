import React, { useState, useRef, useEffect } from 'react';
import {
  GitBranch,
  Link2,
  X,
  Pencil,
  Check,
  Quote,
  Palette,
  Sparkles,
  ArrowUpRightFromSquare,
  Camera,
  Loader2,
  Mic,
  Volume2,
  MoreHorizontal,
  ChevronUp,
} from 'lucide-react';
import { EnrichedRecordItem, RecordItem } from '../../types';
import { formatTime, formatShortDateTime } from '../../utils/dateUtils';
import { processImageFiles, MAX_NOTE_IMAGES } from '../../utils/imageUtils';
import { useFlowStore } from '../../store/useFlowStore';
import { ConfirmDeleteModal } from '../../components/modals/ConfirmDeleteModal';
import { ImageViewerModal } from '../../components/modals/ImageViewerModal';
import { AudioPlayerPill } from '../../components/common/AudioPlayerPill';
import { AudioRecorderModal } from '../../components/modals/AudioRecorderModal';

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

  // Image viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Append images to an existing record
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [imgErrorTip, setImgErrorTip] = useState<string | null>(null);
  const imgSlots = (item.imgs?.length ?? 0) < MAX_NOTE_IMAGES;

  // Note custom background color popover state
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Audio recorder modal state for existing record
  const [audioModalOpen, setAudioModalOpen] = useState(false);

  // Dynamic actions expansion state (default collapsed to 2 rows)
  const [isActionsExpanded, setIsActionsExpanded] = useState(false);

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
  // 源记录引用色: 引用路径取被引记录的 color；跨日分支退化取父记录的 color。
  // 谨记不 fallback 到自身 color，否则子记录会取错自己的色，导致同源不同色。
  const upstreamColor =
    (item.quote_id ? quotedRecord?.quote_color : parentRecord?.quote_color) || null;

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

  // Append images to the existing record (compress then merge into imgs)
  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = ''; // 允许再次选择同一文件
    if (!files || files.length === 0) return;
    setIsProcessingImg(true);
    try {
      const current = item.imgs?.length ?? 0;
      const { compressed, error } = await processImageFiles(files, current);
      if (compressed.length > 0) {
        const merged = [...(item.imgs ?? []), ...compressed].slice(0, MAX_NOTE_IMAGES);
        updateRecord(item.id, { imgs: merged });
      }
      setImgErrorTip(error ?? null);
      if (error) {
        setTimeout(() => setImgErrorTip(null), 2500);
      }
    } catch (err) {
      console.error('Failed to process image:', err);
      setImgErrorTip('图片处理失败，请重试');
      setTimeout(() => setImgErrorTip(null), 2500);
    } finally {
      setIsProcessingImg(false);
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
              : item.bg_color
              ? 'border border-black/5 shadow-2xs'
              : 'hover:bg-gray-50/90'
          }`}
          style={{
            backgroundColor: !isHighlighted && !isBranchingThis && !isQuotingThis && !isEditing && item.bg_color ? item.bg_color : undefined,
            boxShadow: item.quote_color ? `inset 3px 0 0 0 ${item.quote_color}` : undefined,
          }}
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
                    <span
                      className="text-[11px] truncate font-normal flex-1 min-w-0"
                      style={{ color: upstreamColor ?? '#6b7280' }}
                    >
                      {upstreamRecord.text}
                    </span>
                    {/* 跳转箭头: 提示该卡可点击跳转到源记录 */}
                    <ArrowUpRightFromSquare
                      className="w-3 h-3 flex-shrink-0 opacity-60 group-hover/quote:opacity-100 group-hover/quote:scale-110 transition-all"
                      style={{ color: upstreamColor ?? '#d97706' }}
                    />
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
              <div>
                {item.text && (
                  <div
                    onDoubleClick={() => setIsEditing(true)}
                    className="text-[13.5px] text-gray-900 leading-snug break-words font-normal cursor-text select-text"
                    title="双击可直接修改文字"
                  >
                    {item.text}
                  </div>
                )}
              </div>
            )}

            {/* Note Images Grid / Single Image (附带图片展示) + 追加/添加图片入口 */}
            {imgErrorTip && (
              <div className="text-[11px] text-amber-600 mb-1.5 px-0.5 animate-in fade-in">
                {imgErrorTip}
              </div>
            )}

            {item.imgs && item.imgs.length > 0 && (
              <div className="mt-2">
                {item.imgs.length === 1 ? (
                  // 单张图片：自适应大卡片展示 + 右侧追加按钮
                  <div className="flex items-start gap-1.5">
                    <div
                      onClick={() => {
                        setViewerIndex(0);
                        setViewerOpen(true);
                      }}
                      className="relative max-w-xs max-h-44 rounded-xl overflow-hidden border border-gray-200/80 shadow-2xs cursor-zoom-in group/img"
                    >
                      <img
                        src={item.imgs[0]}
                        alt="便签图片"
                        className="w-full h-full max-h-44 object-cover group-hover/img:scale-102 transition-transform duration-200"
                      />
                    </div>
                    {/* 未达上限：单图旁追加 */}
                    {imgSlots && (
                      <button
                        type="button"
                        onClick={() => imgInputRef.current?.click()}
                        disabled={isProcessingImg}
                        className="w-14 h-14 self-start mt-1 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0 transition-colors"
                        title={`追加图片 (${item.imgs.length}/${MAX_NOTE_IMAGES})`}
                      >
                        {isProcessingImg ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                        ) : (
                          <>
                            <Camera className="w-4 h-4" />
                            <span className="text-[10px] scale-90">{item.imgs.length}/{MAX_NOTE_IMAGES}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  // 2~4 张图片：2 列紧凑正方形网格，末尾追加一格
                  <div className="grid grid-cols-2 gap-1.5 max-w-xs">
                    {item.imgs.map((src, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setViewerIndex(idx);
                          setViewerOpen(true);
                        }}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200/80 shadow-2xs cursor-zoom-in group/img"
                      >
                        <img
                          src={src}
                          alt={`便签图片 ${idx + 1}`}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                        />
                      </div>
                    ))}
                    {/* 未达上限：网格末尾追加一格 */}
                    {imgSlots && (
                      <button
                        type="button"
                        onClick={() => imgInputRef.current?.click()}
                        disabled={isProcessingImg}
                        className="aspect-square rounded-lg border border-dashed border-gray-300 hover:border-gray-400 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors group/add"
                        title={`追加图片 (${item.imgs.length}/${MAX_NOTE_IMAGES})`}
                      >
                        {isProcessingImg ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                        ) : (
                          <Camera className="w-5 h-5 group-hover/add:scale-110 transition-transform" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Note Audio Player Pill (附带录音便签展示) */}
            {item.audio && (
              <div className="mt-2">
                <AudioPlayerPill audio={item.audio} />
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
            <div className="grid grid-cols-3 gap-0.5 flex-shrink-0 pt-0.5 place-items-center">
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

              {/* 🎨 Palette Button for per-note background color */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColorPicker((prev) => !prev)}
                  className={`p-1.5 rounded transition-all ${
                    item.bg_color
                      ? 'text-amber-700 bg-amber-100/80 ring-1 ring-amber-300 font-medium opacity-100'
                      : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 opacity-60 group-hover:opacity-100'
                  }`}
                  title="设置便签背景颜色 (🎨)"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>

                {/* Color Picker Popover */}
                {showColorPicker && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowColorPicker(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-2 z-40 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/90 p-2.5 animate-in fade-in zoom-in-95 duration-150 select-none">
                      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 mb-2 pb-1 border-b border-gray-100">
                        <span className="flex items-center gap-1">
                          <Palette className="w-3 h-3 text-amber-600" />
                          便签背景底色
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateRecord(item.id, { bg_color: null });
                            setShowColorPicker(false);
                          }}
                          className="text-[10px] text-gray-400 hover:text-red-600 transition-colors"
                        >
                          默认无色
                        </button>
                      </div>

                      {/* 预设低饱和马卡龙/手账便签底色 */}
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {[
                          { name: '柠檬浅黄', color: '#FEF9C3' },
                          { name: '柔和杏粉', color: '#FFE4E6' },
                          { name: '薄荷浅绿', color: '#DCFCE7' },
                          { name: '冰雾浅蓝', color: '#E0F2FE' },
                          { name: '薰衣草紫', color: '#F3E8FF' },
                          { name: '暖橙浅麦', color: '#FFEDD5' },
                          { name: '恬淡浅青', color: '#CCFBF1' },
                          { name: '典雅浅灰', color: '#F1F5F9' },
                        ].map((c) => (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              updateRecord(item.id, { bg_color: c.color });
                              setShowColorPicker(false);
                            }}
                            className={`w-8 h-8 rounded-lg border transition-all flex items-center justify-center ${
                              item.bg_color === c.color
                                ? 'border-gray-900 scale-110 shadow-xs'
                                : 'border-gray-200/90 hover:scale-105 hover:border-gray-400'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {item.bg_color === c.color && (
                              <Check className="w-3.5 h-3.5 text-gray-800" />
                            )}
                          </button>
                        ))}
                      </div>

                      {/* 自定义颜色取色器 */}
                      <label className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer text-[11px] text-gray-700 transition-colors">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-blue-500" />
                          自定义颜色
                        </span>
                        <input
                          type="color"
                          value={item.bg_color || '#ffffff'}
                          onChange={(e) => {
                            updateRecord(item.id, { bg_color: e.target.value });
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* ··· More / Expand 3rd Row Toggle Button (Slot 6) */}
              <button
                type="button"
                onClick={() => setIsActionsExpanded((prev) => !prev)}
                className={`relative p-1.5 rounded transition-all flex items-center justify-center ${
                  isActionsExpanded
                    ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-300 opacity-100'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-60 group-hover:opacity-100'
                }`}
                title={isActionsExpanded ? '收起更多操作' : '展开更多操作 (📷图片 / 🎙️录音 / 🏷️标签 / ✕删除)'}
              >
                {isActionsExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <>
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    {/* 微小状态提示点：如果该记录已附带图片或音频 */}
                    {(item.imgs?.length || item.audio || item.tag) ? (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 ring-1 ring-white" />
                    ) : null}
                  </>
                )}
              </button>

              {/* Row 3 (Dynamically rendered only when expanded) */}
              {isActionsExpanded && (
                <>
                  {/* 📷 Add / Manage Image Button */}
                  <button
                    type="button"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={isProcessingImg}
                    className={`p-1.5 rounded transition-all flex items-center justify-center animate-in fade-in slide-in-from-top-1 duration-150 ${
                      item.imgs && item.imgs.length > 0
                        ? 'text-sky-600 bg-sky-50 ring-1 ring-sky-300 font-medium opacity-100'
                        : 'text-gray-400 hover:text-sky-600 hover:bg-sky-50 opacity-80 hover:opacity-100'
                    }`}
                    title={
                      item.imgs && item.imgs.length > 0
                        ? `追加/管理图片 (已附带 ${item.imgs.length}/${MAX_NOTE_IMAGES} 张)`
                        : '为此记录添加图片/随手拍 (📷)'
                    }
                  >
                    {isProcessingImg ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* 🎙️ Voice Memo / Mic Recording Button */}
                  <button
                    type="button"
                    onClick={() => setAudioModalOpen(true)}
                    className={`p-1.5 rounded transition-all flex items-center justify-center animate-in fade-in slide-in-from-top-1 duration-150 ${
                      item.audio
                        ? 'text-indigo-600 bg-indigo-50 ring-1 ring-indigo-300 font-medium opacity-100'
                        : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-80 hover:opacity-100'
                    }`}
                    title={
                      item.audio
                        ? `管理/重新录制语音 (${item.audio.duration}s)`
                        : '为此记录录制语音便签 (🎙️)'
                    }
                  >
                    {item.audio ? <Volume2 className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>

                  {/* Delete button (Pops up confirmation modal) */}
                  <button
                    onClick={() => setDeleteModalOpen(true)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-80 hover:opacity-100 transition-all animate-in fade-in slide-in-from-top-1 duration-150"
                    title="删除记录 (✕)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Audio Recorder Modal for existing note */}
      <AudioRecorderModal
        isOpen={audioModalOpen}
        onClose={() => setAudioModalOpen(false)}
        onSaveAudio={(audio) => updateRecord(item.id, { audio })}
        initialAudio={item.audio}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => deleteRecord(item.id)}
        recordText={item.text}
        hasChildren={hasChildren}
      />

      {/* Hidden File Input for appending images to an existing record */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAddImages}
      />

      {/* Image Viewer Full-Screen Modal */}
      {item.imgs && item.imgs.length > 0 && (
        <ImageViewerModal
          isOpen={viewerOpen}
          images={item.imgs}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}

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
