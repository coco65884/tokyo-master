import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPluginEvents } from '@capacitor-community/admob';
import { showBanner, removeBanner } from '@/utils/adManager';

interface Props {
  margin?: number;
}

function setHeight(px: number) {
  document.documentElement.style.setProperty('--ad-banner-height', `${px}px`);
}

/**
 * ネイティブバナー広告コンポーネント。
 * バナーの実際の高さを CSS 変数 --ad-banner-height に反映する。
 */
export default function BannerAd({ margin = 0 }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // マウント直後に初期値を設定（イベント発火前のレイアウトずれ防止）
    setHeight(60);

    const handles: Array<Awaited<ReturnType<typeof AdMob.addListener>>> = [];

    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      setHeight(size.height);
    }).then((h) => handles.push(h));

    showBanner(margin);

    return () => {
      removeBanner();
      for (const h of handles) h.remove();
      // 変数を削除（0px にしない — CSS fallback を機能させるため）
      document.documentElement.style.removeProperty('--ad-banner-height');
    };
  }, [margin]);

  if (!Capacitor.isNativePlatform()) return null;
  return null;
}
