import { RecordItem, TagItem, ThreadItem, HomeLink, DeskEdgeRow } from '../types';

export interface R2Config {
  enabled: boolean;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string;
  region?: string;
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  errors: string[];
}

export interface SyncTombstone {
  entityType: 'record' | 'thread' | 'tag' | 'desk';
  entityId: string;
  deletedAt: string;
}

export type SyncStage =
  | 'idle'
  | 'tombstones'
  | 'records'
  | 'threads'
  | 'tags'
  | 'desks'
  | 'settings'
  | 'done'
  | 'error';

export interface SyncProgressStatus {
  stage: SyncStage;
  message: string;
  current: number;
  total: number;
}

export interface SyncOptions {
  manual?: boolean;
  onProgress?: (status: SyncProgressStatus) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RemoteListItem {
  key: string;
  lastModified: Date;
}

export interface R2ClientLike {
  putJson(key: string, data: unknown, signal?: AbortSignal): Promise<void>;
  getJson<T>(key: string, signal?: AbortSignal): Promise<T | undefined>;
  list(prefix: string, signal?: AbortSignal): Promise<RemoteListItem[]>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
  testConnection(signal?: AbortSignal): Promise<{ ok: boolean; message: string }>;
}

export interface FlowRepositoryLike {
  getRecords(): RecordItem[];
  getRecord(id: string): RecordItem | undefined;
  saveRecord(record: RecordItem): void;
  deleteRecord(id: string): boolean;

  getThreads(): ThreadItem[];
  getThread(id: string): ThreadItem | undefined;
  saveThread(thread: ThreadItem): void;
  deleteThread(id: string): boolean;

  getTags(): TagItem[];
  getTag(id: string): TagItem | undefined;
  saveTag(tag: TagItem): void;
  deleteTag(id: string): boolean;

  getDeskRows(): DeskEdgeRow[];
  getDeskRow(id: string): DeskEdgeRow | undefined;
  saveDeskRow(row: DeskEdgeRow): void;
  deleteDeskRow(id: string): boolean;

  /** 選填：批次寫回。每筆 saveX 都會觸發一次全量持久化，同步拉取時應走批次。 */
  saveRecords?(records: RecordItem[]): void;
  saveThreads?(threads: ThreadItem[]): void;
  saveTags?(tags: TagItem[]): void;
  saveDeskRows?(rows: DeskEdgeRow[]): void;

  getHomeLink(): HomeLink | null;
  saveHomeLink(link: HomeLink | null): void;

  getTombstones(): SyncTombstone[];
  saveTombstone(tombstone: SyncTombstone): void;
  removeTombstones(entityType: SyncTombstone['entityType'], entityIds: string[]): void;
}
