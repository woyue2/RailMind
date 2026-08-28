/** Audio recording utilities for RailMind voice memos. */

export interface RecordingResult {
  dataUrl: string;
  duration: number;
  blob: Blob;
  format: string;
}

export interface RecordingSession {
  start: () => Promise<void>;
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
  dispose: () => void;
}

let activeSession: RecordingSession | null = null;

export function formatAudioDuration(seconds: number): string {
  const safeSec = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSec / 60)}:${String(safeSec % 60).padStart(2, '0')}"`;
}

export function formatTimerSeconds(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSec / 60)).padStart(2, '0')}:${String(safeSec % 60).padStart(2, '0')}`;
}

function getSupportedMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  return typeof MediaRecorder === 'undefined' ? '' : types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function createRecordingSession(): RecordingSession {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let disposed = false;

  const cleanup = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
    chunks = [];
    if (activeSession === session) activeSession = null;
  };

  const session: RecordingSession = {
    async start() {
      if (disposed) throw new Error('录音会话已关闭');
      if (activeSession && activeSession !== session) throw new Error('已有录音正在进行，请先完成或取消当前录音');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器或环境不支持麦克风录音功能');

      activeSession = session;
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (disposed || activeSession !== session) {
          nextStream.getTracks().forEach((track) => track.stop());
          throw new Error('录音已取消');
        }
        stream = nextStream;
        chunks = [];
        startedAt = Date.now();
        recorder = new MediaRecorder(stream, getSupportedMimeType() ? { mimeType: getSupportedMimeType() } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.start(100);
      } catch (error: any) {
        cleanup();
        if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
          throw new Error('未获取到麦克风权限，请在设置中允许访问麦克风');
        }
        if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
          throw new Error('未检测到可用的麦克风输入设备');
        }
        throw error instanceof Error ? error : new Error('录音初始化失败');
      }
    },

    stop() {
      return new Promise((resolve, reject) => {
        if (activeSession !== session || !recorder || recorder.state === 'inactive') {
          reject(new Error('没有正在进行的录音'));
          return;
        }
        const activeRecorder = recorder;
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const mimeType = activeRecorder.mimeType || 'audio/webm';
        activeRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            cleanup();
            resolve({ dataUrl, duration, blob, format: mimeType.includes('mp4') ? 'audio/mp4' : 'audio/webm' });
          };
          reader.onerror = () => {
            cleanup();
            reject(new Error('录音文件读取转换失败'));
          };
          reader.readAsDataURL(blob);
        };
        activeRecorder.onerror = () => {
          cleanup();
          reject(new Error('录音过程出错'));
        };
        try { activeRecorder.stop(); } catch (error) { cleanup(); reject(error); }
      });
    },

    cancel() {
      if (activeSession !== session) return;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        try { recorder.stop(); } catch { /* ignore */ }
      }
      cleanup();
    },

    dispose() {
      disposed = true;
      session.cancel();
    },
  };

  return session;
}
