import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_IMAGES = 20;
const MAX_BASE64_LENGTH = 20_000_000;

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface LedgerImportPasteImageInput {
  data: string;
  mimeType: string;
}

export interface LedgerImportPasteImageResult {
  sourcePaths: string[];
  fileNames: string[];
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  return MIME_EXTENSION[normalized] ?? 'png';
}

/** 将粘贴的 base64 图片写入临时目录，供 AI 识图读取。 */
export async function saveLedgerImportPasteImages(
  dataDir: string,
  images: LedgerImportPasteImageInput[],
): Promise<LedgerImportPasteImageResult> {
  if (images.length === 0) throw new Error('没有可保存的图片');
  if (images.length > MAX_IMAGES) throw new Error(`一次最多粘贴 ${MAX_IMAGES} 张截图`);

  const sessionDir = path.join(dataDir, '.ledger-import-temp', randomUUID());
  await mkdir(sessionDir, { recursive: true });

  const sourcePaths: string[] = [];
  const fileNames: string[] = [];
  const stamp = Date.now();

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]!;
    const cleaned = image.data.trim();
    if (!cleaned) continue;
    if (cleaned.length > MAX_BASE64_LENGTH) {
      throw new Error('粘贴的图片过大，请换一张更小的截图');
    }

    const extension = extensionForMime(image.mimeType);
    const fileName = `paste-${stamp}-${index + 1}.${extension}`;
    const filePath = path.join(sessionDir, fileName);
    await writeFile(filePath, Buffer.from(cleaned, 'base64'));
    sourcePaths.push(filePath);
    fileNames.push(fileName);
  }

  if (sourcePaths.length === 0) {
    throw new Error('粘贴内容中没有有效图片');
  }

  return { sourcePaths, fileNames };
}

const PREVIEW_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** 读取本地截图并转为 data URL，供渲染进程预览。 */
export async function readLedgerImportImagePreviews(sourcePaths: string[]): Promise<string[]> {
  return Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const extension = path.extname(sourcePath).slice(1).toLowerCase();
      const mimeType = PREVIEW_MIME[extension] ?? 'image/png';
      const data = await readFile(sourcePath);
      return `data:${mimeType};base64,${data.toString('base64')}`;
    }),
  );
}
