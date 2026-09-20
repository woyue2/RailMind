import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  getLastQuotaReport,
  subscribeQuotaReport,
  type QuotaStripReport,
} from '../../store/quotaSafeStorage';

/**
 * K9 配套：把 localStorage 配额降级从「静默 console.warn」提升为用户可见提示。
 *
 * 触发场景：records 内嵌图片/语音 base64 撑爆 ~5MB 配额时，
 * quotaSafeStorage 会剥离附件以保住结构化元数据。若用户不知情，
 * 会表现为「图片莫名消失」。这里显式告知丢失范围与恢复途径。
 */
export const StorageQuotaNotice = () => {
  const [report, setReport] = useState<QuotaStripReport>(() => getLastQuotaReport());
  const [dismissed, setDismissed] = useState(false);

  useEffect(
    () =>
      subscribeQuotaReport((next) => {
        setReport(next);
        // 新的配额事件意味着「又有一批附件没能保存」，重新给出提示。
        setDismissed(false);
      }),
    []
  );

  const strippedTotal = report.strippedImages + report.strippedAudio;
  const visible = !dismissed && (strippedTotal > 0 || report.failed);

  if (!visible) return null;

  const parts: string[] = [];
  if (report.strippedImages > 0) parts.push(`${report.strippedImages} 张图片`);
  if (report.strippedAudio > 0) parts.push(`${report.strippedAudio} 段语音`);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {report.failed ? '本地存储空间不足，本次改动未能保存' : '本地存储空间不足，已移除部分附件'}
          </p>
          <p className="mt-1 leading-relaxed">
            {report.failed
              ? '请清理部分带图片或语音的记录后重试，否则最近的修改可能会丢失。'
              : `为保住文字与结构，${parts.join('、')}未能保存到本机。若已配置云端同步，可从云端恢复。`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100"
          aria-label="关闭提示"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
