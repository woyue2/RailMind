import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DB_NAME = 'railmind_attachments_db';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

let idbPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      idbPromise = null;
      reject(req.error || new Error('打开 IndexedDB 失败'));
    };
  });

  return idbPromise;
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 将 Blob 转为 Base64 字符串（不带 data URL 前缀，供 Capacitor Filesystem 写入使用）
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 Base64 还原为 Blob
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const cleanBase64 = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

/**
 * 本地持久化保存附件：
 * - 原生 Android (Capacitor)：保存在 Directory.Data 专属文件目录中
 * - Web 环境：保存在 IndexedDB 的 Blob 对象存储中
 */
export async function saveLocalAttachment(id: string, blob: Blob): Promise<string> {
  if (isNativePlatform()) {
    const filename = `attachments/${id}`;
    const base64Data = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    });
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Data,
    });
    return Capacitor.convertFileSrc(uriResult.uri);
  } else {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(blob, id);
    });
    return URL.createObjectURL(blob);
  }
}

/**
 * 读取本地附件的 Blob
 */
export async function readLocalAttachmentBlob(id: string, mimeType: string): Promise<Blob | null> {
  if (isNativePlatform()) {
    try {
      const filename = `attachments/${id}`;
      const res = await Filesystem.readFile({
        path: filename,
        directory: Directory.Data,
      });
      if (typeof res.data === 'string') {
        return base64ToBlob(res.data, mimeType);
      } else if (res.data instanceof Blob) {
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  } else {
    try {
      const db = await openIdb();
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }
}

/**
 * 获取可供 <img> 或 <audio> 标签展示/播放的 Web URL
 */
export async function getLocalAttachmentDisplayUrl(id: string, mimeType: string): Promise<string | null> {
  if (isNativePlatform()) {
    try {
      const filename = `attachments/${id}`;
      const uriResult = await Filesystem.getUri({
        path: filename,
        directory: Directory.Data,
      });
      return Capacitor.convertFileSrc(uriResult.uri);
    } catch {
      return null;
    }
  } else {
    const blob = await readLocalAttachmentBlob(id, mimeType);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
}

/**
 * 删除本地存储的附件文件
 */
export async function deleteLocalAttachment(id: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      const filename = `attachments/${id}`;
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });
    } catch {
      // 忽略文件不存在等异常
    }
  } else {
    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE_NAME).delete(id);
      });
    } catch {
      // 忽略
    }
  }
}
