import { RecordItem, TagItem, ThreadItem, HomeLink, DeskEdgeRow } from '../types';
import {
  R2ClientLike,
  SyncReport,
  SyncTombstone,
  FlowRepositoryLike,
  SyncOptions,
  SyncProgressStatus,
} from './types';
import { saveTombstoneRecord, removeTombstoneRecords } from './credentials';
import { revisionOf } from './entity-state';

const SYNC_CONCURRENCY = 4;
const DEFAULT_SYNC_TIMEOUT_MS = 60_000;
let operationQueue: Promise<unknown> = Promise.resolve();

function entityPrefix(entityType: SyncTombstone['entityType']): string {
  switch (entityType) {
    case 'record':
      return 'records';
    case 'thread':
      return 'threads';
    case 'tag':
      return 'tags';
    case 'desk':
      return 'desks';
    default:
      throw new Error(`未知同步類型：${entityType}`);
  }
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`同步超时（${timeoutMs / 1000}s）`));
    }, timeoutMs);
  });

  return Promise.race([operation(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
    controller.abort();
  });
}

export async function mapConcurrent<T, R = void>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, item: T) => void
): Promise<R[]> {
  if (!items || !items.length) return [];
  const results = new Array<R>(items.length);
  let currentIndex = 0;
  let completed = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err } as unknown as R;
      }
      completed++;
      if (typeof onProgress === 'function') {
        onProgress(completed, items.length, items[idx]);
      }
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
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
        const remote = await this.client.getJson<RecordItem>(`records/${id}.json`);
        if (!remote || revisionOf(remote) < revisionOf(current)) {
          await this.client.putJson(`records/${id}.json`, current);
        }
      }
    });
  }

  pushThread(thread: ThreadItem): Promise<void> {
    const id = thread.id;
    return enqueue(async () => {
      const current = this.repository.getThread(id);
      if (current && !this.isDeleted('thread', id)) {
        const remote = await this.client.getJson<ThreadItem>(`threads/${id}.json`);
        if (!remote || revisionOf(remote) < revisionOf(current)) {
          await this.client.putJson(`threads/${id}.json`, current);
        }
      }
    });
  }

  pushTag(tag: TagItem): Promise<void> {
    const id = tag.id;
    return enqueue(async () => {
      const current = this.repository.getTag(id);
      if (current && !this.isDeleted('tag', id)) {
        const remote = await this.client.getJson<TagItem>(`tags/${id}.json`);
        if (!remote || revisionOf(remote) < revisionOf(current)) {
          await this.client.putJson(`tags/${id}.json`, current);
        }
      }
    });
  }

  pushHomeLink(link: HomeLink | null): Promise<void> {
    return enqueue(() =>
      link
        ? this.client.putJson('settings/home-link.json', link)
        : this.client.delete('settings/home-link.json')
    );
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

  pushDeskRow(row: DeskEdgeRow): Promise<void> {
    return enqueue(async () => {
      const current = this.repository.getDeskRow(row.id);
      if (current && !this.isDeleted('desk', row.id)) {
        const remote = await this.client.getJson<DeskEdgeRow>(`desks/${row.id}.json`);
        if (!remote || revisionOf(remote) < revisionOf(current)) {
          await this.client.putJson(`desks/${row.id}.json`, current);
        }
      }
    });
  }

  deleteDeskRow(id: string): Promise<void> {
    return enqueue(() => this.deleteEntity('desk', id));
  }

  /**
   * 清除指定实体的墓碑（本地内存 + localStorage + R2 对象）。
   * 撤销删除（restore）后必须调用，否则 isDeleted 短路会让该实体永久无法同步。
   */
  clearTombstones(entityType: SyncTombstone['entityType'], entityIds: string[]): Promise<void> {
    if (!entityIds.length) return Promise.resolve();
    this.repository.removeTombstones(entityType, entityIds);
    removeTombstoneRecords(entityType, entityIds);
    return enqueue(async () => {
      await mapConcurrent(
        entityIds,
        SYNC_CONCURRENCY,
        async (id) => {
          await this.client
            .delete(`tombstones/${entityType}/${id}.json`)
            .catch(() => undefined);
        }
      );
    });
  }

  sync(options?: SyncOptions): Promise<SyncReport> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
    return enqueue(() =>
      runWithTimeout((signal) => this.runSync({ ...options, signal }), timeoutMs)
    );
  }

  private isDeleted(entityType: SyncTombstone['entityType'], entityId: string): boolean {
    return this.repository
      .getTombstones()
      .some((item) => item.entityType === entityType && item.entityId === entityId);
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
    const prefix = entityPrefix(entityType);
    await this.client.putJson(`tombstones/${entityType}/${id}.json`, tombstone);
    await this.client.delete(`${prefix}/${id}.json`);
  }

  private async runSync(options?: SyncOptions): Promise<SyncReport> {
    const signal = options?.signal;
    const report: SyncReport = { pulled: 0, pushed: 0, errors: [] };
    const reportProgress = (status: SyncProgressStatus) => {
      try {
        options?.onProgress?.(status);
      } catch {
        // ignore callback error
      }
    };

    try {
      // 1. 同步墓碑
      reportProgress({
        stage: 'tombstones',
        message: '正在检查并同步删除标记...',
        current: 0,
        total: 1,
      });
      await this.syncTombstones(report, (completed, total) => {
        reportProgress({
          stage: 'tombstones',
          message: `正在同步删除标记 (${completed}/${total})...`,
          current: completed,
          total,
        });
      }, signal);

      // 2. 同步 Records
      await this.syncEntities<RecordItem>(
        'record',
        'records/',
        () => this.repository.getRecords(),
        (id) => this.repository.getRecord(id),
        (item) => this.repository.saveRecord(item),
        (item) => item.updated_at ?? item.created_at,
        report,
        reportProgress,
        signal
      );

      // 3. 同步 Threads
      await this.syncEntities<ThreadItem>(
        'thread',
        'threads/',
        () => this.repository.getThreads(),
        (id) => this.repository.getThread(id),
        (item) => this.repository.saveThread(item),
        (item) => item.last_used_at || item.created_at,
        report,
        reportProgress,
        signal
      );

      // 4. 同步 Tags
      await this.syncEntities<TagItem>(
        'tag',
        'tags/',
        () => this.repository.getTags(),
        (id) => this.repository.getTag(id),
        (item) => this.repository.saveTag(item),
        (item) => item.updated_at ?? item.created_at ?? '1970-01-01T00:00:00.000Z',
        report,
        reportProgress,
        signal
      );

      // 4.5 同步桌邊抽屜
      await this.syncEntities<DeskEdgeRow>(
        'desk',
        'desks/',
        () => this.repository.getDeskRows(),
        (id) => this.repository.getDeskRow(id),
        (item) => this.repository.saveDeskRow(item),
        (item) =>
          item.state_updated_at &&
          new Date(item.state_updated_at).getTime() >
            new Date(item.updated_at || item.created_at).getTime()
            ? item.state_updated_at
            : item.updated_at || item.created_at,
        report,
        reportProgress,
        signal
      );

      // 5. 同步设置
      reportProgress({
        stage: 'settings',
        message: '正在同步设置与快捷配置...',
        current: 0,
        total: 1,
      });
      const remoteLinkItem = (await this.client.list('settings/', signal)).find(
        (item) => item.key === 'settings/home-link.json'
      );
      const remoteLink = remoteLinkItem
        ? await this.client.getJson<HomeLink>(remoteLinkItem.key, signal)
        : undefined;
      const localLink = this.repository.getHomeLink();
      if (
        remoteLink &&
        (!localLink ||
          new Date(remoteLink.updatedAt).getTime() > new Date(localLink.updatedAt).getTime())
      ) {
        this.repository.saveHomeLink(remoteLink);
        report.pulled++;
      } else if (
        localLink &&
        (!remoteLinkItem ||
          new Date(localLink.updatedAt).getTime() > remoteLinkItem.lastModified.getTime())
      ) {
        await this.client.putJson('settings/home-link.json', localLink, signal);
        report.pushed++;
      }

      reportProgress({
        stage: 'done',
        message: '云端同步完成',
        current: 1,
        total: 1,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      report.errors.push(msg);
      reportProgress({
        stage: 'error',
        message: `同步异常: ${msg}`,
        current: 0,
        total: 0,
      });
    }
    if (signal?.aborted) {
      throw new Error('同步已取消');
    }
    return report;
  }

  private async syncTombstones(
    report: SyncReport,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const localTombstones = this.repository.getTombstones();
    const remoteList = await this.client.list('tombstones/', signal);
    const validRemoteItems = remoteList.filter((item) =>
      /^tombstones\/(record|thread|tag|desk)\/[^/]+\.json$/.test(item.key)
    );

    const totalOps = localTombstones.length + validRemoteItems.length;
    let completedOps = 0;

    const tick = () => {
      completedOps++;
      if (onProgress && totalOps > 0) {
        onProgress(completedOps, totalOps);
      }
    };

    // 1. 并发上传本地墓碑（受控并发池）
    await mapConcurrent(
      localTombstones,
      SYNC_CONCURRENCY,
      async (tombstone) => {
        await this.client
          .putJson(
            `tombstones/${tombstone.entityType}/${tombstone.entityId}.json`,
            tombstone,
            signal
          )
          .catch(() => undefined);
      },
      tick
    );

    if (signal?.aborted) {
      throw new Error('同步已取消');
    }

    // 2. 并发拉取远端墓碑并执行本地清理（受控并发池）
    await mapConcurrent(
      validRemoteItems,
      SYNC_CONCURRENCY,
      async (item) => {
        const tombstone = await this.client.getJson<SyncTombstone>(item.key, signal);
        if (!tombstone) return;

        this.repository.saveTombstone(tombstone);
        saveTombstoneRecord(tombstone);

        let removed = false;
        if (tombstone.entityType === 'record') {
          removed = this.repository.deleteRecord(tombstone.entityId);
        } else if (tombstone.entityType === 'thread') {
          removed = this.repository.deleteThread(tombstone.entityId);
        } else if (tombstone.entityType === 'tag') {
          removed = this.repository.deleteTag(tombstone.entityId);
        } else if (tombstone.entityType === 'desk') {
          removed = this.repository.deleteDeskRow(tombstone.entityId);
        }

        if (removed) report.pulled++;

        const prefix = entityPrefix(tombstone.entityType);
        await this.client
          .delete(`${prefix}/${tombstone.entityId}.json`, signal)
          .catch(() => undefined);
      },
      tick
    );
  }

  private async syncEntities<T extends { id: string }>(
    entityType: SyncTombstone['entityType'],
    prefix: string,
    listLocal: () => T[],
    findLocal: (id: string) => T | undefined,
    saveLocal: (item: T) => void,
    getTimeStamp: (item: T) => string,
    report: SyncReport,
    reportProgress: (status: SyncProgressStatus) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const entityLabel =
      entityType === 'record'
        ? '便签记录'
        : entityType === 'thread'
        ? '思维线'
        : entityType === 'tag'
        ? '标签'
        : '桌邊抽屜';

    reportProgress({
      stage:
        entityType === 'record'
          ? 'records'
          : entityType === 'thread'
          ? 'threads'
          : entityType === 'tag'
          ? 'tags'
          : 'desks',
      message: `正在获取云端 ${entityLabel} 列表...`,
      current: 0,
      total: 0,
    });

    const [remoteList, locals] = await Promise.all([
      this.client.list(prefix, signal),
      Promise.resolve(listLocal()),
    ]);
    const localMap = new Map(locals.map((item) => [item.id, item]));
    const remoteMap = new Map(
      remoteList
        .filter((item) => item.key.endsWith('.json'))
        .map((item) => [item.key.slice(prefix.length, -5), item])
    );
    const remoteObjectCache = new Map<string, T>();

    const remoteEntries = [...remoteMap];
    const localEntries = [...localMap];
    const totalEntityTasks = remoteEntries.length + localEntries.length;
    let finishedEntityTasks = 0;

    const onTaskStep = () => {
      reportProgress({
        stage:
          entityType === 'record'
            ? 'records'
            : entityType === 'thread'
            ? 'threads'
            : entityType === 'tag'
            ? 'tags'
            : 'desks',
        message: `正在同步 ${entityLabel} (${finishedEntityTasks}/${totalEntityTasks})...`,
        current: finishedEntityTasks,
        total: Math.max(totalEntityTasks, 1),
      });
    };

    // 拉取远端新增或更新的对象（受控并发池）
    await mapConcurrent(
      remoteEntries,
      SYNC_CONCURRENCY,
      async ([id, remoteItem]) => {
        if (this.isDeleted(entityType, id)) return;
        try {
          const remote = await this.client.getJson<T>(remoteItem.key, signal);
          if (!remote) return;
          remoteObjectCache.set(id, remote);
          const local = findLocal(id);
          if (!this.isDeleted(entityType, id)) {
            if (!local) {
              saveLocal(remote);
              report.pulled++;
            } else {
              const localRevision = revisionOf(local);
              const remoteRevision = revisionOf(remote);
              const localTime = Number.isNaN(localRevision)
                ? new Date(getTimeStamp(local)).getTime()
                : localRevision;
              const remoteTime = Number.isNaN(remoteRevision)
                ? remoteItem.lastModified.getTime()
                : remoteRevision;
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
      },
      () => {
        finishedEntityTasks++;
        onTaskStep();
      }
    );

    if (signal?.aborted) {
      throw new Error('同步已取消');
    }

    // 推送本地新增或更新的对象（受控并发池）
    await mapConcurrent(
      localEntries,
      SYNC_CONCURRENCY,
      async ([id]) => {
        const local = findLocal(id);
        if (!local || this.isDeleted(entityType, id)) return;
        const remoteItem = remoteMap.get(id);
        let remoteRevision: number | undefined;
        if (remoteItem) {
          const cachedRemote = remoteObjectCache.get(id);
          if (cachedRemote) {
            remoteRevision = revisionOf(cachedRemote);
          } else {
            try {
              const remoteObject = await this.client.getJson<T>(remoteItem.key, signal);
              if (remoteObject) {
                remoteRevision = revisionOf(remoteObject);
              }
            } catch (error) {
              report.errors.push(
                `推送 ${entityType} ${id} 失败：${
                  error instanceof Error ? error.message : String(error)
                }`
              );
              return;
            }
          }
        }

        const localRevision = revisionOf(local);
        const localTime = Number.isNaN(localRevision)
          ? new Date(getTimeStamp(local)).getTime()
          : localRevision;
        const remoteLastModified = remoteItem?.lastModified.getTime() ?? 0;
        const remoteTime =
          remoteRevision === undefined
            ? 0
            : Number.isNaN(remoteRevision)
            ? remoteLastModified
            : remoteRevision;

        if (!remoteItem || localTime > remoteTime) {
          try {
            await this.client.putJson(`${prefix}${id}.json`, local, signal);
            report.pushed++;
          } catch (error) {
            report.errors.push(
              `推送 ${entityType} ${id} 失败：${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      },
      () => {
        finishedEntityTasks++;
        onTaskStep();
      }
    );
  }
}
