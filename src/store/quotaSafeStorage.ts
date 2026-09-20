import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';

/**
 * K9 修复：localStorage 单 key 容量兜底。
 *
 * 现状风险：`flow-01-storage-v3` 一个 key 存全部 records / tags / threads / deskRows，
 * 图片与语音均以 base64 字符串内嵌（RecordItem.imgs / RecordItem.audio.url）。
 * localStorage 通常只有 ~5MB 配额，图片多时 setItem 会抛 QuotaExceededError，
 * 而 zustand persist 的错误会被吞掉 —— 表现为「部分/全部数据静默丢失」。
 *
 * 兜底策略（逐级降级，优先保住结构化元数据）：
 *   1. 正常写入。
 *   2. QuotaExceeded → 剥离所有 records 的图片 base64（imgs 置空）后重试。
 *   3. 仍失败 → 再剥离语音 base64（audio 删除）后重试。
 *   4. 仍失败 → 放弃写入并上报，避免抛错打断应用。
 *
 * 被剥离的内容只存在于本次内存会话，后续可通过 R2 同步恢复（若已配置）。
 */

export interface QuotaStripReport {
  /** 本次持久化因配额被剥离图片的记录数 */
  strippedImages: number;
  /** 本次持久化因配额被剥离语音的记录数 */
  strippedAudio: number;
  /** 是否最终写入失败（数据未落盘） */
  failed: boolean;
}

let lastReport: QuotaStripReport = { strippedImages: 0, strippedAudio: 0, failed: false };
const listeners = new Set<(report: QuotaStripReport) => void>();

export function getLastQuotaReport(): QuotaStripReport {
  return lastReport;
}

export function subscribeQuotaReport(listener: (report: QuotaStripReport) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(report: QuotaStripReport) {
  lastReport = report;
  for (const listener of listeners) {
    try {
      listener(report);
    } catch {
      // ignore listener error
    }
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Safari / Chrome / Firefox 的命名不完全一致
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  );
}

interface PersistedShape {
  records?: Array<{
    imgs?: string[] | null;
    audio?: { url?: string } | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
/** 剥离图片后再剥离语音，返回是否真正改动了数据 */
function stripHeaviest(payload: PersistedShape, stage: 'images' | 'audio'): boolean {
  const records = payload.records;
  if (!Array.isArray(records)) return false;
  let changed = false;
  for (const record of records) {
    if (stage === 'images' && record.imgs && record.imgs.length) {
      record.imgs = [];
      changed = true;
    }
    if (stage === 'audio' && record.audio?.url) {
      // 置 null 而非 delete：保持 `audio?: AudioAttachment | null` 的显式空语义，
      // 避免下游对 record.audio 的存在性判断产生歧义。
      record.audio = null;
      changed = true;
    }
  }
  return changed;
}

export const quotaSafeStorage: PersistStorage<unknown> = (() => {
  const base = createJSONStorage(() => localStorage)!;

  const write = (
    baseSetItem: (name: string, value: StorageValue<unknown>) => void,
    name: string,
    value: StorageValue<unknown>
  ) => {
    try {
      baseSetItem(name, value);
      publish({ strippedImages: 0, strippedAudio: 0, failed: false });
      return;
    } catch (error) {
      if (!isQuotaError(error)) {
        publish({ strippedImages: 0, strippedAudio: 0, failed: true });
        console.error('[quotaSafeStorage] 持久化失败（非配额错误）：', error);
        return;
      }
    }

    // 降级链：先剥离图片，仍不足再剥离语音，最后放弃写入。
    const state = (value as { state?: PersistedShape }).state;
    if (state) {
      const imageCount = state.records?.filter((r) => r.imgs && r.imgs.length).length ?? 0;
      if (imageCount) {
        stripHeaviest(state, 'images');
        try {
          baseSetItem(name, value);
          console.warn(
            `[quotaSafeStorage] localStorage 配额不足，已剥离 ${imageCount} 条记录的图片以保住元数据。`
          );
          publish({ strippedImages: imageCount, strippedAudio: 0, failed: false });
          return;
        } catch (error) {
          if (!isQuotaError(error)) {
            publish({ strippedImages: 0, strippedAudio: 0, failed: true });
            return;
          }
        }
      }

      const audioCount = state.records?.filter((r) => r.audio?.url).length ?? 0;
      if (audioCount) {
        stripHeaviest(state, 'audio');
        try {
          baseSetItem(name, value);
          console.warn(
            `[quotaSafeStorage] 配额持续不足，进一步剥离 ${audioCount} 条记录的语音以保住元数据。`
          );
          publish({ strippedImages: imageCount, strippedAudio: audioCount, failed: false });
          return;
        } catch (error) {
          if (!isQuotaError(error)) {
            publish({ strippedImages: 0, strippedAudio: 0, failed: true });
            return;
          }
        }
      }
    }

    console.error('[quotaSafeStorage] localStorage 配额耗尽，持久化失败，本次改动未能落盘。');
    publish({ strippedImages: 0, strippedAudio: 0, failed: true });
  };

  return {
    getItem: (name) => base.getItem(name) as StorageValue<unknown> | null,
    setItem: (name, value) => {
      write((key, val) => base.setItem(key, val), name, value);
    },
    removeItem: (name) => base.removeItem(name),
  };
})();
