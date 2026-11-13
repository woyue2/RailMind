import { R2Config, SyncTombstone } from './types';

const R2_SETTINGS_KEY = 'flow.r2.settings.v1';
const R2_SECRET_KEY = 'flow.r2.secret.v1';
const TOMBSTONES_KEY = 'flow.sync.tombstones.v1';

export const defaultR2Config: R2Config = {
  enabled: false,
  accountId: '',
  accessKeyId: '',
  secretAccessKey: '',
  bucketName: '',
  endpoint: '',
  region: 'auto',
};

export function loadR2Settings(): R2Config {
  try {
    const raw = localStorage.getItem(R2_SETTINGS_KEY);
    if (!raw) return { ...defaultR2Config };
    const parsed = JSON.parse(raw) as Partial<R2Config>;
    const secret = getSecretAccessKey();
    return {
      enabled: parsed.enabled ?? defaultR2Config.enabled,
      accountId: parsed.accountId ?? defaultR2Config.accountId,
      accessKeyId: parsed.accessKeyId ?? defaultR2Config.accessKeyId,
      secretAccessKey: secret || defaultR2Config.secretAccessKey,
      bucketName: parsed.bucketName ?? defaultR2Config.bucketName,
      endpoint: parsed.endpoint ?? defaultR2Config.endpoint,
      region: parsed.region ?? defaultR2Config.region,
    };
  } catch {
    return { ...defaultR2Config };
  }
}

export function saveR2Settings(settings: R2Config): void {
  const { secretAccessKey, ...rest } = settings;
  localStorage.setItem(R2_SETTINGS_KEY, JSON.stringify(rest));
  if (secretAccessKey) {
    setSecretAccessKey(secretAccessKey);
  }
}

function readSecret(key: string): string {
  return localStorage.getItem(key) ?? '';
}

function writeSecret(key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(key, trimmed);
  } else {
    localStorage.removeItem(key);
  }
}

export function getSecretAccessKey(): string {
  return readSecret(R2_SECRET_KEY);
}

export function setSecretAccessKey(value: string): void {
  writeSecret(R2_SECRET_KEY, value);
}

export function clearSecretAccessKey(): void {
  localStorage.removeItem(R2_SECRET_KEY);
}

/** 設定是否足以建立同步連線（不讀 localStorage，供呼叫方複用已載入的設定）。 */
export function isR2ConfigUsable(settings: R2Config): boolean {
  return Boolean(
    settings.accountId.trim() &&
    settings.accessKeyId.trim() &&
    settings.bucketName.trim() &&
    settings.secretAccessKey.trim()
  );
}

export function isR2Configured(): boolean {
  return isR2ConfigUsable(loadR2Settings());
}

// Tombstone persistence
export function loadTombstones(): SyncTombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTombstoneRecord(tombstone: SyncTombstone): void {
  const list = loadTombstones().filter(
    (t) => !(t.entityType === tombstone.entityType && t.entityId === tombstone.entityId)
  );
  list.push(tombstone);
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list));
}

/**
 * 清除指定实体的本地墓碑记录。
 * 用于「删除后撤销恢复」场景：恢复实体时必须同步移除墓碑，
 * 否则后续 push/sync 会因 isDeleted 短路而永久跳过该实体。
 */
export function removeTombstoneRecords(
  entityType: SyncTombstone['entityType'],
  entityIds: string[]
): void {
  if (!entityIds.length) return;
  const removing = new Set(entityIds);
  const remaining = loadTombstones().filter(
    (t) => !(t.entityType === entityType && removing.has(t.entityId))
  );
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(remaining));
}
