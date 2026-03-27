import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { AdMob } from '@capacitor-community/admob';
import {
  getNotificationSettings,
  scheduleDailyReminder,
  setupNotificationListeners,
} from './notifications';
import { initializeAdMob } from './adManager';

/**
 * ネイティブプラットフォーム固有の初期化処理。
 * アプリ起動時に一度だけ呼び出す。
 */
export async function nativeInit() {
  if (!Capacitor.isNativePlatform()) return;

  // Status Bar: テーマカラーに合わせた設定
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // ignore
  }

  // Keyboard: WebView のリサイズを無効化して手動スクロールで対応
  try {
    await Keyboard.setResizeMode({ mode: 'none' as never });
    await Keyboard.setScroll({ isDisabled: true });
  } catch {
    // ignore
  }

  // ATT (App Tracking Transparency) — 広告初期化前に必須
  try {
    await AdMob.requestTrackingAuthorization();
  } catch {
    // ignore (Android or user denied)
  }

  // AdMob 初期化
  await initializeAdMob();

  // 通知リスナーのセットアップ
  await setupNotificationListeners();

  // 保存済みの通知設定があればスケジュールを復元
  const settings = getNotificationSettings();
  if (settings.enabled) {
    await scheduleDailyReminder(settings.time);
  }
}
