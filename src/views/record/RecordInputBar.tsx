import React, { useState, useRef, useEffect } from 'react';
import { Send, X, GitBranch, Sparkles, Quote, Camera, Plus, Loader2 } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { processImageFiles, MAX_NOTE_IMAGES } from '../../utils/imageUtils';

export const RecordInputBar: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [pendingImgs, setPendingImgs] = useState<string[]>([]);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [imgErrorTip, setImgErrorTip] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getRecentThreads = useFlowStore((s) => s.getRecentThreads);
  const activeBranchParentId = useFlowStore((s) => s.activeBranchParentId);
  const setActiveBranchParentId = useFlowStore((s) => s.setActiveBranchParentId);
  const activeQuoteRecordId = useFlowStore((s) => s.activeQuoteRecordId);
  const setActiveQuoteRecordId = useFlowStore((s) => s.setActiveQuoteRecordId);
  const quickSelectedThreadId = useFlowStore((s) => s.quickSelectedThreadId);
  const setQuickSelectedThreadId = useFlowStore((s) => s.setQuickSelectedThreadId);
  const addRecord = useFlowStore((s) => s.addRecord);
  const records = useFlowStore((s) => s.records);

  const recentThreads = getRecentThreads(3);

  // Parent record info if in branching mode
  const parentRecord = activeBranchParentId
    ? records.find((r) => r.id === activeBranchParentId)
    : null;

  // Quoted record info if in quote mode
  const quotedRecord = activeQuoteRecordId
    ? records.find((r) => r.id === activeQuoteRecordId)
    : null;

  // Auto focus input when branching mode or quote mode turns on
  useEffect(() => {
    if ((activeBranchParentId || activeQuoteRecordId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeBranchParentId, activeQuoteRecordId]);

  // Handle image file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingImg(true);
    setImgErrorTip(null);
    try {
      const { compressed, error } = await processImageFiles(files, pendingImgs.length);
      if (compressed.length > 0) {
        setPendingImgs((prev) => [...prev, ...compressed].slice(0, MAX_NOTE_IMAGES));
      }
      if (error) {
        setImgErrorTip(error);
        setTimeout(() => setImgErrorTip(null), 2500);
      }
    } catch (err) {
      console.error('Failed to process image:', err);
    } finally {
      setIsProcessingImg(false);
      // Reset input value so same files can be re-selected if desired
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingImg = (index: number) => {
    setPendingImgs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = !!inputText.trim();
    const hasImgs = pendingImgs.length > 0;
    if (!hasText && !hasImgs) return;

    addRecord(inputText, {
      parent_id: activeBranchParentId,
      thread_id: quickSelectedThreadId,
      quote_id: activeQuoteRecordId,
      imgs: hasImgs ? pendingImgs : undefined,
    });

    setInputText('');
    setPendingImgs([]);
  };

  const canSubmit = (!!inputText.trim() || pendingImgs.length > 0) && !isProcessingImg;

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

      {/* 1.5 Quoting State Alert (if active) */}
      {quotedRecord && (
        <div
          className="mb-2 px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs shadow-xs animate-in fade-in duration-150"
          style={
            quotedRecord.quote_color
              ? {
                  backgroundColor: `${quotedRecord.quote_color}18`,
                  border: `1px solid ${quotedRecord.quote_color}80`,
                  color: quotedRecord.quote_color,
                }
              : {
                  backgroundColor: 'rgba(251,191,36,0.14)',
                  border: '1px solid rgba(252,211,77,0.8)',
                  color: '#78350f',
                }
          }
        >
          <div className="flex items-center gap-1.5 truncate pr-2">
            <Quote
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: quotedRecord.quote_color ?? '#d97706' }}
            />
            <span
              className="text-[11px] font-semibold"
              style={{ color: quotedRecord.quote_color ?? '#92400e' }}
            >
              引用:
            </span>
            <span className="truncate font-normal">{quotedRecord.text}</span>
          </div>
          <button
            onClick={() => setActiveQuoteRecordId(null)}
            className="p-0.5 rounded hover:bg-black/5 transition-colors"
            title="取消引用"
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

      {/* 2.5 待发送图片预览条 (Pending Images Preview Strip) */}
      {pendingImgs.length > 0 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar py-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {pendingImgs.map((imgSrc, idx) => (
            <div
              key={idx}
              className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 shadow-xs group"
            >
              <img src={imgSrc} alt={`待发送图片 ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePendingImg(idx)}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
                title="移除图片"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}

          {/* 未达到上限时展示「+ 追加」按钮 */}
          {pendingImgs.length < MAX_NOTE_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImg}
              className="w-14 h-14 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 bg-gray-50 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0 transition-colors"
              title={`添加照片 (${pendingImgs.length}/${MAX_NOTE_IMAGES})`}
            >
              {isProcessingImg ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span className="text-[10px] scale-90">{pendingImgs.length}/{MAX_NOTE_IMAGES}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* 提示消息 */}
      {imgErrorTip && (
        <div className="text-[11px] text-amber-600 mb-1.5 px-1 animate-in fade-in">
          {imgErrorTip}
        </div>
      )}

      {/* 隐藏的 File Input 用于触发系统相机或相册选择 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 3. Bottom Sticky Single Line Input + Option A Camera Button + Send Button */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Option A: 相机/相册图标按钮置于输入框最左侧 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingImg || pendingImgs.length >= MAX_NOTE_IMAGES}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center border flex-shrink-0 ${
            pendingImgs.length > 0
              ? 'bg-blue-50 text-blue-600 border-blue-200'
              : 'bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border-gray-200/90'
          } ${pendingImgs.length >= MAX_NOTE_IMAGES ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
          title={
            pendingImgs.length >= MAX_NOTE_IMAGES
              ? '最多上传 4 张照片'
              : '添加照片/随手拍'
          }
        >
          {isProcessingImg ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
        </button>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              activeBranchParentId
                ? '输入分支子想法...'
                : activeQuoteRecordId
                ? '输入回应或引用想法...'
                : quickSelectedThreadId
                ? '此刻在想什么 (将关联选中思维线)...'
                : pendingImgs.length > 0
                ? '输入想法说明 (可选)...'
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
          disabled={!canSubmit}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center flex-shrink-0 ${
            canSubmit
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

