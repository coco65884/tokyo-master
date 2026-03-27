import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIFICATION_ID = 1001;
const STORAGE_KEY = 'tokyo-master-notification-settings';

export interface NotificationSettings {
  enabled: boolean;
  /** "HH:MM" 形式 (例: "19:00") */
  time: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  time: '19:00',
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveNotificationSettings(settings: NotificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** デイリーリマインダーをスケジュール */
export async function scheduleDailyReminder(time: string) {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return;

  // 既存の通知をキャンセル
  await cancelDailyReminder();

  const [hours, minutes] = time.split(':').map(Number);

  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: 'Tokyo Master',
        body: '今日のクイズに挑戦しよう！',
        schedule: {
          on: { hour: hours, minute: minutes },
          repeats: true,
        },
        actionTypeId: 'OPEN_QUIZ',
      },
    ],
  });
}

/** デイリーリマインダーをキャンセル */
export async function cancelDailyReminder() {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
}

/** 通知タップ時のリスナーを登録 */
export async function setupNotificationListeners() {
  if (!Capacitor.isNativePlatform()) return;

  await LocalNotifications.addListener('localNotificationActionPerformed', () => {
    // /quiz に遷移
    window.location.href = '/quiz';
  });
}
