import { useEffect } from 'react';
import { playConfiguredReminderSound } from '../lib/reminder-sound';

export function ReminderSoundListener(): null {
  useEffect(() => {
    return window.desktop.notifications.onReminder(() => {
      void playConfiguredReminderSound().catch(() => undefined);
    });
  }, []);

  return null;
}
