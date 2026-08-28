import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, X, Check, Loader2 } from 'lucide-react';
import { createRecordingSession, formatTimerSeconds, RecordingSession } from '../../utils/audioUtils';
import { AudioAttachment } from '../../types';
import { AudioPlayerPill } from '../common/AudioPlayerPill';

interface AudioRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAudio: (audio: AudioAttachment | null) => void;
  initialAudio?: AudioAttachment | null;
}

const MAX_RECORDING_SECONDS = 60;

export const AudioRecorderModal: React.FC<AudioRecorderModalProps> = ({
  isOpen,
  onClose,
  onSaveAudio,
  initialAudio = null,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioDraft, setAudioDraft] = useState<AudioAttachment | null>(initialAudio);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const recordingSessionRef = useRef<RecordingSession | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAudioDraft(initialAudio);
      setErrorMsg(null);
      setIsRecording(false);
      setIsProcessing(false);
      setRecordSeconds(0);
    } else {
      recordingSessionRef.current?.cancel();
      recordingSessionRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen, initialAudio]);

  // Handle timer
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

  if (!isOpen) return null;

  const handleStartRecording = async () => {
    setErrorMsg(null);
    try {
      const session = createRecordingSession();
      recordingSessionRef.current = session;
      await session.start();
      setIsRecording(true);
    } catch (err: any) {
      setErrorMsg(err.message || '无法启动录音');
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    setIsProcessing(true);
    setIsRecording(false);
    try {
      const res = await recordingSessionRef.current?.stop();
      if (!res) throw new Error('没有正在进行的录音');
      setAudioDraft({
        url: res.dataUrl,
        duration: res.duration,
        format: res.format,
      });
    } catch (err: any) {
      setErrorMsg(err.message || '录音保存失败');
    } finally {
      recordingSessionRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    setIsRecording(false);
    onClose();
  };

  const handleSave = () => {
    onSaveAudio(audioDraft);
    onClose();
  };

  const handleDeleteExisting = () => {
    setAudioDraft(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-gray-100 flex flex-col items-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-gray-900">语音便签</span>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error prompt */}
        {errorMsg && (
          <div className="w-full mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100">
            {errorMsg}
          </div>
        )}

        {/* Middle State Area */}
        <div className="w-full py-4 flex flex-col items-center justify-center">
          {isRecording ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <div className="relative w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
                  <Square className="w-6 h-6 fill-white" />
                </div>
              </div>

              {/* Timer & animated waveforms */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1 font-mono text-base font-semibold text-red-600">
                  <span>{formatTimerSeconds(recordSeconds)}</span>
                  <span className="text-xs text-gray-400">/ 01:00</span>
                </div>

                <div className="flex items-center gap-1 h-4">
                  {[...Array(9)].map((_, i) => (
                    <span
                      key={i}
                      className="w-1 bg-red-400 rounded-full animate-pulse"
                      style={{
                        height: `${Math.sin(i * 0.8) * 8 + 10}px`,
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStopRecording}
                className="mt-2 px-4 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
              >
                完成录制
              </button>
            </div>
          ) : audioDraft ? (
            <div className="flex flex-col items-center gap-3">
              <AudioPlayerPill audio={audioDraft} onRemove={handleDeleteExisting} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={isProcessing}
                  className="text-xs text-blue-600 hover:text-blue-700 underline font-medium"
                >
                  重新录制
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={isProcessing}
                className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center shadow-lg transition-all"
              >
                {isProcessing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>
              <span className="text-xs text-gray-500 font-normal">点击开始录音 (最长 60 秒)</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="w-full flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 rounded-xl text-xs text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isRecording || isProcessing}
            className="px-4 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-medium hover:bg-black active:scale-95 transition-all flex items-center gap-1 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>保存</span>
          </button>
        </div>
      </div>
    </div>
  );
};
