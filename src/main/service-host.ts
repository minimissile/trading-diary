import { randomUUID } from 'node:crypto';
import { utilityProcess, type UtilityProcess } from 'electron';
import serviceModulePath from '../service/index?modulePath';
import type {
  MainToServiceMessage,
  ServiceContract,
  ServiceMethod,
  ServiceResponse,
  ServiceToMainMessage,
} from '../shared/service.types';

const START_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class ServiceHost {
  private child: UtilityProcess | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private ready = false;

  async start(dataDir: string): Promise<void> {
    if (this.child) return;

    const child = utilityProcess.fork(serviceModulePath, [], {
      serviceName: '交易日记后台服务',
      stdio: 'pipe',
      // Sharp 会加载原生 .node 模块。在 macOS 上启用此项后，Electron 会选择
      // 具备相应签名权限的 Plugin Helper 来运行后台服务。
      allowLoadingUnsignedLibraries: process.platform === 'darwin',
    });

    this.child = child;
    child.stdout?.on('data', (chunk: Buffer) => console.info('[service]', chunk.toString().trimEnd()));
    child.stderr?.on('data', (chunk: Buffer) => console.error('[service]', chunk.toString().trimEnd()));
    child.on('message', (message: ServiceToMainMessage) => this.handleMessage(message));
    child.on('exit', (code) => this.handleExit(code));

    await new Promise<void>((resolve, reject) => {
      const finish = (callback: () => void): void => {
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
        callback();
      };

      const timeout = setTimeout(
        () => finish(() => reject(new Error('后台服务启动超时'))),
        START_TIMEOUT_MS,
      );

      const onMessage = (message: ServiceToMainMessage): void => {
        if (message.type === 'service:ready') {
          finish(resolve);
        }
        if (message.type === 'service:fatal') {
          finish(() => reject(new Error(message.message)));
        }
      };

      const onExit = (code: number): void => {
        finish(() => reject(new Error(`后台服务在启动期间退出，退出码：${code}`)));
      };

      const onError = (type: 'FatalError', location: string, report: string): void => {
        finish(() => reject(new Error(`${location} 发生 ${type}：${report}`)));
      };

      child.on('message', onMessage);
      child.on('exit', onExit);
      child.on('error', onError);
      this.post({ type: 'service:init', dataDir });
    });
  }

  async request<M extends ServiceMethod>(
    method: M,
    params: ServiceContract[M]['params'],
  ): Promise<ServiceContract[M]['result']> {
    if (!this.child || !this.ready) throw new Error('后台服务尚未就绪');

    const id = randomUUID();
    const result = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`后台服务请求超时：${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });
    });

    this.post({
      type: 'service:request',
      request: { id, method, params } as never,
    });

    return (await result) as ServiceContract[M]['result'];
  }

  stop(): void {
    if (!this.child) return;
    this.post({ type: 'service:shutdown' });
    this.child = null;
    this.ready = false;
  }

  private post(message: MainToServiceMessage): void {
    this.child?.postMessage(message);
  }

  private handleMessage(message: ServiceToMainMessage): void {
    if (message.type === 'service:ready') {
      this.ready = true;
      return;
    }

    if (message.type === 'service:fatal') {
      this.rejectAll(new Error(message.message));
      return;
    }

    this.settleResponse(message.response);
  }

  private settleResponse(response: ServiceResponse): void {
    const request = this.pending.get(response.id);
    if (!request) return;

    clearTimeout(request.timeout);
    this.pending.delete(response.id);

    if (response.ok) request.resolve(response.data);
    else request.reject(new Error(`${response.error.code}: ${response.error.message}`));
  }

  private handleExit(code: number): void {
    this.child = null;
    this.ready = false;
    this.rejectAll(new Error(`后台服务已退出，退出码：${code}`));
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
