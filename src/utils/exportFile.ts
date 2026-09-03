import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportJsonFile(filename: string, data: unknown): Promise<'download' | 'shared' | 'dismissed'> {
  const json = JSON.stringify(data, null, 2);
  if (Capacitor.isNativePlatform()) {
    // Keep the cache file available while the receiving app reads it.
    const { uri } = await Filesystem.writeFile({
      path: `exports/${Date.now()}/${filename}`,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      const result = await Share.share({ files: [uri], title: filename, dialogTitle: '导出最近 7 天' });
      return result.activityType ? 'shared' : 'dismissed';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel|canceled|cancelled|abort/i.test(message)) return 'dismissed';
      throw error;
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return 'download';
}
