import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadModule(relativePath) {
  let source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  // Stub out imports from ./credentials and transpile ./entity-state inline
  const entityStateSource = readFileSync(new URL('../src/sync/entity-state.ts', import.meta.url), 'utf8');
  source = source.replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/credentials['"];?/g, `
    const saveTombstoneRecord = () => {};
    const removeTombstoneRecords = () => {};
  `);
  source = source.replace(/import\s*\{\s*revisionOf\s*\}\s*from\s*['"]\.\/entity-state['"];?/g, entityStateSource);
  source = source.replace(/import\s+type\s+[^;]+;?/g, '');
  source = source.replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\.\/types['"];?/g, '');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
  };
  return store;
}

test('incremental sync skips GET only for an already-observed remote version', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  let getJsonCalls = 0;
  let putJsonCalls = 0;

  const mockClient = {
    list: async (prefix) => {
      if (prefix === 'tombstones/') return [];
      if (prefix === 'records/') {
        return [
          { key: 'records/rec-unchanged.json', lastModified: new Date('2026-10-10T11:00:00.000Z') },
          { key: 'records/rec-newer.json', lastModified: new Date('2026-10-10T13:00:00.000Z') },
        ];
      }
      return [];
    },
    getJson: async (key) => {
      getJsonCalls++;
      if (key === 'records/rec-unchanged.json') {
        return {
          id: 'rec-unchanged',
          text: 'remote unchanged text',
          created_at: '2026-10-10T10:00:00.000Z',
          updated_at: '2026-10-10T12:00:00.000Z',
        };
      }
      if (key === 'records/rec-newer.json') {
        return {
          id: 'rec-newer',
          text: 'remote newer text',
          created_at: '2026-10-10T10:00:00.000Z',
          updated_at: '2026-10-10T13:00:00.000Z',
        };
      }
      return null;
    },
    putJson: async () => {
      putJsonCalls++;
    },
    delete: async () => {},
  };

  const localRecords = [
    {
      id: 'rec-unchanged',
      text: 'local unchanged text',
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
    {
      id: 'rec-newer',
      text: 'local older text',
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];

  let savedRecord = null;
  const mockRepo = {
    getRecords: () => localRecords,
    getRecord: (id) => localRecords.find((r) => r.id === id),
    saveRecord: (r) => { savedRecord = r; },
    deleteRecord: () => false,
    getThreads: () => [],
    getThread: () => undefined,
    saveThread: () => {},
    deleteThread: () => false,
    getTags: () => [],
    getTag: () => undefined,
    saveTag: () => {},
    deleteTag: () => false,
    getDeskRows: () => [],
    getDeskRow: () => undefined,
    saveDeskRow: () => {},
    deleteDeskRow: () => false,
    getHomeLink: () => null,
    saveHomeLink: () => {},
    getTombstones: () => [],
    saveTombstone: () => {},
    removeTombstones: () => {},
  };

  const service = new R2SyncService(mockClient, mockRepo);
  const first = await service.sync();

  // First run has no remote metadata yet, so both objects are inspected once.
  assert.equal(getJsonCalls, 2);
  assert.equal(first.pulled, 1);
  assert.equal(savedRecord?.id, 'rec-newer');
  assert.equal(putJsonCalls, 0);

  const second = await service.sync();

  // Second run sees the same remote mtimes; no extra GET, no pull, no push.
  assert.equal(getJsonCalls, 2, `getJson was called ${getJsonCalls} times after the second sync, expected 2`);
  assert.equal(second.pulled, 0);
  assert.equal(putJsonCalls, 0);
});

test('pull does not skip a newer remote object when the client clock is ahead of R2', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  let savedRecord = null;
  const mockClient = {
    list: async (prefix) => {
      if (prefix === 'records/') {
        return [
          // R2 lastModified is older than the local clock, but the object revision is newer.
          { key: 'records/rec-skew.json', lastModified: new Date('2026-10-10T11:00:00.000Z') },
        ];
      }
      return [];
    },
    getJson: async () => ({
      id: 'rec-skew',
      text: 'remote newer despite older server mtime',
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-10T13:00:00.000Z',
    }),
    putJson: async () => {},
    delete: async () => {},
  };

  const localRecords = [{
    id: 'rec-skew',
    text: 'local older text',
    created_at: '2026-10-10T10:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
  }];

  const mockRepo = {
    getRecords: () => localRecords,
    getRecord: (id) => localRecords.find((r) => r.id === id),
    saveRecord: (r) => { savedRecord = r; },
    deleteRecord: () => false,
    getThreads: () => [],
    getThread: () => undefined,
    saveThread: () => {},
    deleteThread: () => false,
    getTags: () => [],
    getTag: () => undefined,
    saveTag: () => {},
    deleteTag: () => false,
    getDeskRows: () => [],
    getDeskRow: () => undefined,
    saveDeskRow: () => {},
    deleteDeskRow: () => false,
    getHomeLink: () => null,
    saveHomeLink: () => {},
    getTombstones: () => [],
    saveTombstone: () => {},
    removeTombstones: () => {},
  };

  const service = new R2SyncService(mockClient, mockRepo);
  const report = await service.sync();

  assert.equal(report.pulled, 1);
  assert.equal(savedRecord?.id, 'rec-skew');
  assert.equal(savedRecord?.text, 'remote newer despite older server mtime');
});

test('push phase uploads local-only record and newer local record', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  let putKeys = [];
  const mockClient = {
    list: async (prefix) => {
      if (prefix === 'records/') {
        return [
          { key: 'records/rec-equal.json', lastModified: new Date('2026-10-10T12:00:00.000Z') },
        ];
      }
      return [];
    },
    getJson: async (key) => key === 'records/rec-equal.json'
      ? {
          id: 'rec-equal',
          text: 'equal text',
          created_at: '2026-10-10T10:00:00.000Z',
          updated_at: '2026-10-10T12:00:00.000Z',
        }
      : null,
    putJson: async (key) => {
      putKeys.push(key);
    },
    delete: async () => {},
  };

  const localRecords = [
    // 1. Equal time -> should NOT push
    {
      id: 'rec-equal',
      text: 'equal text',
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
    // 2. Local only -> should push
    {
      id: 'rec-local-only',
      text: 'local only text',
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-10T15:00:00.000Z',
    },
  ];

  const mockRepo = {
    getRecords: () => localRecords,
    getRecord: (id) => localRecords.find((r) => r.id === id),
    saveRecord: () => {},
    deleteRecord: () => false,
    getThreads: () => [],
    getThread: () => undefined,
    saveThread: () => {},
    deleteThread: () => false,
    getTags: () => [],
    getTag: () => undefined,
    saveTag: () => {},
    deleteTag: () => false,
    getDeskRows: () => [],
    getDeskRow: () => undefined,
    saveDeskRow: () => {},
    deleteDeskRow: () => false,
    getHomeLink: () => null,
    saveHomeLink: () => {},
    getTombstones: () => [],
    saveTombstone: () => {},
    removeTombstones: () => {},
  };

  const service = new R2SyncService(mockClient, mockRepo);
  const report = await service.sync();

  assert.equal(report.pushed, 1);
  assert.deepEqual(putKeys, ['records/rec-local-only.json']);
});

test('pulls are written back once per entity type instead of once per item', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  const remoteItems = ['rec-a', 'rec-b', 'rec-c'].map((id, index) => ({
    key: `records/${id}.json`,
    lastModified: new Date(`2026-10-10T1${index}:00:00.000Z`),
  }));

  const mockClient = {
    list: async (prefix) => (prefix === 'records/' ? remoteItems : []),
    getJson: async (key) => {
      const id = key.slice('records/'.length, -'.json'.length);
      return {
        id,
        text: id,
        created_at: '2026-10-10T10:00:00.000Z',
        updated_at: '2026-10-10T12:00:00.000Z',
      };
    },
    putJson: async () => {},
    delete: async () => {},
  };

  let batchCalls = 0;
  let batchedItems = 0;
  let singleSaves = 0;
  const mockRepo = {
    getRecords: () => [],
    getRecord: () => undefined,
    saveRecord: () => { singleSaves++; },
    saveRecords: (items) => { batchCalls++; batchedItems += items.length; },
    deleteRecord: () => false,
    getThreads: () => [],
    getThread: () => undefined,
    saveThread: () => {},
    deleteThread: () => false,
    getTags: () => [],
    getTag: () => undefined,
    saveTag: () => {},
    deleteTag: () => false,
    getDeskRows: () => [],
    getDeskRow: () => undefined,
    saveDeskRow: () => {},
    deleteDeskRow: () => false,
    getHomeLink: () => null,
    saveHomeLink: () => {},
    getTombstones: () => [],
    saveTombstone: () => {},
    removeTombstones: () => {},
  };

  const service = new R2SyncService(mockClient, mockRepo);
  const report = await service.sync();

  assert.equal(report.pulled, 3);
  assert.equal(batchCalls, 1, `expected one batched write, got ${batchCalls}`);
  assert.equal(batchedItems, 3);
  assert.equal(singleSaves, 0, 'batch-capable repositories must not fall back to per-item saves');
});

const makeRepo = (overrides = {}) => ({
  getRecords: () => [],
  getRecord: () => undefined,
  saveRecord: () => {},
  saveRecords: () => {},
  deleteRecord: () => false,
  getThreads: () => [],
  getThread: () => undefined,
  saveThread: () => {},
  deleteThread: () => false,
  getTags: () => [],
  getTag: () => undefined,
  saveTag: () => {},
  deleteTag: () => false,
  getDeskRows: () => [],
  getDeskRow: () => undefined,
  saveDeskRow: () => {},
  deleteDeskRow: () => false,
  getHomeLink: () => null,
  saveHomeLink: () => {},
  getTombstones: () => [],
  saveTombstone: () => {},
  removeTombstones: () => {},
  ...overrides,
});

const remoteRecord = (id, text, updatedAt) => ({
  id,
  text,
  created_at: '2026-10-10T10:00:00.000Z',
  updated_at: updatedAt,
  parent_id: null,
  tag_id: null,
  thread_id: null,
});

test('records deleted locally during the pull phase are not written back', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  let localRecords = [remoteRecord('rec-doomed', 'local', '2026-10-10T12:00:00.000Z')];
  let saved = 0;
  let puts = 0;
  const mockClient = {
    list: async (prefix) =>
      prefix === 'records/'
        ? [{ key: 'records/rec-doomed.json', lastModified: new Date('2026-10-10T13:00:00.000Z') }]
        : [],
    getJson: async () => {
      // 模擬使用者在拉取期間刪除記錄：store 立即移除，墓碑要等排隊的 deleteEntity 才寫入。
      localRecords = [];
      return remoteRecord('rec-doomed', 'remote', '2026-10-10T13:00:00.000Z');
    },
    putJson: async () => {
      puts++;
    },
    delete: async () => {},
  };
  const mockRepo = makeRepo({
    getRecords: () => localRecords,
    getRecord: (id) => localRecords.find((record) => record.id === id),
    saveRecord: () => {
      saved++;
    },
    saveRecords: () => {
      saved++;
    },
  });

  const report = await new R2SyncService(mockClient, mockRepo).sync();

  assert.equal(saved, 0, 'deleted records must not be resurrected by the batched write');
  assert.equal(puts, 0);
  assert.equal(report.pulled, 0);
});

test('an edit made during the pull phase survives the batched write and gets pushed', async () => {
  installLocalStorage();
  const { R2SyncService } = await loadModule('../src/sync/r2-sync.ts');

  let localRecords = [remoteRecord('rec-live', 'before', '2026-10-10T12:00:00.000Z')];
  let saved = 0;
  const putKeys = [];
  const mockClient = {
    list: async (prefix) =>
      prefix === 'records/'
        ? [{ key: 'records/rec-live.json', lastModified: new Date('2026-10-10T13:00:00.000Z') }]
        : [],
    getJson: async () => {
      // 模擬拉取期間使用者編輯了同一條記錄（updated_at 比遠端更新）。
      localRecords = [remoteRecord('rec-live', 'edited', '2026-10-10T14:00:00.000Z')];
      return remoteRecord('rec-live', 'remote', '2026-10-10T13:00:00.000Z');
    },
    putJson: async (key) => {
      putKeys.push(key);
    },
    delete: async () => {},
  };
  const mockRepo = makeRepo({
    getRecords: () => localRecords,
    getRecord: (id) => localRecords.find((record) => record.id === id),
    saveRecord: () => {
      saved++;
    },
    saveRecords: () => {
      saved++;
    },
  });

  const report = await new R2SyncService(mockClient, mockRepo).sync();

  assert.equal(saved, 0, 'the newer local edit must not be overwritten by the stale remote copy');
  assert.deepEqual(putKeys, ['records/rec-live.json']);
  assert.equal(report.pulled, 0);
  assert.equal(report.pushed, 1);
});
