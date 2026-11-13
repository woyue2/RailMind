import React, { useState, useRef, useEffect } from 'react';
import {
  GitBranch,
  Link2,
  X,
  Pencil,
  Check,
  Quote,
  Palette,
  ArrowUpRightFromSquare,
  Camera,
  Loader2,
  Mic,
  MoreHorizontal,
  ChevronUp,
  Pin,
  LayoutGrid,
  Gem,
  FolderOpen,
  FolderPlus,
  Tag,
} from 'lucide-react';
import { RecordTreeNode, RecordItem } from '../../types';
import { formatTime, formatShortDateTime, formatSimpleDate, getLocalDateKey } from '../../utils/dateUtils';
import { processImageFiles, MAX_NOTE_IMAGES } from '../../utils/imageUtils';
import { useFlowStore } from '../../store/useFlowStore';
import { ConfirmDeleteModal } from '../../components/modals/ConfirmDeleteModal';
import { ImageViewerModal } from '../../components/modals/ImageViewerModal';
import { AudioPlayerPill } from '../../components/common/AudioPlayerPill';
import { AudioRecorderModal } from '../../components/modals/AudioRecorderModal';
import { useSystemBack } from '../../hooks/useSystemBack';
import { EisenhowerQuadrantModal } from '../../components/modals/EisenhowerQuadrantModal';
import { ValuePriorityWizard } from '../../components/modals/ValuePriorityWizard';
import { flashRecord } from '../../utils/scrollUtils';
import type { RecordPageScope } from '../../utils/recordPage';
import { childPreviewPath } from '../../utils/recordPage';

interface RecordItemRowProps {
  item: RecordTreeNode;
  level: number;
  isLastChild?: boolean;
  displayDate?: string;
  previewPath?: string;
  /** 目前頁面的界定（日期翻頁不傳，標籤翻頁傳 key + keyOf）。 */
  page?: RecordPageScope;
  /** 覆寫「跳到來源記錄」的行為（標籤翻頁需要先切頁）。 */
  onJumpToRecord?: (record: RecordItem) => void;
  onOpenThreadPicker: (recordId: string, currentText: string) => void;
  onOpenTagPicker: (recordId: string, currentTagId: string | null) => void;
  onOpenDeskPicker?: (recordId: string) => void;
  onCreateDrawerFromRecord?: (recordId: string) => void;
  deskDrawerTitle?: string;
  onRecordsDeleted?: (records: RecordItem[]) => void;
  checklist?: boolean;
}

export const RecordItemRow: React.FC<RecordItemRowProps> = ({
  item,
  level,
  isLastChild = false,
  displayDate = getLocalDateKey(item.created_at),
  previewPath,
  page,
  onJumpToRecord,
  onOpenThreadPicker,
  onOpenTagPicker,
  onOpenDeskPicker,
  onCreateDrawerFromRecord,
  deskDrawerTitle,
  onRecordsDeleted,
  checklist = false,
}) => {
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const setActiveBranchParentId = useFlowStore((s) => s.setActiveBranchParentId);
  const activeQuoteRecordId = useFlowStore((s) => s.activeQuoteRecordId);
  const setActiveQuoteRecordId = useFlowStore((s) => s.setActiveQuoteRecordId);
  const highlightRecordId = useFlowStore((s) => s.highlightRecordId);
  const setSelectedDate = useFlowStore((s) => s.setSelectedDate);
  const openThreadDetail = useFlowStore((s) => s.openThreadDetail);
  const deleteRecord = useFlowStore((s) => s.deleteRecord);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const togglePinRecord = useFlowStore((s) => s.togglePinRecord);
  const toggleCompletedRecord = useFlowStore((s) => s.toggleCompletedRecord);
  const quickSelectedThreadId = useFlowStore((s) => s.quickSelectedThreadId);
  const setQuickSelectedThreadId = useFlowStore((s) => s.setQuickSelectedThreadId);

  // In-place text editing state
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
  const [imgTip, setImgTip] = useState<{
    message: string;
    tone: 'info' | 'success' | 'warning';
  } | null>(null);
  const imgSlots = (item.imgs?.length ?? 0) < MAX_NOTE_IMAGES;

  // Note custom background color popover state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down');

  // Audio recorder modal state for existing record
  const [audioModalOpen, setAudioModalOpen] = useState(false);

  // Dynamic actions expansion state (default collapsed to 2 rows)
  const [isActionsExpanded, setIsActionsExpanded] = useState(false);

  // Popover state for multiple downstream references
  const [showDownstreamPopover, setShowDownstreamPopover] = useState(false);
  const [quadrantModalOpen, setQuadrantModalOpen] = useState(false);
  const [valueWizardOpen, setValueWizardOpen] = useState(false);

  useSystemBack(showColorPicker, () => setShowColorPicker(false));
  useSystemBack(isActionsExpanded, () => setIsActionsExpanded(false));

  useEffect(() => {
    if (!isActionsExpanded) setShowColorPicker(false);
  }, [isActionsExpanded]);

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
  // 分組（有子步驟）不顯示自己的勾選框，只顯示子樹的完成進度。
  const groupTotal = hasChildren ? item.progress?.total ?? 0 : 0;
  const groupDone = hasChildren ? item.progress?.done ?? 0 : 0;
  const childChecklist = checklist || (item.children?.length ?? 0) >= 2;

  // Upstream quoted record
  const quotedRecord = item.quotedRecord ?? null;
  // Only the canonical daily occurrence needs a cross-day source card.
  const parentRecord = item.parentRecord ?? null;
  const isCrossDayBranchChild = !previewPath && !!item.parent_id &&
    (!parentRecord || getLocalDateKey(parentRecord.created_at) !== getLocalDateKey(item.created_at));
  const showUpstreamCard = !!item.quote_id || isCrossDayBranchChild;
  const upstreamRecord = item.quote_id ? quotedRecord : parentRecord;
  const UpstreamIcon = item.quote_id ? Quote : GitBranch;
  // 来源色由引用记录或分支父记录提供。
  // 谨记不 fallback 到自身 color，否则子记录会取错自己的色，导致同源不同色。
  const upstreamColor =
    (item.quote_id ? quotedRecord?.quote_color : parentRecord?.quote_color) || null;

  // Downstream records that quote this record
  const downstreamQuotes = item.downstreamQuotes ?? [];

  // Bidirectional Jump handler
  const handleJumpToRecord = (targetRecord: RecordItem) => {
    if (onJumpToRecord) {
      onJumpToRecord(targetRecord);
      return;
    }
    setSelectedDate(getLocalDateKey(targetRecord.created_at));
    flashRecord(targetRecord.id, 300);
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

  const showImageTip = (message: string, tone: 'success' | 'warning') => {
    setImgTip({ message, tone });
    setTimeout(() => setImgTip(null), 3500);
  };

  // Append images to the existing record (compress then merge into imgs)
  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    if (!fileList || fileList.length === 0) {
      showImageTip('未读取到所选图片，请重试', 'warning');
      return;
    }

    setIsProcessingImg(true);
    setImgTip({ message: `正在处理 ${fileList.length} 张图片…`, tone: 'info' });
    try {
      const current = item.imgs?.length ?? 0;
      const { compressed, error } = await processImageFiles(fileList, current);
      if (compressed.length > 0) {
        const merged = [...(item.imgs ?? []), ...compressed].slice(0, MAX_NOTE_IMAGES);
        updateRecord(item.id, { imgs: merged });
        showImageTip(
          error ? `已添加 ${compressed.length} 张图片；${error}` : `已添加 ${compressed.length} 张图片`,
          error ? 'warning' : 'success'
        );
      } else {
        showImageTip(error || '未能处理所选图片，请重试', 'warning');
      }
    } catch (err) {
      console.error('Failed to process image:', err);
      showImageTip('图片处理失败，请重试', 'warning');
    } finally {
      setIsProcessingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  const actionItems: Array<{ label: string; icon: React.ElementType; onClick?: () => void; keepOpen?: boolean; disabled?: boolean }> = isActionsExpanded ? [
    { label: '編輯文字', icon: Pencil, onClick: () => setIsEditing(true) },
    { label: '續寫', icon: GitBranch, onClick: handleBranchClick },
    { label: '回覆', icon: Quote, onClick: handleQuoteClick },
    { label: item.thread_id ? '更換思維線' : '關聯思維線', icon: Link2, onClick: handleThreadLinkClick },
    ...(onOpenDeskPicker ? [{ label: item.desk_entry_id ? '更換抽屜' : '收進抽屜', icon: FolderOpen, onClick: () => onOpenDeskPicker(item.id) }] : []),
    ...(onCreateDrawerFromRecord ? [{ label: '建立抽屜', icon: FolderPlus, onClick: () => onCreateDrawerFromRecord(item.id) }] : []),
    { label: item.tag_id ? '更換標籤' : '打標籤', icon: Tag, onClick: () => onOpenTagPicker(item.id, item.tag_id) },
    { label: item.eisenhower_quadrant ? '移出四象限' : '加入四象限', icon: LayoutGrid, onClick: () => { if (item.eisenhower_quadrant) updateRecord(item.id, { eisenhower_quadrant: null }); else setQuadrantModalOpen(true); } },
    { label: item.value_priority ? '移出價值象限' : '加入價值象限', icon: Gem, onClick: () => { if (item.value_priority) updateRecord(item.id, { value_priority: null }); else setValueWizardOpen(true); } },
    { label: '底色', icon: Palette, onClick: () => setShowColorPicker((prev) => !prev), keepOpen: true },
    { label: item.is_pinned ? '取消置頂' : '置頂', icon: Pin, onClick: () => togglePinRecord(item.id) },
    { label: '圖片', icon: Camera, onClick: () => imgInputRef.current?.click(), disabled: isProcessingImg },
    { label: '錄音', icon: Mic, onClick: () => setAudioModalOpen(true) },
    ...(hasChildren
      ? [{ label: item.is_completed ? '取消群組完成' : '完成群組', icon: Check, onClick: () => toggleCompletedRecord(item.id) }]
      : []),
  ] : [];

  const displayId = previewPath ? `record-preview-${previewPath}` : `record-${item.id}`;
  if (previewPath && !isExpanded) {
    return (
      <button type="button" id={displayId} data-record-id={item.id} aria-expanded={false}
        onClick={() => setIsExpanded(true)}
        className="block w-full min-w-0 text-left rounded-lg border border-amber-100 bg-amber-50/40 px-2.5 py-2 hover:bg-amber-50">
        <span className="flex items-center gap-1 text-[11px] text-amber-700">
          <GitBranch className="w-3 h-3 shrink-0" />
          {formatSimpleDate(item.created_at)}续写
          <span className="ml-auto shrink-0">展开</span>
        </span>
        <span className="mt-1 line-clamp-2 break-words text-[13px] text-gray-700">
          {item.text || (item.imgs?.length ? '图片记录' : item.audio ? '语音记录' : '记录')}
        </span>
        {!!(item.imgs?.length || item.audio) && <span className="text-[10px] text-gray-400">含{item.imgs?.length ? '图片' : ''}{item.audio ? ' 语音' : ''}</span>}
      </button>
    );
  }

  return (
    <div className="relative min-w-0" id={displayId} data-record-id={item.id}>
      {previewPath && <button type="button" aria-expanded={true}
        onClick={() => setIsExpanded(false)}
        className="flex w-full items-center gap-1 px-2.5 py-1 text-[11px] text-amber-700">
        <GitBranch className="w-3 h-3" />{formatSimpleDate(item.created_at)}续写
        <span className="ml-auto">收起</span>
      </button>}
      {/*
        Node Row Container:
        - 每一层子分支由左侧父容器的虚线导轨引导 (border-l)
        - 当前子节点通过水平虚线分支延伸连接 (├─ 或 └─)
      */}
      <div className="relative">
        {/* Horizontal Dashed Branch Connector for level > 0 */}
        {level > 0 && !checklist && (
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
          className={`relative group flex items-start ${checklist ? 'ml-14 py-0.5 px-1 rounded-md' : 'py-2 px-2.5 rounded-lg'} transition-all duration-200 ${
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
          {/* 時間戳：清單模式下由行首勾選框取代 */}
          {!checklist && (
            <div className="flex flex-col items-center mr-2 flex-shrink-0 w-14 select-none">
              <span className="text-[11.5px] font-mono text-gray-400 mt-0.5">
                {formatTime(item.created_at)}
              </span>
            </div>
          )}

          {checklist && !hasChildren && (
            <button
              type="button"
              onClick={() => toggleCompletedRecord(item.id)}
              className={`mt-0.5 mr-1.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] transition-colors ${
                item.is_completed
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                  : 'border-gray-300 bg-white text-transparent hover:border-emerald-400'
              }`}
              aria-label={item.is_completed ? '取消已完成' : '標記為已完成'}
            >
              <Check className="h-3 w-3" />
            </button>
          )}

          {checklist && hasChildren && (
            <span className="mt-0.5 mr-1.5 w-8 flex-shrink-0 text-center text-[10px] font-mono text-gray-400">
              {groupDone}/{groupTotal}
            </span>
          )}

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 pr-1">
            {/* Source card for quotes and canonical cross-day branches */}
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
                    <UpstreamIcon
                      className="w-3 h-3 flex-shrink-0 group-hover/quote:scale-110 transition-transform"
                      style={{ color: upstreamColor ?? '#d97706' }}
                    />
                    <span
                      className="text-[10px] font-medium flex-shrink-0"
                      style={{ color: upstreamColor ? `${upstreamColor}cc` : '#b45309' }}
                    >
                      {item.quote_id ? formatShortDateTime(upstreamRecord.created_at) : `分支自 ${formatSimpleDate(upstreamRecord.created_at)} ·`}
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
                    来源记录已删除
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
                    className={`text-[13.5px] leading-snug break-words font-normal cursor-text select-text transition-colors ${
                      item.is_completed ? 'text-gray-500 line-through' : 'text-gray-900'
                    }`}
                    title="双击可直接修改文字"
                  >
                    {item.text}
                    {hasChildren && !checklist && (
                      <span
                        className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-middle text-[10px] font-mono font-medium ${
                          item.is_completed ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.is_completed ? '✓ ' : ''}{groupDone}/{groupTotal}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Note Images Grid / Single Image (附带图片展示) + 追加/添加图片入口 */}
            {imgTip && (
              <div
                className={`text-[11px] mb-1.5 px-0.5 animate-in fade-in ${
                  imgTip.tone === 'warning'
                    ? 'text-amber-600'
                    : imgTip.tone === 'success'
                      ? 'text-emerald-600'
                      : 'text-sky-600'
                }`}
              >
                {imgTip.message}
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

              {/* [标签] Tag Badge（僅已打標籤時顯示，避免常駐入口） */}
              {item.tag && (
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
              )}

              {/* 🪑 桌邊來源徽章：若記錄來自桌邊抽屜 */}
              {item.desk_entry_id && (
                <button
                  onClick={() => onOpenDeskPicker?.(item.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                  title={`來自桌邊抽屜「${deskDrawerTitle || '桌邊'}」，點擊查看或移動`}
                >
                  <span>🪑</span>
                  <span className="truncate max-w-[130px] font-semibold">{deskDrawerTitle ? `抽屜: ${deskDrawerTitle}` : '桌邊'}</span>
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
            <div className="relative flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
              {/* 預設只露三個：續寫、勾消、更多 */}
              <div className="grid grid-cols-1 gap-0.5 place-items-center">
                {!checklist && (
                  <button
                    onClick={handleBranchClick}
                    className={`p-1.5 rounded transition-all flex items-center justify-center ${
                      isBranchingThis
                        ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400 font-bold'
                        : 'text-gray-400 hover:text-gray-800 hover:bg-gray-100 pointer-fine:opacity-60 group-hover:opacity-100'
                    }`}
                    title={isBranchingThis ? '取消续写' : '从这里续写'}
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                  </button>
                )}
                {!checklist && !hasChildren && (
                  <button
                    onClick={() => toggleCompletedRecord(item.id)}
                    className={`p-1.5 rounded transition-all flex items-center justify-center ${
                      item.is_completed
                        ? 'text-emerald-600 bg-emerald-50 ring-1 ring-emerald-200'
                        : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 pointer-fine:opacity-60 group-hover:opacity-100'
                    }`}
                    title={item.is_completed ? '取消已完成' : '标记为已完成'}
                    aria-pressed={Boolean(item.is_completed)}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenuPlacement(window.innerHeight - rect.bottom < 360 ? 'up' : 'down');
                    setIsActionsExpanded((prev) => !prev);
                  }}
                  className={`relative p-1.5 rounded transition-all flex items-center justify-center ${
                    isActionsExpanded
                      ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-300 opacity-100'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 pointer-fine:opacity-60 group-hover:opacity-100'
                  }`}
                  title={isActionsExpanded ? '收起更多操作' : '展开更多操作'}
                  aria-expanded={isActionsExpanded}
                >
                  {isActionsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {isActionsExpanded && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsActionsExpanded(false)} />
                  <div className={`absolute right-0 z-40 w-56 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ${menuPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <div className="grid grid-cols-2 gap-0.5">
                      {actionItems.map((entry) => {
                        const Icon = entry.icon;
                        return (
                          <button
                            key={entry.label}
                            type="button"
                            onClick={() => { entry.onClick?.(); if (!entry.keepOpen) setIsActionsExpanded(false); }}
                            disabled={entry.disabled}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-[11px] text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                            <span className="truncate">{entry.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {showColorPicker && (
                      <div className="mt-1 border-t border-gray-100 pt-1.5">
                        <div className="grid grid-cols-8 gap-1">
                          {['#FEF9C3', '#FFE4E6', '#DCFCE7', '#E0F2FE', '#F3E8FF', '#FFEDD5', '#CCFBF1', '#F1F5F9'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => { updateRecord(item.id, { bg_color: color }); setShowColorPicker(false); }}
                              className={`h-5 w-5 rounded transition-transform hover:scale-105 ${
                                item.bg_color === color ? 'ring-2 ring-gray-900 ring-offset-1' : 'border border-gray-200'
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`底色 ${color}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => { updateRecord(item.id, { bg_color: null }); setShowColorPicker(false); }}
                          className="mt-1 text-left text-[10px] text-gray-400 hover:text-gray-700"
                        >
                          清除底色
                        </button>
                        <label className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
                          自訂
                          <input
                            type="color"
                            value={item.bg_color || '#ffffff'}
                            onChange={(event) => updateRecord(item.id, { bg_color: event.target.value })}
                            className="h-5 w-5 rounded border-0 bg-transparent p-0"
                          />
                        </label>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setDeleteModalOpen(true); setIsActionsExpanded(false); }}
                      className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-[11px] text-red-600 transition-colors hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>刪除</span>
                    </button>
                  </div>

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

      <EisenhowerQuadrantModal
        isOpen={quadrantModalOpen}
        title={item.text}
        current={item.eisenhower_quadrant}
        onClose={() => setQuadrantModalOpen(false)}
        onSelect={(quadrant) => {
          updateRecord(item.id, { eisenhower_quadrant: quadrant });
          setQuadrantModalOpen(false);
        }}
      />

      <ValuePriorityWizard
        isOpen={valueWizardOpen}
        record={item}
        onClose={() => setValueWizardOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          const deletedRecords = deleteRecord(item.id);
          onRecordsDeleted?.(deletedRecords);
        }}
        recordText={item.text}
        hasChildren={hasChildren}
      />

      {/* Hidden File Input for appending images to an existing record */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        multiple
        // 用离屏定位代替 display:none，规避 Android WebView 对隐藏文件框选择结果丢失的问题
        className="fixed opacity-0 w-px h-px -left-[9999px]"
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
        <div className={
          childChecklist
            ? 'relative mt-1 ml-1 pl-1 space-y-0.5'
            : `relative ${level < 2 ? 'ml-[10px] pl-[12px]' : 'ml-0 pl-1'} border-l-[1.5px] border-dashed border-slate-300 my-0.5 space-y-0.5`
        }>
          {item.children!.map((child, idx) => {
            const currentPageKey = page?.key ?? displayDate;
            return (
              <RecordItemRow
                key={child.id}
                item={child}
                level={level + 1}
                checklist={childChecklist}
                displayDate={displayDate}
                page={page}
                onJumpToRecord={onJumpToRecord}
                previewPath={childPreviewPath(page, currentPageKey, item.id, previewPath, child)}
                isLastChild={idx === item.children!.length - 1}
                onOpenThreadPicker={onOpenThreadPicker}
                onOpenTagPicker={onOpenTagPicker}
                onOpenDeskPicker={onOpenDeskPicker}
                onCreateDrawerFromRecord={onCreateDrawerFromRecord}
                onRecordsDeleted={onRecordsDeleted}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
