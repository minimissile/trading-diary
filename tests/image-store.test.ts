import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageStore } from '../src/service/assets/image-store';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-runtime-images-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('ImageStore', () => {
  it('按内容哈希保存原图、生成预览图并执行去重', async () => {
    const dataDir = temporaryDirectory();
    const sourcePath = path.join(dataDir, 'source.png');
    await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 3,
        background: { r: 30, g: 90, b: 150 },
      },
    })
      .png()
      .toFile(sourcePath);

    const database = new AppDatabase(path.join(dataDir, 'database', 'app.sqlite'));
    const store = new ImageStore(dataDir, database);
    const first = await store.importFile(sourcePath);
    const second = await store.importFile(sourcePath);

    expect(first.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.width).toBe(800);
    expect(first.height).toBe(400);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.hash).toBe(first.hash);
    expect(store.stats().count).toBe(1);

    const previewPath = await store.resolve(first.hash, 'preview');
    expect(previewPath).not.toBeNull();
    if (!previewPath) throw new Error('无法解析预览图路径');
    expect((await sharp(previewPath).metadata()).width).toBe(640);
    database.close();
  });
});
