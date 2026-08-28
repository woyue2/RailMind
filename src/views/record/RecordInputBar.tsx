import React, { useState, useRef, useEffect } from 'react';
import { Send, X, GitBranch, Sparkles, Quote, Camera, Plus, Loader2, Mic, Check } from 'lucide-react';
import { useFlowStore } from '../../store/useFlowStore';
import { processImageFiles, MAX_NOTE_IMAGES } from '../../utils/imageUtils';
import { AudioAttachment } from '../../types';
import { createRecordingSession, formatTimerSeconds, RecordingSession } from '../../utils/audioUtils';
import { AudioPlayerPill } from '../../components/common/AudioPlayerPill';

const MAX_RECORDING_SECONDS = 60;

export const RecordInputBar: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [pendingImgs, setPendingImgs] = useState<string[]>([]);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [imgTip, setImgTip] = useState<{
    message: string;
    tone: 'info' | 'success' | 'warning';
  } | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<AudioAttachment | null>(null);
  const [audioErrorTip, setAudioErrorTip] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingSessionRef = useRef<RecordingSession | null>(null);

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

  // Recording timer countdown/countup
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) {
            handleStopRecording();
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  useEffect(() => () => {
    recordingSessionRef.current?.dispose();
  }, []);

  const handleStartRecording = async () => {
    setAudioErrorTip(null);
    try {
      const session = createRecordingSession();
      recordingSessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (err: any) {
      setAudioErrorTip(err.message || '无法访问麦克风');
      setTimeout(() => setAudioErrorTip(null), 3000);
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    setIsProcessingAudio(true);
    setIsRecording(false);
    try {
      const res = await recordingSessionRef.current?.stop();
      if (!res) throw new Error('没有正在进行的录音');
      setPendingAudio({
        url: res.dataUrl,
        duration: res.duration,
        format: res.format,
      });
    } catch (err: any) {
      setAudioErrorTip(err.message || '录音保存失败');
      setTimeout(() => setAudioErrorTip(null), 3000);
    } finally {
      recordingSessionRef.current = null;
      setIsProcessingAudio(false);
    }
  };

  const handleCancelRecording = () => {
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    setIsRecording(false);
  };

  const handleRemovePendingAudio = () => {
    setPendingAudio(null);
  };

  const showImageTip = (message: string, tone: 'success' | 'warning') => {
    setImgTip({ message, tone });
    setTimeout(() => setImgTip(null), 3500);
  };

  // Handle image file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      // Android WebView 下 display:none 文件框选择后可能返回空，此时仍给出反馈
      showImageTip('未读取到所选图片，请重试', 'warning');
      return;
    }

    setIsProcessingImg(true);
    setImgTip({ message: `正在处理 ${files.length} 张图片…`, tone: 'info' });
    try {
      const { compressed, error } = await processImageFiles(files, pendingImgs.length);
      if (compressed.length > 0) {
        setPendingImgs((prev) => [...prev, ...compressed].slice(0, MAX_NOTE_IMAGES));
        showImageTip(
          error
            ? `已添加 ${compressed.length} 张图片；${error}`
            : `已添加 ${compressed.length} 张图片，点击发送即可保存`,
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
    const hasAudio = !!pendingAudio;
    if (!hasText && !hasImgs && !hasAudio) return;

    addRecord(inputText, {
      parent_id: activeBranchParentId,
      thread_id: quickSelectedThreadId,
      quote_id: activeQuoteRecordId,
      imgs: hasImgs ? pendingImgs : undefined,
      audio: pendingAudio || undefined,
    });

    setInputText('');
    setPendingImgs([]);
    setPendingAudio(null);
  };

  const canSubmit =
    (!!inputText.trim() || pendingImgs.length > 0 || !!pendingAudio) &&
    !isProcessingImg &&
    !isProcessingAudio &&
    !isRecording;

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

      {/* 2.4 待发送语音条 (Pending Audio Preview Pill) */}
      {pendingAudio && (
        <div className="flex items-center gap-2 mb-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <AudioPlayerPill audio={pendingAudio} onRemove={handleRemovePendingAudio} />
          <span className="text-[11px] text-gray-400">已录制语音便签</span>
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

      {/* 图片处理与录音提示 */}
      {(imgTip || audioErrorTip) && (
        <div
          className={`text-[11px] mb-1.5 px-1 animate-in fade-in ${
            audioErrorTip || imgTip?.tone === 'warning'
              ? 'text-amber-600'
              : imgTip?.tone === 'success'
                ? 'text-emerald-600'
                : 'text-sky-600'
          }`}
        >
          {audioErrorTip || imgTip?.message}
        </div>
      )}

      {/* 隐藏的 File Input 用于触发系统相机或相册选择 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        // 用离屏定位代替 display:none，规避 Android WebView 对隐藏文件框选择结果丢失的问题
        className="fixed opacity-0 w-px h-px -left-[9999px]"
        onChange={handleFileChange}
      />

      {/* 3. Recording cabin (录音中控制仓) OR Normal Input Bar */}
      {isRecording ? (
        <div className="flex items-center justify-between gap-3 bg-red-50/90 border border-red-200/90 rounded-2xl px-3.5 py-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <div className="font-mono text-xs font-semibold text-red-600">
              {formatTimerSeconds(recordSeconds)}
              <span className="text-gray-400 font-normal ml-1">/ 01:00</span>
            </div>
          </div>

          {/* Animated waveform bars */}
          <div className="flex items-center gap-1 h-3 flex-1 justify-center max-w-[120px]">
            {[...Array(7)].map((_, i) => (
              <span
                key={i}
                className="w-1 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${Math.sin(i * 0.9) * 8 + 8}px`,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCancelRecording}
              className="p-1.5 rounded-xl bg-white text-gray-500 hover:text-gray-800 border border-gray-200 text-xs shadow-2xs transition-colors"
              title="取消录音"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleStopRecording}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-medium shadow-2xs flex items-center gap-1 transition-all"
              title="完成录音"
            >
              <Check className="w-3.5 h-3.5" />
              <span>完成</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          {/* 相机/相册图标按钮置于输入框最左侧 */}
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

          {/* 麦克风录音按钮 */}
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={isProcessingAudio || !!pendingAudio}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center border flex-shrink-0 ${
              pendingAudio
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 border-gray-200/90'
            } active:scale-95`}
            title={pendingAudio ? '已录制语音' : '点击开始语音录音'}
          >
            {isProcessingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
              <Mic className="w-4 h-4" />
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
                  : pendingAudio
                  ? '输入语音文字说明 (可选)...'
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
      )}
    </div>
  );
};

