import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

/** クイズ正解時の軽い振動 */
export async function hapticsCorrect() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}

/** クイズ不正解時のエラー振動 */
export async function hapticsWrong() {
  if (!isNative) return;
  await Haptics.notification({ type: NotificationType.Error });
}

/** 実績解除時の成功振動 */
export async function hapticsAchievement() {
  if (!isNative) return;
  await Haptics.notification({ type: NotificationType.Success });
}

/** 地図操作時の中程度の振動 */
export async function hapticsMapAction() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Medium });
}
