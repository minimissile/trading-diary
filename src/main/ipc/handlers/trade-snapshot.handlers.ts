import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import { tradeSnapshotInputSchema, type TradeSnapshotPayload } from '../../../shared/chart/trade-snapshot';
import { buildChartTradeMarkers } from '../../../shared/chart/trade-markers';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerTradeSnapshotHandlers({ window: parent, service }: IpcHandlerContext): void {
  let job: { child: BrowserWindow; payload: Promise<TradeSnapshotPayload>; finish: (error?: Error, image?: string) => void; capturing: boolean } | null = null;

  ipcMain.handle(ipcChannels.tradeSnapshotOpen, (event, raw: unknown) => {
    assertTrustedSender(event, parent);
    const trade = tradeSnapshotInputSchema.parse(raw);
    if (job) throw new Error('已有快照窗口正在生成，请稍候');
    const child = new BrowserWindow({
      parent, width: 1280, height: 840, useContentSize: true, resizable: false,
      title: `${trade.name} · 交易 K 线快照`, backgroundColor: '#0e181f',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false,
        partition: `trade-snapshot-${randomUUID()}`,
      },
    });
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (navigation) => navigation.preventDefault());
    const payload = (async (): Promise<TradeSnapshotPayload> => {
      const tradeTime = Date.parse(trade.tradeAt);
      // Daily bars through the trade date: no later trading days in historical snapshots.
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: trade.venue === 'US' ? 'America/New_York' : 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
      const tradeDay = date.format(tradeTime);
      const [result, entries] = await Promise.all([
        service.request('market.listKlines', { symbol: `${trade.venue}:${trade.symbol}`, period: '1d', adjust: 'none', limit: 240, beforeTimestamp: tradeTime + 86_400_000 }),
        service.request('portfolio.listLedgerEntries', { accountId: trade.accountId, symbol: trade.symbol }),
      ]);
      const bars = result.bars.filter((bar) => date.format(bar.timestamp) <= tradeDay);
      if (!bars.length) throw new Error('该交易日期暂无可用行情，未生成快照');
      const history = entries.filter((entry) => entry.venue === trade.venue && entry.id !== trade.editingId && Date.parse(entry.tradeAt) <= tradeTime);
      const markers = buildChartTradeMarkers([...history, {
        ...trade, id: 'snapshot-current-trade', source: 'manual', planId: null,
        note: '本次交易（快照生成时尚未保存）', sipOccurrenceId: null, cashOutflow: null, createdAt: trade.tradeAt,
      }], '1d');
      const current = markers.find((marker) => marker.id === 'snapshot-current-trade');
      if (current) { current.label = trade.side === 'buy' ? '本买' : '本卖'; current.color = '#e3bb73'; }
      return { trade, bars, markers };
    })();
    // The renderer consumes the same promise; suppress an unhandled rejection before it connects.
    void payload.catch(() => undefined);
    return new Promise<string>((resolve, reject) => {
      const finish = (error?: Error, image?: string): void => {
        if (job?.child !== child) return;
        job = null;
        clearTimeout(timeout);
        parent.removeListener('closed', onParentClosed);
        if (!child.isDestroyed()) child.destroy();
        if (error) reject(error); else resolve(image!);
      };
      const onParentClosed = (): void => finish(new Error('主窗口已关闭'));
      const timeout = setTimeout(() => finish(new Error('K 线快照生成超时，请重试')), 90_000);
      job = { child, payload, finish, capturing: false };
      parent.once('closed', onParentClosed);
      child.once('closed', () => finish(new Error('已取消快照')));
      child.webContents.once('render-process-gone', () => finish(new Error('快照窗口异常退出')));
      const url = new URL(process.env.ELECTRON_RENDERER_URL ?? 'app://renderer/index.html');
      url.hash = '/trade-snapshot';
      void child.loadURL(url.toString()).catch((error: Error) => finish(error));
    });
  });

  ipcMain.handle(ipcChannels.tradeSnapshotCancel, (event) => {
    assertTrustedSender(event, parent);
    job?.finish(new Error('已取消快照'));
  });
  ipcMain.handle(ipcChannels.tradeSnapshotPayload, (event) => {
    if (!job) throw new Error('快照任务已结束');
    assertTrustedSender(event, job.child);
    return job.payload;
  });
  ipcMain.handle(ipcChannels.tradeSnapshotReady, async (event, error?: string) => {
    const current = job;
    if (!current) throw new Error('快照任务已结束');
    assertTrustedSender(event, current.child);
    if (error) { current.finish(new Error(String(error).slice(0, 300))); return; }
    if (current.capturing) return;
    current.capturing = true;
    try {
      const image = await current.child.webContents.capturePage();
      if (image.isEmpty()) throw new Error('截图为空，请重试');
      const dataUrl = image.toDataURL();
      if (dataUrl.length > 4_000_000) throw new Error('截图过大，请重试');
      current.finish(undefined, dataUrl);
    } catch (reason) {
      current.finish(reason instanceof Error ? reason : new Error('截图失败'));
    }
  });
}
