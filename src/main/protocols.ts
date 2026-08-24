import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import type { ServiceHost } from './service-host';

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function responseStatus(status: number): Response {
  return new Response(status === 404 ? '资源不存在' : '请求无效', { status });
}

export function registerProtocolHandlers(service: ServiceHost): () => void {
  const rendererRoot = path.join(__dirname, '../renderer');

  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'renderer') return responseStatus(404);

      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html';
      const filePath = path.resolve(rendererRoot, relativePath);
      if (!filePath.startsWith(`${rendererRoot}${path.sep}`)) return responseStatus(400);

      const body = await readFile(filePath);
      const contentType = contentTypes[path.extname(filePath)] ?? 'application/octet-stream';
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return responseStatus(404);
    }
  });

  protocol.handle('app-asset', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'preview' && url.hostname !== 'original') return responseStatus(404);

      const hash = url.pathname.replace(/^\//u, '');
      const variant = url.hostname;
      const { filePath } = await service.request('assets.resolve', { hash, variant });
      if (!filePath) return responseStatus(404);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return responseStatus(400);
    }
  });

  return () => {
    protocol.unhandle('app');
    protocol.unhandle('app-asset');
  };
}
