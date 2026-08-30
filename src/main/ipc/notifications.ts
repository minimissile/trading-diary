import { Notification, type BrowserWindow } from 'electron';
import { ipcChannels } from '../../shared/ipc-channels';
import type { AlertEvent } from '../../shared/alerts/event-types';
import type { FundSipOccurrenceView } from '../../shared/sip/types';

export function notifyTriggeredAlerts(window: BrowserWindow, events: readonly AlertEvent[]): void {
  if (events.length === 0) return;

  if (Notification.isSupported()) {
    for (const event of events) {
      const notification = new Notification({
        title: `${event.symbol} · 提醒已触发`,
        body: `${event.title}｜触发价 ${event.triggerPrice}，目标价 ${event.targetPrice}`,
      });
      notification.on('click', () => {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });
      notification.show();
    }
  }

  if (!window.isDestroyed()) {
    window.webContents.send(ipcChannels.workspaceChanged);
  }
}

export function notifyDueSipOccurrences(window: BrowserWindow, occurrences: readonly FundSipOccurrenceView[]): void {
  if (occurrences.length === 0) return;

  if (Notification.isSupported()) {
    for (const occurrence of occurrences) {
      const notification = new Notification({
        title: `${occurrence.symbol} · 定投待确认`,
        body: `${occurrence.planName}｜计划扣款 ¥${occurrence.plannedAmount.toFixed(2)} · ${occurrence.scheduledDate}`,
      });
      notification.on('click', () => {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });
      notification.show();
    }
  }

  if (!window.isDestroyed()) {
    window.webContents.send(ipcChannels.workspaceChanged);
  }
}
