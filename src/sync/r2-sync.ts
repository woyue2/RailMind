import { RecordItem, TagItem, ThreadItem } from '../types';
import {
  R2ClientLike,
  SyncReport,
  SyncTombstone,
  FlowRepositoryLike,
} from './types';
import { saveTombstoneRecord } from './credentials';

const SYNC_CONCURRENCY = 4;
let operationQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

async function mapWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) await worker(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SYNC_CONCURRENCY, items.length) }, () => run())
  );
}

export class R2SyncService {
  constructor(
    private readonly client: R2ClientLike,
    private readonly repository: FlowRepositoryLike
  ) {}

  pushRecord(record: RecordItem): Promise<void> {
    const id = record.id;
    return enqueue(async () => {
      const current = this.repository.getRecord(id);
      if (current && !this.isDeleted('record', id)) {
        await this.client.putJson(`records/${id}.json`, current);
      }
    });
  }

  pushThread(thread: ThreadItem): Promise<void> {
    const id = thread.id;
    return enqueue(async () => {
      const current = this.repository.getThread(id);
      if (current && !this.isDeleted('thread', id)) {
        await this.client.putJson(`threads/${id}.json`, current);
      }
    });
  }

  pushTag(tag: TagItem): Promise<void> {
    const id = tag.id;
    return enqueue(async () => {
      const current = this.repository.getTag(id);
      if (current && !this.isDeleted('tag', id)) {
        await this.client.putJson(`tags/${id}.json`, current);
      }
    });
  }

  deleteRecord(id: string): Promise<void> {
    return enqueue(() => this.deleteEntity('record', id));
  }

  deleteThread(id: string): Promise<void> {
    return enqueue(() => this.deleteEntity('thread', id));
  }

  deleteTag(id: string): Promise<void> {
    return enqueue(() => this.deleteEntity('tag', id));
  }

  sync(): Promise<SyncReport> {
    return enqueue(() => this.runSync());
  }

  private isDeleted(entityType: SyncTombstone['entityType'], entityId: string): boolean {
    return this.repository.getTombstones().some(
      (item) => item.entityType === entityType && item.entityId === entityId
    );
  }

  private tombstoneFor(
    entityType: SyncTombstone['entityType'],
    entityId: string
  ): SyncTombstone {
    const existing = this.repository
      .getTombstones()
      .find((item) => item.entityType === entityType && item.entityId === entityId);
    const tombstone = existing ?? {
      entityType,
      entityId,
      deletedAt: new Date().toISOString(),
    };
    this.repository.saveTombstone(tombstone);
    saveTombstoneRecord(tombstone);
    return tombstone;
  }

  private async deleteEntity(
    entityType: SyncTombstone['entityType'],
    id: string
  ): Promise<void> {
    const tombstone = this.tombstoneFor(entityType, id);
    const prefix =
      entityType === 'record' ? 'records' : entityType === 'thread' ? 'threads' : 'tags';
    await this.client.putJson(`tombstones/${entityType}/${id}.json`, tombstone);
    await this.client.delete(`${prefix}/${id}.json`);
  }

  private async runSync(): Promise<SyncReport> {
    const report: SyncReport = { pulled: 0, pushed: 0, errors: [] };
    try {
      // 1. 同步墓碑
      await this.syncTombstones(report);

      // 2. 同步 Records
      await this.syncEntities<RecordItem>(
        'record',
        'records/',
        () => this.repository.getRecords(),
        (id) => this.repository.getRecord(id),
        (item) => this.repository.saveRecord(item),
        (item) => item.created_at,
        report
      );

      // 3. 同步 Threads
      await this.syncEntities<ThreadItem>(
        'thread',
        'threads/',
        () => this.repository.getThreads(),
        (id) => this.repository.getThread(id),
        (item) => this.repository.saveThread(item),
        (item) => item.last_used_at || item.created_at,
        report
      );

      // 4. 同步 Tags
      await this.syncEntities<TagItem>(
        'tag',
        'tags/',
        () => this.repository.getTags(),
        (id) => this.repository.getTag(id),
        (item) => this.repository.saveTag(item),
        () => '1970-01-01T00:00:00.000Z',
        report
      );
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
    }
    return report;
  }

  private async syncTombstones(report: SyncReport): Promise<void> {
    // 上传本地墓碑
    for (const tombstone of this.repository.getTombstones()) {
      await this.client
        .putJson(`tombstones/${tombstone.entityType}/${tombstone.entityId}.json`, tombstone)
        .catch(() => undefined);
    }

    // 拉取远端墓碑
    for (const item of await this.client.list('tombstones/')) {
      if (!/^tombstones\/(record|thread|tag)\/[^/]+\.json$/.test(item.key)) continue;
      const tombstone = await this.client.getJson<SyncTombstone>(item.key);
      if (!tombstone) continue;
      this.repository.saveTombstone(tombstone);
      saveTombstoneRecord(tombstone);

      let removed = false;
      if (tombstone.entityType === 'record') {
        removed = this.repository.deleteRecord(tombstone.entityId);
      } else if (tombstone.entityType === 'thread') {
        removed = this.repository.deleteThread(tombstone.entityId);
      } else if (tombstone.entityType === 'tag') {
        removed = this.repository.deleteTag(tombstone.entityId);
      }

      if (removed) report.pulled++;

      const prefix =
        tombstone.entityType === 'record'
          ? 'records'
          : tombstone.entityType === 'thread'
          ? 'threads'
          : 'tags';
      await this.client.delete(`${prefix}/${tombstone.entityId}.json`).catch(() => undefined);
    }
  }

  private async syncEntities<T extends { id: string }>(
    entityType: SyncTombstone['entityType'],
    prefix: string,
    listLocal: () => T[],
    findLocal: (id: string) => T | undefined,
    saveLocal: (item: T) => void,
    getTimeStamp: (item: T) => string,
    report: SyncReport
  ): Promise<void> {
    const [remoteList, locals] = await Promise.all([
      this.client.list(prefix),
      Promise.resolve(listLocal()),
    ]);
    const localMap = new Map(locals.map((item) => [item.id, item]));
    const remoteMap = new Map(
      remoteList
        .filter((item) => item.key.endsWith('.json'))
        .map((item) => [item.key.slice(prefix.length, -5), item])
    );

    // 拉取远端新增或更新的对象
    await mapWithConcurrency([...remoteMap], async ([id, remoteItem]) => {
      if (this.isDeleted(entityType, id)) return;
      try {
        const remote = await this.client.getJson<T>(remoteItem.key);
        if (!remote) return;
        const local = findLocal(id);
        if (!this.isDeleted(entityType, id)) {
          if (!local) {
            saveLocal(remote);
            report.pulled++;
          } else {
            const localTime = new Date(getTimeStamp(local)).getTime();
            const remoteTime = remoteItem.lastModified.getTime();
            if (remoteTime > localTime) {
              saveLocal(remote);
              report.pulled++;
            }
          }
        }
      } catch (error) {
        report.errors.push(
          `拉取 ${entityType} ${id} 失败：${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });

    // 推送本地新增或更新的对象
    await mapWithConcurrency([...localMap], async ([id]) => {
      const local = findLocal(id);
      if (!local || this.isDeleted(entityType, id)) return;
      const remote = remoteMap.get(id);
      const localTime = new Date(getTimeStamp(local)).getTime();

      if (!remote || localTime > remote.lastModified.getTime()) {
        try {
          await this.client.putJson(`${prefix}${id}.json`, local);
          report.pushed++;
        } catch (error) {
          report.errors.push(
            `推送 ${entityType} ${id} 失败：${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    });
  }
}
