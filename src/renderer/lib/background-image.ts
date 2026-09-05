const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_STORED_LENGTH = 1_400_000;

/** Decode and normalize uploads so stored backgrounds are bounded, static raster images. */
export async function prepareBackgroundImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('图片不能超过 15 MB。');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('无法读取这张图片，请换一张图片重试。');
  }
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片处理失败，请重试。');
    context.fillStyle = '#07122f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.56, 0.4]) {
      const result = canvas.toDataURL('image/webp', quality);
      if (result.length <= MAX_STORED_LENGTH) return result;
    }
    throw new Error('图片细节过多，请选择尺寸更小的图片。');
  } finally {
    bitmap.close();
  }
}

export function isStoredBackgroundImage(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_STORED_LENGTH && /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}
