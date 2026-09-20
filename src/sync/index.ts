import { useFlowStore } from '../store/useFlowStore';
import { R2Client } from './r2-client';
import { R2SyncService } from './r2-sync';
import {
  FlowRepositoryLike,
  SyncTombstone,
  SyncReport,
  SyncOptions,
  SyncProgressStatus,
  R2Config,
} from './types';
import { isR2Configured, loadR2Settings, loadTombstones, saveTombstoneRecord } from './credentials';
import { RecordItem, TagItem, ThreadItem, HomeLink, DeskEdgeRow } from '../types';

let inMemoryTombstones: SyncTombstone[] = loadTombstones();
let cachedSyncService: R2SyncService | null = null;
let cachedSyncConfigKey = '';

export const flowRepository: FlowRepositoryLike = {
  getRecords: () => useFlowStore.getState().records,
  getRecord: (id: string) => useFlowStore.getState().records.find((r) => r.id === id),
  saveRecord: (record: RecordItem) => {
    useFlowStore.setState((state) => {
      const exists = state.records.some((r) => r.id === record.id);
      return {
        records: exists
          ? state.records.map((r) => (r.id === record.id ? record : r))
          : [...state.records, record],
      };
    });
  },
  deleteRecord: (id: string) => {
    const prev = useFlowStore.getState().records;
    useFlowStore.setState((state) => ({
      records: state.records.filter((r) => r.id !== id && r.parent_id !== id),
    }));
    return prev.length !== useFlowStore.getState().records.length;
  },

  getThreads: () => useFlowStore.getState().threads,
  getThread: (id: string) => useFlowStore.getState().threads.find((t) => t.id === id),
  saveThread: (thread: ThreadItem) => {
    useFlowStore.setState((state) => {
      const exists = state.threads.some((t) => t.id === thread.id);
      return {
        threads: exists
          ? state.threads.map((t) => (t.id === thread.id ? thread : t))
          : [thread, ...state.threads],
      };
    });
  },
  deleteThread: (id: string) => {
    const prev = useFlowStore.getState().threads;
    useFlowStore.setState((state) => ({
      threads: state.threads.filter((t) => t.id !== id),
    }));
    return prev.length !== useFlowStore.getState().threads.length;
  },

  getTags: () => useFlowStore.getState().tags,
  getTag: (id: string) => useFlowStore.getState().tags.find((t) => t.id === id),
  saveTag: (tag: TagItem) => {
    useFlowStore.setState((state) => {
      const exists = state.tags.some((t) => t.id === tag.id);
      return {
        tags: exists
          ? state.tags.map((t) => (t.id === tag.id ? tag : t))
          : [...state.tags, tag],
      };
    });
  },
  deleteTag: (id: string) => {
    const prev = useFlowStore.getState().tags;
    useFlowStore.setState((state) => ({
      tags: state.tags.filter((t) => t.id !== id),
    }));
    return prev.length !== useFlowStore.getState().tags.length;
  },

  getDeskRows: () => useFlowStore.getState().deskRows,
  getDeskRow: (id: string) => useFlowStore.getState().deskRows.find((row) => row.id === id),
  saveDeskRow: (row: DeskEdgeRow) => {
    useFlowStore.setState((state) => {
      const exists = state.deskRows.some((r) => r.id === row.id);
      return {
        deskRows: exists
          ? state.deskRows.map((r) => (r.id === row.id ? row : r))
          : [...state.deskRows, row],
      };
    });
  },
  deleteDeskRow: (id: string) => {
    const prev = useFlowStore.getState().deskRows;
    useFlowStore.setState((state) => ({
      deskRows: state.deskRows.filter((row) => row.id !== id),
    }));
    return prev.length !== useFlowStore.getState().deskRows.length;
  },

  getHomeLink: () => useFlowStore.getState().homeLink,
  saveHomeLink: (link: HomeLink | null) => useFlowStore.setState({ homeLink: link }),

  getTombstones: () => inMemoryTombstones,
  saveTombstone: (tombstone: SyncTombstone) => {
    inMemoryTombstones = inMemoryTombstones.filter(
      (t) => !(t.entityType === tombstone.entityType && t.entityId === tombstone.entityId)
    );
    inMemoryTombstones.push(tombstone);
    saveTombstoneRecord(tombstone);
  },
};

function r2SyncConfigKey(config: R2Config): string {
  return JSON.stringify([
    config.accountId,
    config.accessKeyId,
    config.secretAccessKey,
    config.bucketName,
    config.endpoint,
    config.region,
  ]);
}

export function createR2SyncService(): R2SyncService | null {
  if (!isR2Configured()) {
    cachedSyncService = null;
    cachedSyncConfigKey = '';
    return null;
  }
  const config = loadR2Settings();
  const configKey = r2SyncConfigKey(config);
  if (cachedSyncService && cachedSyncConfigKey === configKey) {
    return cachedSyncService;
  }
  try {
    const client = new R2Client(config);
    cachedSyncService = new R2SyncService(client, flowRepository);
    cachedSyncConfigKey = configKey;
    return cachedSyncService;
  } catch {
    cachedSyncService = null;
    cachedSyncConfigKey = '';
    return null;
  }
}

/**
 * 判断本地是否为空数据（用于冷启动差异化体验）：
 * 当本地记录、思维线、标签均为空时，视为初次安装或新设备冷启动。
 */
export function isLocalEmpty(): boolean {
  const state = useFlowStore.getState();
  return (
    (!state.records || state.records.length === 0) &&
    (!state.threads || state.threads.length === 0) &&
    (!state.tags || state.tags.length === 0) &&
    (!state.deskRows || state.deskRows.length === 0)
  );
}

export type SyncProgressSubscriber = (status: SyncProgressStatus | null, showOverlay: boolean) => void;
const syncSubscribers = new Set<SyncProgressSubscriber>();

export function subscribeSyncProgress(subscriber: SyncProgressSubscriber): () => void {
  syncSubscribers.add(subscriber);
  return () => {
    syncSubscribers.delete(subscriber);
  };
}

function notifySyncProgress(status: SyncProgressStatus | null, showOverlay: boolean) {
  for (const sub of syncSubscribers) {
    try {
      sub(status, showOverlay);
    } catch {
      // ignore
    }
  }
}

let externalErrorTimer: ReturnType<typeof setTimeout> | null = null;

export function reportR2SyncFailure(error: unknown): void {
  if (externalErrorTimer) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  notifySyncProgress(
    {
      stage: 'error',
      message: `同步失败：${message}`,
      current: 0,
      total: 0,
    },
    true
  );
  externalErrorTimer = setTimeout(() => {
    notifySyncProgress(null, false);
    externalErrorTimer = null;
  }, 5000);
}

export async function triggerR2Sync(options: SyncOptions = {}): Promise<SyncReport | null> {
  const syncService = createR2SyncService();
  if (!syncService) return null;

  // 门控逻辑：仅在初次冷启动新设备（本地为空）或用户主动手动点击时展示全屏毛玻璃遮罩；日常自动同步静默运行
  const showOverlay = Boolean(isLocalEmpty() || options.manual);
  if (showOverlay) {
    notifySyncProgress(
      {
        stage: 'idle',
        message: isLocalEmpty() ? '检测到新设备，正在初始化拉取云端数据...' : '正在准备同步...',
        current: 0,
        total: 1,
      },
      true
    );
  }

  try {
    const report = await syncService.sync({
      ...options,
      timeoutMs: 60_000,
      onProgress: (status) => {
        options.onProgress?.(status);
        if (showOverlay) {
          notifySyncProgress(status, true);
        }
      },
    });
    if (report.errors.length && options.manual) {
      reportR2SyncFailure(new Error(report.errors[0]));
    }
    return report;
  } catch (error) {
    reportR2SyncFailure(error);
    throw error;
  } finally {
    if (showOverlay) {
      setTimeout(() => {
        notifySyncProgress(null, false);
      }, 750);
    }
  }
}

export async function testR2Connection(): Promise<{ ok: boolean; message: string }> {
  if (!isR2Configured()) {
    return { ok: false, message: '请先完整配置 Account ID / Access Key / Secret Key / Bucket Name' };
  }
  const config = loadR2Settings();
  try {
    const client = new R2Client(config);
    return client.testConnection();
  } catch (error) {
    return { ok: false, message: `配置解析错误：${error instanceof Error ? error.message : String(error)}` };
  }
}
