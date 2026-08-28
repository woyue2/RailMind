/**
 * 图片处理工具函数（参考 1YiShiZhuXing 的 Canvas 压缩方案）
 */

export const MAX_NOTE_IMAGES = 4;

/**
 * 前端 Canvas 图片等比缩放与 JPEG 压缩
 * @param file 原始图片文件
 * @param maxDim 最大边长（默认 1080px）
 * @param quality JPEG 压缩质量 (0.1 ~ 1.0，默认 0.8)
 * @returns Base64 Data URL 字符串
 */
export function compressImage(
  file: File,
  maxDim: number = 1080,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 等比缩放到 maxDim 以内
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // 导出 JPEG 格式 Base64，兼顾体积与清晰度
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (e) => reject(e);
      img.src = reader.result as string;
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * 批量安全处理选中的图片文件列表
 */
export async function processImageFiles(
  files: FileList | File[],
  currentCount: number = 0
): Promise<{ compressed: string[]; error?: string }> {
  const fileArray = Array.from(files);
  if (!fileArray.length) return { compressed: [] };

  const availableSlots = Math.max(0, MAX_NOTE_IMAGES - currentCount);
  if (availableSlots <= 0) {
    return { compressed: [], error: `最多只能添加 ${MAX_NOTE_IMAGES} 张图片` };
  }

  let error: string | undefined;
  let toProcess = fileArray;
  if (fileArray.length > availableSlots) {
    toProcess = fileArray.slice(0, availableSlots);
    error = `已达到上限，已为你添加前 ${availableSlots} 张图片`;
  }

  const results: string[] = [];
  for (const f of toProcess) {
    if (!f.type.startsWith('image/')) continue;
    try {
      const base64 = await compressImage(f);
      results.push(base64);
    } catch (err) {
      console.error('图片压缩失败:', err);
    }
  }

  return { compressed: results, error };
}
