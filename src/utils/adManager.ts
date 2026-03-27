import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

// テスト用広告 ID (本番リリース時に実際の広告IDに差し替え)
const AD_IDS = {
  banner:
    Capacitor.getPlatform() === 'ios'
      ? 'ca-app-pub-3940256099942544/2934735716' // iOS test banner
      : 'ca-app-pub-3940256099942544/6300978111', // Android test banner
  interstitial:
    Capacitor.getPlatform() === 'ios'
      ? 'ca-app-pub-3940256099942544/4411468910' // iOS test interstitial
      : 'ca-app-pub-3940256099942544/1033173712', // Android test interstitial
};

let initialized = false;
let quizCompletionCount = 0;
const INTERSTITIAL_INTERVAL = 3;

/** AdMob SDK の初期化 */
export async function initializeAdMob() {
  if (!Capacitor.isNativePlatform() || initialized) return;

  try {
    await AdMob.initialize({
      initializeForTesting: true, // TODO: 本番リリース時に false に変更
    });
    initialized = true;
  } catch {
    // ignore
  }
}

/** バナー広告を表示 */
export async function showBanner(margin = 0) {
  if (!Capacitor.isNativePlatform() || !initialized) return;

  try {
    await AdMob.showBanner({
      adId: AD_IDS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin,
      isTesting: true, // TODO: 本番リリース時に削除
    });
  } catch {
    // ignore
  }
}

/** バナー広告を非表示 */
export async function hideBanner() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await AdMob.hideBanner();
  } catch {
    // ignore
  }
}

/** バナー広告を削除 */
export async function removeBanner() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await AdMob.removeBanner();
  } catch {
    // ignore
  }
}

/** インタースティシャルを表示すべきかどうか (3回に1回) */
export function shouldShowInterstitial(): boolean {
  quizCompletionCount++;
  return quizCompletionCount % INTERSTITIAL_INTERVAL === 0;
}

/** インタースティシャル広告を準備して表示 */
export async function showInterstitial(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return;

  try {
    await AdMob.prepareInterstitial({
      adId: AD_IDS.interstitial,
      isTesting: true, // TODO: 本番リリース時に削除
    });
    await AdMob.showInterstitial();
  } catch {
    // 読み込み失敗やユーザーキャンセル
  }
}
