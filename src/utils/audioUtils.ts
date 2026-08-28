/**
 * Audio Recording and Utility Functions for RailMind Voice Memos
 */

export interface RecordingResult {
  dataUrl: string;
  duration: number; // in seconds
  blob: Blob;
  format: string;
}

let activeMediaStream: MediaStream | null = null;
let activeMediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingStartTime = 0;

/**
 * Format seconds into readable timestamp e.g. 0:15" or 1:04"
 */
export function formatAudioDuration(seconds: number): string {
  const safeSec = Math.max(0, Math.round(seconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}"`;
}

/**
 * Format seconds into mm:ss format for recording timer e.g. 00:08
 */
export function formatTimerSeconds(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Detect supported audio MIME type for MediaRecorder
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/**
 * Start native audio recording via getUserMedia & MediaRecorder
 */
export async function startRecording(): Promise<void> {
  // Clean up any existing recorder / stream first
  cancelRecording();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('当前浏览器或环境不支持麦克风录音功能');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    activeMediaStream = stream;
    recordedChunks = [];
    recordingStartTime = Date.now();

    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : undefined;

    const recorder = new MediaRecorder(stream, options);
    activeMediaRecorder = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.start(100); // collect 100ms chunks
  } catch (err: any) {
    cancelRecording();
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('未获取到麦克风权限，请在设置中允许访问麦克风');
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new Error('未检测到可用的麦克风输入设备');
    }
    throw new Error(`录音初始化失败: ${err.message || err}`);
  }
}

/**
 * Stop active recording and return Base64 Data URL, duration, and blob
 */
export function stopRecording(): Promise<RecordingResult> {
  return new Promise((resolve, reject) => {
    if (!activeMediaRecorder || activeMediaRecorder.state === 'inactive') {
      reject(new Error('没有正在进行的录音'));
      return;
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));
    const mimeType = activeMediaRecorder.mimeType || 'audio/webm';

    activeMediaRecorder.onstop = () => {
      try {
        const audioBlob = new Blob(recordedChunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve({
            dataUrl,
            duration: durationSeconds,
            blob: audioBlob,
            format: mimeType.includes('mp4') ? 'audio/mp4' : 'audio/webm',
          });
        };
        reader.onerror = () => {
          reject(new Error('录音文件读取转换失败'));
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        reject(err);
      } finally {
        cleanupTracks();
      }
    };

    activeMediaRecorder.onerror = (e: any) => {
      cleanupTracks();
      reject(new Error(`录音过程出错: ${e.error || '未知错误'}`));
    };

    try {
      activeMediaRecorder.stop();
    } catch (err) {
      cleanupTracks();
      reject(err);
    }
  });
}

/**
 * Cancel and discard current active recording
 */
export function cancelRecording(): void {
  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    try {
      activeMediaRecorder.stop();
    } catch {
      // ignore
    }
  }
  cleanupTracks();
}

/**
 * Internal cleanup for active tracks and recorder instances
 */
function cleanupTracks(): void {
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach((track) => track.stop());
    activeMediaStream = null;
  }
  activeMediaRecorder = null;
  recordedChunks = [];
}
