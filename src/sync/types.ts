import { RecordItem, TagItem, ThreadItem } from '../types';

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
  entityType: 'record' | 'thread' | 'tag';
  entityId: string;
  deletedAt: string;
}

export interface R2ClientLike {
  putJson(key: string, data: unknown): Promise<void>;
  getJson<T>(key: string): Promise<T | undefined>;
  list(prefix: string): Promise<Array<{ key: string; lastModified: Date }>>;
  delete(key: string): Promise<void>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
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

  getTombstones(): SyncTombstone[];
  saveTombstone(tombstone: SyncTombstone): void;
}
