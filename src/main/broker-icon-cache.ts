import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { net } from 'electron';
import { getBrokerIconCandidates } from '../shared/accounts/brokers';
import type { AccountBroker } from '../shared/accounts/types';

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
};

function cacheDirFor(userDataDir: string): string {
  return path.join(userDataDir, 'broker-icons');
}

function cacheFilePath(userDataDir: string, brokerId: AccountBroker, ext: string): string {
  return path.join(cacheDirFor(userDataDir), `${brokerId}${ext}`);
}

async function readCachedIcon(
  userDataDir: string,
  brokerId: AccountBroker,
): Promise<{ body: Buffer; contentType: string } | null> {
  for (const ext of ['.png', '.ico', '.webp', '.gif', '.jpg']) {
    const filePath = cacheFilePath(userDataDir, brokerId, ext);
    try {
      await access(filePath);
      const body = await readFile(filePath);
      if (body.length < 32) continue;
      return { body, contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream' };
    } catch {
      // try next extension
    }
  }
  return null;
}

function extensionFromContentType(contentType: string): string {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXT_BY_MIME[mime] ?? '.ico';
}

async function fetchAndCacheIcon(
  userDataDir: string,
  brokerId: AccountBroker,
): Promise<{ body: Buffer; contentType: string } | null> {
  await mkdir(cacheDirFor(userDataDir), { recursive: true });

  for (const url of getBrokerIconCandidates(brokerId)) {
    try {
      const response = await net.fetch(url, { redirect: 'follow' });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.startsWith('image/')) continue;

      const body = Buffer.from(await response.arrayBuffer());
      if (body.length < 32) continue;

      const ext = extensionFromContentType(contentType);
      await writeFile(cacheFilePath(userDataDir, brokerId, ext), body);
      return {
        body,
        contentType: MIME_BY_EXT[ext] ?? (contentType || 'application/octet-stream'),
      };
    } catch {
      // try next candidate
    }
  }

  return null;
}

/** 读取或拉取券商 favicon，缓存到 userData/broker-icons。 */
export async function resolveBrokerIcon(
  userDataDir: string,
  brokerId: AccountBroker,
): Promise<{ body: Buffer; contentType: string } | null> {
  const cached = await readCachedIcon(userDataDir, brokerId);
  if (cached) return cached;
  return fetchAndCacheIcon(userDataDir, brokerId);
}
