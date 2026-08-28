/**
 * 图片处理工具函数（参考 1YiShiZhuXing 的 Canvas 压缩方案）
 */

export const MAX_NOTE_IMAGES = 4;

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_BYTES = 400 * 1024;
const IMAGE_FILE_EXTENSION = /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;

function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_FILE_EXTENSION.test(file.name);
}

function getDataUrlByteLength(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

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
    const img = new Image();

    reader.onerror = () => reject(new Error('无法读取图片文件'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('图片文件格式无效'));
        return;
      }

      img.onload = () => {
        try {
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          if (!width || !height) {
            reject(new Error('图片尺寸无效'));
            return;
          }

          // 等比缩放到 maxDim 以内，必要时继续压缩以避免占满 WebView 本地存储。
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          let dataUrl = '';
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('当前设备不支持图片处理');

            ctx.drawImage(img, 0, 0, width, height);
            dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.5, quality - attempt * 0.1));
            if (!dataUrl.startsWith('data:image/jpeg') || getDataUrlByteLength(dataUrl) <= MAX_COMPRESSED_IMAGE_BYTES) {
              break;
            }

            width = Math.max(1, Math.round(width * 0.82));
            height = Math.max(1, Math.round(height * 0.82));
          }

          if (!dataUrl) throw new Error('图片压缩失败');
          resolve(dataUrl);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('图片压缩失败'));
        } finally {
          img.src = '';
        }
      };
      img.onerror = () => reject(new Error('图片无法解码，请选择 JPG、PNG 或 WebP 格式'));
      img.src = reader.result;
    };
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

  const imageFiles = fileArray.filter(isImageFile);
  const rejectedCount = fileArray.length - imageFiles.length;
  const toProcess = imageFiles.slice(0, availableSlots);
  const overLimitCount = Math.max(0, imageFiles.length - toProcess.length);
  const results: string[] = [];
  let failedCount = 0;

  for (const file of toProcess) {
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      failedCount += 1;
      continue;
    }

    try {
      const base64 = await compressImage(file);
      results.push(base64);
    } catch (error) {
      failedCount += 1;
      console.error('图片压缩失败:', error);
    }
  }

  const messages: string[] = [];
  if (rejectedCount > 0) messages.push(`${rejectedCount} 个文件不是图片`);
  if (overLimitCount > 0) messages.push(`最多只能添加 ${MAX_NOTE_IMAGES} 张图片`);
  if (failedCount > 0) messages.push(`${failedCount} 张图片无法读取或格式不支持`);

  if (!results.length && !messages.length) {
    messages.push('未能处理所选图片，请重试');
  }

  return { compressed: results, error: messages.length ? messages.join('，') : undefined };
}
