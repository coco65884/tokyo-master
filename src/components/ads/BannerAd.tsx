import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPluginEvents } from '@capacitor-community/admob';
import { showBanner, removeBanner } from '@/utils/adManager';

interface Props {
  /** バナー下部のマージン (px) */
  margin?: number;
}

/**
 * ネイティブバナー広告コンポーネント。
 * マウント時にバナーを表示し、アンマウント時に削除する。
 * バナーの実際の高さを CSS 変数 --ad-banner-height に反映する。
 * Web 環境では何も表示しない。
 */
export default function BannerAd({ margin = 0 }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: Awaited<ReturnType<typeof AdMob.addListener>> | null = null;

    // バナーサイズ変更イベントで実際の高さを CSS 変数に反映
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      document.documentElement.style.setProperty('--ad-banner-height', `${size.height}px`);
    }).then((handle) => {
      listenerHandle = handle;
    });

    showBanner(margin);

    return () => {
      removeBanner();
      listenerHandle?.remove();
      document.documentElement.style.setProperty('--ad-banner-height', '0px');
    };
  }, [margin]);

  if (!Capacitor.isNativePlatform()) return null;

  return null;
}
