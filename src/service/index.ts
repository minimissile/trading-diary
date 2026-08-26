import { serviceRequestSchema } from '../shared/service.schemas';
import { LlmError } from '../shared/llm/errors';
import { LicenseError } from '../shared/license/errors';
import type { MainToServiceMessage, ServiceStreamEvent, ServiceToMainMessage } from '../shared/service.types';
import { AppService } from './app-service';

const parentPort = process.parentPort;
if (!parentPort) throw new Error('后台服务必须运行在 Electron Utility Process 中');

let service: AppService | null = null;

function post(message: ServiceToMainMessage): void {
  parentPort?.postMessage(message);
}

parentPort.on('message', (event: { data: MainToServiceMessage }) => {
  const message = event.data;

  if (message.type === 'service:init') {
    try {
      service = new AppService(message.dataDir);
      post({ type: 'service:ready' });
    } catch (error) {
      post({
        type: 'service:fatal',
        message: error instanceof Error ? error.message : '后台服务初始化失败',
      });
    }
    return;
  }

  if (message.type === 'service:shutdown') {
    service?.close();
    service = null;
    process.exit(0);
  }

  if (message.type === 'service:stream-cancel') {
    service?.cancelStream(message.streamId);
    return;
  }

  if (message.type === 'service:stream-request') {
    if (!service) {
      post({
        type: 'service:stream-event',
        streamId: message.streamId,
        event: { type: 'error', code: 'SERVICE_ERROR', message: '后台服务尚未初始化' },
      });
      return;
    }

    void service.handleStream(message.streamId, message.method, message.params, (event: ServiceStreamEvent) => {
      post({ type: 'service:stream-event', streamId: message.streamId, event });
    });
    return;
  }

  if (!service) {
    post({ type: 'service:fatal', message: '后台服务尚未初始化' });
    return;
  }

  if (message.type !== 'service:request') return;

  const parsed = serviceRequestSchema.safeParse(message.request);
  if (!parsed.success) {
    post({
      type: 'service:response',
      response: {
        id: message.request.id,
        ok: false,
        error: { code: 'INVALID_REQUEST', message: '后台服务请求校验失败' },
      },
    });
    return;
  }

  void service
    .handle(parsed.data)
    .then((data) => {
      post({
        type: 'service:response',
        response: { id: parsed.data.id, ok: true, data },
      });
    })
    .catch((error: unknown) => {
      post({
        type: 'service:response',
        response: {
          id: parsed.data.id,
          ok: false,
          error: {
            code:
              error instanceof LlmError
                ? error.code
                : error instanceof LicenseError
                  ? error.code
                  : 'SERVICE_ERROR',
            message: error instanceof Error ? error.message : '未知后台服务错误',
          },
        },
      });
    });
});
