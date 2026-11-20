const REMINDER_ID = 42001;

interface LocalNotifications {
  requestPermissions(): Promise<{ display: string }>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
  schedule(options: { notifications: {
    id: number;
    title: string;
    body: string;
    schedule: { on: { weekday: number; hour: number; minute: number }; allowWhileIdle: boolean };
  }[] }): Promise<unknown>;
}

export async function scheduleWeeklyWordReminder(enabled: boolean): Promise<boolean> {
  const capacitor = (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: LocalNotifications } } }).Capacitor;
  const notifications = capacitor?.Plugins?.LocalNotifications;
  if (!notifications) return false;
  if (enabled && (await notifications.requestPermissions()).display !== 'granted') return false;

  await notifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  if (enabled) {
    await notifications.schedule({ notifications: [{
      id: REMINDER_ID,
      title: 'Grow My Words',
      body: 'Open Mimzi to review this week’s word suggestions.',
      schedule: { on: { weekday: 2, hour: 9, minute: 0 }, allowWhileIdle: true },
    }] });
  }
  return true;
}
