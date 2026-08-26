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

export function getSecretAccessKey(): string {
  return localStorage.getItem(R2_SECRET_KEY) ?? '';
}

export function setSecretAccessKey(value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(R2_SECRET_KEY, trimmed);
  } else {
    localStorage.removeItem(R2_SECRET_KEY);
  }
}

export function clearSecretAccessKey(): void {
  localStorage.removeItem(R2_SECRET_KEY);
}

export function isR2Configured(): boolean {
  const settings = loadR2Settings();
  return Boolean(
    settings.accountId.trim() &&
    settings.accessKeyId.trim() &&
    settings.bucketName.trim() &&
    getSecretAccessKey().trim()
  );
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
