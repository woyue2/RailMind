import { RecordItem, TagItem, ThreadItem, HomeLink, DeskEdgeRow } from '../types';
import {
  R2ClientLike,
  SyncReport,
  SyncTombstone,
  FlowRepositoryLike,
  SyncOptions,
  SyncProgressStatus,
  SyncStage,
} from './types';
import { revisionOf } from './entity-state';

const SYNC_CONCURRENCY = 8;
const DEFAULT_SYNC_TIMEOUT_MS = 60_000;
const REMOTE_META_KEY = 'flow.r2.remote-meta.v2';
/** 拉取結果分批寫回：避免整庫（含 base64 圖片）長時間駐留記憶體。 */
const PULL_BATCH_SIZE = 100;

type EntityType = SyncTombstone['entityType'];

interface EntityMeta {
  /** R2 key prefix, trailing slash included. */
  prefix: string;
  stage: SyncStage;
  label: string;
}

const ENTITY_META: Record<EntityType, EntityMeta> = {
  record: { prefix: 'records/', stage: 'records', label: '便签记录' },
  thread: { prefix: 'threads/', stage: 'threads', label: '思维线' },
  tag: { prefix: 'tags/', stage: 'tags', label: '标签' },
  desk: { prefix: 'desks/', stage: 'desks', label: '桌邊抽屜' },
};

const TOMBSTONE_KEY = new RegExp(
  `^tombstones/(${Object.keys(ENTITY_META).join('|')})/[^/]+\\.json$`
);

function entityPrefix(entityType: EntityType): string {
  return ENTITY_META[entityType].prefix;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 物件自帶 revision 時用它，否則退回 R2 的 lastModified。 */
function remoteTime(remote: { id: string }, lastModified: number): number {
  const revision = revisionOf(remote);
  return Number.isNaN(revision) ? lastModified : revision;
}

interface RemoteMeta {
  mtime: number;
  revision: number;
}

interface RemoteMetaStore {
  /** 非敏感配置指纹；切换 Account/Bucket/Endpoint 后旧缓存自动失效。 */
  config: string;
  entries: Record<string, RemoteMeta>;
}

function loadRemoteMeta(config: string): Map<string, RemoteMeta> {
  try {
    if (typeof localStorage === 'undefined') return new Map();
    const raw = localStorage.getItem(REMOTE_META_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Partial<RemoteMetaStore>;
    if (parsed?.config !== config || !parsed.entries) return new Map();
    return new Map(
      Object.entries(parsed.entries).filter(
        ([, value]) => value && typeof value.mtime === 'number' && typeof value.revision === 'number'
      )
    );
  } catch {
    return new Map();
  }
}

let operationQueue: Promise<unknown> = Promise.resolve();

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
  /** key → last observed remote mtime/revision; skip GET only when this exact remote version was seen. */
  private readonly remoteMeta: Map<string, RemoteMeta>;
  private readonly metaConfig: string;
  private metaDirty = false;
  /** 同步期間用集合查墓碑，避免每個實體都掃一遍陣列。 */
  private deletedKeys: Set<string> | null = null;

  constructor(
    private readonly client: R2ClientLike,
    private readonly repository: FlowRepositoryLike,
    metaConfig = ''
  ) {
    this.metaConfig = metaConfig;
    this.remoteMeta = loadRemoteMeta(metaConfig);
  }

  private rememberRemote(key: string, mtime: number, revision: number): void {
    const previous = this.remoteMeta.get(key);
    if (previous && previous.mtime === mtime && previous.revision === revision) return;
    this.remoteMeta.set(key, { mtime, revision });
    this.metaDirty = true;
  }

  private forgetRemote(key: string): void {
    if (this.remoteMeta.delete(key)) this.metaDirty = true;
  }

  private persistRemoteMeta(): void {
    if (!this.metaDirty) return;
    this.metaDirty = false;
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        REMOTE_META_KEY,
        JSON.stringify({ config: this.metaConfig, entries: Object.fromEntries(this.remoteMeta) })
      );
    } catch {
      // Metadata is an optimization; failing to persist it must not fail the sync.
    }
  }

  /** 單筆推送：先讀目前版本，避免用較舊的 revision 覆蓋遠端。 */
  private async pushCurrent<T extends { id: string }>(
    entityType: EntityType,
    current: T | undefined
  ): Promise<void> {
    if (!current || this.isDeleted(entityType, current.id)) return;
    const key = `${entityPrefix(entityType)}${current.id}.json`;
    const remote = await this.client.getJson<T>(key);
    if (!remote || revisionOf(remote) < revisionOf(current)) {
      await this.client.putJson(key, current);
    }
  }

  pushRecord(record: RecordItem): Promise<void> {
    return enqueue(() => this.pushCurrent('record', this.repository.getRecord(record.id)));
  }

  pushThread(thread: ThreadItem): Promise<void> {
    return enqueue(() => this.pushCurrent('thread', this.repository.getThread(thread.id)));
  }

  pushTag(tag: TagItem): Promise<void> {
    return enqueue(() => this.pushCurrent('tag', this.repository.getTag(tag.id)));
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
    return enqueue(() => this.pushCurrent('desk', this.repository.getDeskRow(row.id)));
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
    if (this.deletedKeys) {
      for (const id of entityIds) this.deletedKeys.delete(`${entityType}:${id}`);
    }
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

  private isDeleted(entityType: EntityType, entityId: string): boolean {
    if (this.deletedKeys) return this.deletedKeys.has(`${entityType}:${entityId}`);
    return this.repository
      .getTombstones()
      .some((item) => item.entityType === entityType && item.entityId === entityId);
  }

  private tombstoneFor(entityType: EntityType, entityId: string): SyncTombstone {
    const existing = this.repository
      .getTombstones()
      .find((item) => item.entityType === entityType && item.entityId === entityId);
    const tombstone = existing ?? {
      entityType,
      entityId,
      deletedAt: new Date().toISOString(),
    };
    this.repository.saveTombstone(tombstone);
    this.deletedKeys?.add(`${entityType}:${entityId}`);
    return tombstone;
  }

  private async deleteEntity(entityType: EntityType, id: string): Promise<void> {
    const tombstone = this.tombstoneFor(entityType, id);
    const key = `${entityPrefix(entityType)}${id}.json`;
    await this.client.putJson(`tombstones/${entityType}/${id}.json`, tombstone);
    await this.client.delete(key);
    this.forgetRemote(key);
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

      // 同步期間改用集合查墓碑，避免每個實體都掃一遍墓碑陣列。
      this.deletedKeys = new Set(
        this.repository.getTombstones().map((item) => `${item.entityType}:${item.entityId}`)
      );

      // 2. 同步 Records
      await this.syncEntities<RecordItem>(
        {
          type: 'record',
          listLocal: () => this.repository.getRecords(),
          saveLocal: (item) => this.repository.saveRecord(item),
          saveLocalMany: this.repository.saveRecords?.bind(this.repository),
        },
        report,
        reportProgress,
        signal
      );

      // 3. 同步 Threads
      await this.syncEntities<ThreadItem>(
        {
          type: 'thread',
          listLocal: () => this.repository.getThreads(),
          saveLocal: (item) => this.repository.saveThread(item),
          saveLocalMany: this.repository.saveThreads?.bind(this.repository),
        },
        report,
        reportProgress,
        signal
      );

      // 4. 同步 Tags
      await this.syncEntities<TagItem>(
        {
          type: 'tag',
          listLocal: () => this.repository.getTags(),
          saveLocal: (item) => this.repository.saveTag(item),
          saveLocalMany: this.repository.saveTags?.bind(this.repository),
        },
        report,
        reportProgress,
        signal
      );

      // 4.5 同步桌邊抽屜
      await this.syncEntities<DeskEdgeRow>(
        {
          type: 'desk',
          listLocal: () => this.repository.getDeskRows(),
          saveLocal: (item) => this.repository.saveDeskRow(item),
          saveLocalMany: this.repository.saveDeskRows?.bind(this.repository),
        },
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
    } finally {
      this.deletedKeys = null;
      this.persistRemoteMeta();
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
    const validRemoteItems = remoteList.filter((item) => TOMBSTONE_KEY.test(item.key));
    const remoteKeys = new Set(validRemoteItems.map((item) => item.key));

    // 遠端已有的墓碑不必重複上傳（墓碑一經寫入不會改變）。
    const pendingUploads = localTombstones.filter(
      (tombstone) =>
        !remoteKeys.has(`tombstones/${tombstone.entityType}/${tombstone.entityId}.json`)
    );

    const totalOps = pendingUploads.length + validRemoteItems.length;
    let completedOps = 0;

    const tick = () => {
      completedOps++;
      if (onProgress && totalOps > 0) {
        onProgress(completedOps, totalOps);
      }
    };

    // 1. 并发上传本地墓碑（受控并发池）
    await mapConcurrent(
      pendingUploads,
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

        const key = `${entityPrefix(tombstone.entityType)}${tombstone.entityId}.json`;
        await this.client.delete(key, signal).catch(() => undefined);
        this.forgetRemote(key);
      },
      tick
    );
  }

  private async syncEntities<T extends { id: string }>(
    config: {
      type: EntityType;
      listLocal: () => T[];
      saveLocal: (item: T) => void;
      /** 批次寫回：每筆 saveLocal 都會觸發一次全量持久化，拉取時應一次寫回。 */
      saveLocalMany?: (items: T[]) => void;
    },
    report: SyncReport,
    reportProgress: (status: SyncProgressStatus) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { type, listLocal, saveLocal, saveLocalMany } = config;
    const { prefix, stage, label } = ENTITY_META[type];

    reportProgress({
      stage,
      message: `正在获取云端 ${label} 列表...`,
      current: 0,
      total: 0,
    });

    const [remoteList, locals] = await Promise.all([
      this.client.list(prefix, signal),
      Promise.resolve(listLocal()),
    ]);
    let localMap = new Map(locals.map((item) => [item.id, item]));
    const remoteMap = new Map(
      remoteList
        .filter((item) => item.key.endsWith('.json'))
        .map((item) => [item.key.slice(prefix.length, -5), item])
    );
    const remoteEntries = [...remoteMap];
    const localEntries = [...localMap];

    // 远端已不存在的对象，其缓存条目一并清掉，避免无限增长。
    const remoteKeys = new Set(remoteEntries.map(([, item]) => item.key));
    for (const key of [...this.remoteMeta.keys()]) {
      if (key.startsWith(prefix) && !remoteKeys.has(key)) this.forgetRemote(key);
    }

    const totalEntityTasks = remoteEntries.length + localEntries.length;
    let finishedEntityTasks = 0;

    const onTaskStep = () => {
      finishedEntityTasks++;
      reportProgress({
        stage,
        message: `正在同步 ${label} (${finishedEntityTasks}/${totalEntityTasks})...`,
        current: finishedEntityTasks,
        total: Math.max(totalEntityTasks, 1),
      });
    };

    let pulled: Array<{ item: T; remoteRevision: number }> = [];
    const initialLocalIds = new Set(locals.map((item) => item.id));
    const recordPulled = (item: T, remoteRevision: number) => {
      pulled.push({ item, remoteRevision });
      report.pulled++;
      if (pulled.length >= PULL_BATCH_SIZE) flushPulled();
    };
    const flushPulled = () => {
      if (!pulled.length) return;
      const currentById = new Map(listLocal().map((item) => [item.id, item]));
      const pending = pulled.filter(({ item, remoteRevision }) => {
        // 同步期間被刪除的實體不再寫回，否則會把它們復活。
        // 刪除的墓碑要等排隊的 deleteEntity 執行後才存在，所以這裡還要對照本機目前是否仍有這條記錄。
        if (this.isDeleted(type, item.id)) return false;
        if (initialLocalIds.has(item.id) && !currentById.has(item.id)) return false;
        // 使用者在拉取期間又編輯了同一條記錄：保留較新的本機版本，交給推送階段。
        const current = currentById.get(item.id);
        if (!current) return true;
        const currentRevision = revisionOf(current);
        return Number.isNaN(currentRevision) || currentRevision <= remoteRevision;
      });
      report.pulled -= pulled.length - pending.length;
      pulled = [];
      if (!pending.length) return;
      const items = pending.map((entry) => entry.item);
      if (saveLocalMany) saveLocalMany(items);
      else items.forEach(saveLocal);
    };

    // 拉取远端新增或更新的对象（受控并发池）。
    // 只有「同一個遠端版本已經看過」才跳過 GET；不可用本機時鐘和 R2 lastModified 比較。
    await mapConcurrent(
      remoteEntries,
      SYNC_CONCURRENCY,
      async ([id, remoteItem]) => {
        if (this.isDeleted(type, id)) return;
        const local = localMap.get(id);
        const remoteKey = remoteItem.key;
        const remoteLastModified = remoteItem.lastModified.getTime();
        const cached = this.remoteMeta.get(remoteKey);

        if (local && cached?.mtime === remoteLastModified) return;

        try {
          const remote = await this.client.getJson<T>(remoteKey, signal);
          if (!remote) {
            this.forgetRemote(remoteKey);
            return;
          }
          const remoteRevision = remoteTime(remote, remoteLastModified);
          this.rememberRemote(remoteKey, remoteLastModified, remoteRevision);

          if (this.isDeleted(type, id)) return;
          if (!local || remoteRevision > revisionOf(local)) recordPulled(remote, remoteRevision);
        } catch (error) {
          report.errors.push(`拉取 ${type} ${id} 失败：${errorText(error)}`);
        }
      },
      onTaskStep
    );

    flushPulled();

    if (signal?.aborted) {
      throw new Error('同步已取消');
    }

    // 重新讀取一次本機資料，讓推送判斷涵蓋拉取期間的使用者編輯。
    localMap = new Map(listLocal().map((item) => [item.id, item]));

    // 推送本地新增或更新的对象（受控并发池）。
    // 推送前必须确认远端目前版本：meta 指出远端已变或没看过时，先 GET 比对；
    // GET 失败就不推送，避免在不确定远端状态时覆盖。
    await mapConcurrent(
      localEntries,
      SYNC_CONCURRENCY,
      async ([id]) => {
        const local = localMap.get(id);
        if (!local || this.isDeleted(type, id)) return;
        const remoteItem = remoteMap.get(id);
        const remoteKey = `${prefix}${id}.json`;
        const localRevision = revisionOf(local);
        let remoteRevision = 0;

        if (remoteItem) {
          const remoteLastModified = remoteItem.lastModified.getTime();
          const cached = this.remoteMeta.get(remoteKey);
          if (cached && cached.mtime === remoteLastModified) {
            remoteRevision = cached.revision;
          } else {
            try {
              const remote = await this.client.getJson<T>(remoteKey, signal);
              if (!remote) {
                this.forgetRemote(remoteKey);
              } else {
                remoteRevision = remoteTime(remote, remoteLastModified);
                this.rememberRemote(remoteKey, remoteLastModified, remoteRevision);
                if (remoteRevision > localRevision) {
                  recordPulled(remote, remoteRevision);
                  return;
                }
              }
            } catch (error) {
              report.errors.push(`检查远端 ${type} ${id} 失败：${errorText(error)}`);
              return;
            }
          }
        }

        if (!remoteItem || localRevision > remoteRevision) {
          try {
            await this.client.putJson(remoteKey, local, signal);
            report.pushed++;
            this.forgetRemote(remoteKey);
          } catch (error) {
            report.errors.push(`推送 ${type} ${id} 失败：${errorText(error)}`);
          }
        }
      },
      onTaskStep
    );

    flushPulled();
  }
}
