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
 * バナー広告の裏にコンテンツが透けないよう、下部に白い遮蔽バーを表示する。
 */
export default function BannerAd({ margin = 0 }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    setHeight(60);

    const handles: Array<Awaited<ReturnType<typeof AdMob.addListener>>> = [];

    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      setHeight(size.height);
    }).then((h) => handles.push(h));

    showBanner(margin);

    return () => {
      removeBanner();
      for (const h of handles) h.remove();
      document.documentElement.style.removeProperty('--ad-banner-height');
    };
  }, [margin]);

  if (!Capacitor.isNativePlatform()) return null;

  // バナー広告 + safe area 領域を白で塗りつぶす固定バー
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(var(--ad-banner-height, 60px) + env(safe-area-inset-bottom))',
        background: '#ffffff',
        zIndex: 900,
        pointerEvents: 'none',
      }}
    />
  );
}
