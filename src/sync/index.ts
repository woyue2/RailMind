import { useFlowStore } from '../store/useFlowStore';
import { R2Client } from './r2-client';
import { R2SyncService } from './r2-sync';
import { FlowRepositoryLike, SyncTombstone, SyncReport } from './types';
import { isR2Configured, loadR2Settings, loadTombstones, saveTombstoneRecord } from './credentials';
import { RecordItem, TagItem, ThreadItem } from '../types';

let inMemoryTombstones: SyncTombstone[] = loadTombstones();

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

  getTombstones: () => inMemoryTombstones,
  saveTombstone: (tombstone: SyncTombstone) => {
    inMemoryTombstones = inMemoryTombstones.filter(
      (t) => !(t.entityType === tombstone.entityType && t.entityId === tombstone.entityId)
    );
    inMemoryTombstones.push(tombstone);
    saveTombstoneRecord(tombstone);
  },
};

export function createR2SyncService(): R2SyncService | null {
  if (!isR2Configured()) return null;
  const config = loadR2Settings();
  try {
    const client = new R2Client(config);
    return new R2SyncService(client, flowRepository);
  } catch {
    return null;
  }
}

export async function triggerR2Sync(): Promise<SyncReport | null> {
  const syncService = createR2SyncService();
  if (!syncService) return null;
  return syncService.sync();
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
