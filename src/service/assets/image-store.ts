import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AssetStats, ImportedAsset } from '../../shared/api.types';
import type { AppDatabase } from '../database/database';

const PREVIEW_MAX_EDGE = 640;

const formatExtension: Readonly<Record<string, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  tiff: 'tiff',
  avif: 'avif',
  heif: 'heif',
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function commitTemporaryFile(temporaryPath: string, targetPath: string): Promise<void> {
  if (await exists(targetPath)) {
    await rm(temporaryPath, { force: true });
    return;
  }
  await rename(temporaryPath, targetPath);
}

export class ImageStore {
  private readonly assetsRoot: string;

  constructor(
    dataDir: string,
    private readonly database: AppDatabase,
  ) {
    this.assetsRoot = path.join(dataDir, 'assets');
  }

  async importFile(sourcePath: string): Promise<ImportedAsset> {
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) throw new Error('所选路径不是文件');

    const metadata = await sharp(sourcePath, { failOn: 'error' }).metadata();
    const extension = metadata.format ? formatExtension[metadata.format] : undefined;
    if (!extension || !metadata.format) throw new Error('不支持的图片格式');

    const hash = await sha256(sourcePath);
    const duplicate = this.database.hasAsset(hash);
    const shard = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const originalRelative = path.join('original', shard, `${hash}.${extension}`);
    const previewRelative = path.join('preview', shard, `${hash}.webp`);
    const originalPath = path.join(this.assetsRoot, originalRelative);
    const previewPath = path.join(this.assetsRoot, previewRelative);

    await Promise.all([
      mkdir(path.dirname(originalPath), { recursive: true }),
      mkdir(path.dirname(previewPath), { recursive: true }),
    ]);

    if (!duplicate) {
      const originalTemporary = `${originalPath}.tmp-${randomUUID()}`;
      const previewTemporary = `${previewPath}.tmp-${randomUUID()}`;

      try {
        await Promise.all([
          copyFile(sourcePath, originalTemporary),
          sharp(sourcePath, { failOn: 'error' })
            .rotate()
            .resize({
              width: PREVIEW_MAX_EDGE,
              height: PREVIEW_MAX_EDGE,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toFile(previewTemporary),
        ]);

        await Promise.all([
          commitTemporaryFile(originalTemporary, originalPath),
          commitTemporaryFile(previewTemporary, previewPath),
        ]);
      } catch (error) {
        await Promise.all([rm(originalTemporary, { force: true }), rm(previewTemporary, { force: true })]);
        throw error;
      }
    }

    const previewStats = await stat(previewPath);
    this.database.insertAsset({
      hash,
      originalName: path.basename(sourcePath),
      mediaType: `image/${metadata.format}`,
      originalBytes: sourceStats.size,
      previewBytes: previewStats.size,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      originalPath,
      previewPath,
      createdAt: new Date().toISOString(),
    });

    return {
      hash,
      mediaType: `image/${metadata.format}`,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      originalBytes: sourceStats.size,
      previewUrl: `app-asset://preview/${hash}`,
      duplicate,
    };
  }

  stats(): AssetStats {
    return this.database.assetStats();
  }

  async resolve(hash: string, variant: 'original' | 'preview'): Promise<string | null> {
    const filePath = this.database.assetPath(hash, variant);
    if (!filePath || !(await exists(filePath))) return null;
    return filePath;
  }
}
