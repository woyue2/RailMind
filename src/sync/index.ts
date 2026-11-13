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
import { isR2ConfigUsable, loadR2Settings, loadTombstones, saveTombstoneRecord, removeTombstoneRecords } from './credentials';
import { RecordItem, TagItem, ThreadItem, HomeLink, DeskEdgeRow } from '../types';

let inMemoryTombstones: SyncTombstone[] = loadTombstones();
let cachedSyncService: R2SyncService | null = null;
let cachedSyncConfigKey = '';

/** 同 id 覆蓋、新 id 追加；一次 merge 取代逐筆 setState + 全量持久化。 */
function mergeById<T extends { id: string }>(current: T[], incoming: T[], prepend = false): T[] {
  if (!incoming.length) return current;
  const byId = new Map(incoming.map((item) => [item.id, item]));
  const existingIds = new Set(current.map((item) => item.id));
  const merged = current.map((item) => byId.get(item.id) ?? item);
  const added = incoming.filter((item) => !existingIds.has(item.id));
  return prepend ? [...added, ...merged] : [...merged, ...added];
}

export const flowRepository: FlowRepositoryLike = {
  getRecords: () => useFlowStore.getState().records,
  getRecord: (id: string) => useFlowStore.getState().records.find((r) => r.id === id),
  saveRecord: (record: RecordItem) =>
    useFlowStore.setState((state) => ({ records: mergeById(state.records, [record]) })),
  saveRecords: (records: RecordItem[]) =>
    useFlowStore.setState((state) => ({ records: mergeById(state.records, records) })),
  deleteRecord: (id: string) => {
    const prev = useFlowStore.getState().records;
    useFlowStore.setState((state) => ({
      records: state.records.filter((r) => r.id !== id && r.parent_id !== id),
    }));
    return prev.length !== useFlowStore.getState().records.length;
  },

  getThreads: () => useFlowStore.getState().threads,
  getThread: (id: string) => useFlowStore.getState().threads.find((t) => t.id === id),
  saveThread: (thread: ThreadItem) =>
    useFlowStore.setState((state) => ({ threads: mergeById(state.threads, [thread], true) })),
  saveThreads: (threads: ThreadItem[]) =>
    useFlowStore.setState((state) => ({ threads: mergeById(state.threads, threads, true) })),
  deleteThread: (id: string) => {
    const prev = useFlowStore.getState().threads;
    useFlowStore.setState((state) => ({
      threads: state.threads.filter((t) => t.id !== id),
    }));
    return prev.length !== useFlowStore.getState().threads.length;
  },

  getTags: () => useFlowStore.getState().tags,
  getTag: (id: string) => useFlowStore.getState().tags.find((t) => t.id === id),
  saveTag: (tag: TagItem) =>
    useFlowStore.setState((state) => ({ tags: mergeById(state.tags, [tag]) })),
  saveTags: (tags: TagItem[]) =>
    useFlowStore.setState((state) => ({ tags: mergeById(state.tags, tags) })),
  deleteTag: (id: string) => {
    const prev = useFlowStore.getState().tags;
    useFlowStore.setState((state) => ({
      tags: state.tags.filter((t) => t.id !== id),
    }));
    return prev.length !== useFlowStore.getState().tags.length;
  },

  getDeskRows: () => useFlowStore.getState().deskRows,
  getDeskRow: (id: string) => useFlowStore.getState().deskRows.find((row) => row.id === id),
  saveDeskRow: (row: DeskEdgeRow) =>
    useFlowStore.setState((state) => ({ deskRows: mergeById(state.deskRows, [row]) })),
  saveDeskRows: (rows: DeskEdgeRow[]) =>
    useFlowStore.setState((state) => ({ deskRows: mergeById(state.deskRows, rows) })),
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
  removeTombstones: (entityType: SyncTombstone['entityType'], entityIds: string[]) => {
    if (!entityIds.length) return;
    const removing = new Set(entityIds);
    inMemoryTombstones = inMemoryTombstones.filter(
      (t) => !(t.entityType === entityType && removing.has(t.entityId))
    );
    removeTombstoneRecords(entityType, entityIds);
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

/** 远端元数据缓存的分区键；不含密钥，仅用于配置切换时失效旧缓存。 */
function r2MetaNamespace(config: R2Config): string {
  return [config.accountId, config.bucketName, config.endpoint ?? '', config.region ?? ''].join('|');
}

export function createR2SyncService(): R2SyncService | null {
  const config = loadR2Settings();
  if (!isR2ConfigUsable(config)) {
    cachedSyncService = null;
    cachedSyncConfigKey = '';
    return null;
  }
  const configKey = r2SyncConfigKey(config);
  if (cachedSyncService && cachedSyncConfigKey === configKey) {
    return cachedSyncService;
  }
  try {
    const client = new R2Client(config);
    cachedSyncService = new R2SyncService(client, flowRepository, r2MetaNamespace(config));
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
  const config = loadR2Settings();
  if (!isR2ConfigUsable(config)) {
    return {
      ok: false,
      message: '请先完整配置同步：Account ID／Access Key／Secret／Bucket',
    };
  }
  try {
    const client = new R2Client(config);
    return client.testConnection();
  } catch (error) {
    return { ok: false, message: `配置解析错误：${error instanceof Error ? error.message : String(error)}` };
  }
}
