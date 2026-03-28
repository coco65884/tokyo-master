import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPluginEvents } from '@capacitor-community/admob';
import { showBanner, removeBanner } from '@/utils/adManager';

interface Props {
  /** バナー下部のマージン (px) */
  margin?: number;
}

function setBannerHeight(height: number) {
  document.documentElement.style.setProperty('--ad-banner-height', `${height}px`);
}

/**
 * ネイティブバナー広告コンポーネント。
 * マウント時にバナーを表示し、アンマウント時に削除する。
 * バナーの実際の高さを CSS 変数 --ad-banner-height に反映する。
 */
export default function BannerAd({ margin = 0 }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handles: Array<Awaited<ReturnType<typeof AdMob.addListener>>> = [];

    // SizeChanged で実際の高さを取得
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      setBannerHeight(size.height);
    }).then((h) => handles.push(h));

    // Loaded のフォールバック: SizeChanged が来ない場合に備える
    AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      // SizeChanged で設定済みでなければデフォルト値を使う
      const current = getComputedStyle(document.documentElement)
        .getPropertyValue('--ad-banner-height')
        .trim();
      if (current === '0px' || current === '') {
        setBannerHeight(60);
      }
    }).then((h) => handles.push(h));

    showBanner(margin);

    return () => {
      removeBanner();
      for (const h of handles) h.remove();
      setBannerHeight(0);
    };
  }, [margin]);

  if (!Capacitor.isNativePlatform()) return null;

  return null;
}
