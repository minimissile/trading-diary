import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { StockBacktestInput, StockStrategySettings } from '../../../shared/strategy/types';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';
import { registerAiSelectionHandlers } from './ai-selection.handlers';

export function registerStockStrategyHandlers(context: IpcHandlerContext): void {
  const { window, service } = context;
  registerAiSelectionHandlers(context);
  ipcMain.handle(ipcChannels.stockStrategyState, (event) => {
    assertTrustedSender(event, window);
    return service.request('stockStrategy.state', {});
  });
  ipcMain.handle(ipcChannels.stockStrategySave, (event, input: StockStrategySettings) => {
    assertTrustedSender(event, window);
    return service.request('stockStrategy.save', input);
  });
  ipcMain.handle(ipcChannels.stockStrategyScreen, (event, input: { settings: StockStrategySettings; refresh?: boolean }) => {
    assertTrustedSender(event, window);
    return service.request('stockStrategy.screen', input);
  });
  ipcMain.handle(ipcChannels.stockStrategyBacktest, (event, input: StockBacktestInput) => {
    assertTrustedSender(event, window);
    return service.request('stockStrategy.backtest', input);
  });
}
