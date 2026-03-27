import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { showBanner, removeBanner } from '@/utils/adManager';

interface Props {
  /** バナー下部のマージン (px) */
  margin?: number;
}

/**
 * ネイティブバナー広告コンポーネント。
 * マウント時にバナーを表示し、アンマウント時に削除する。
 * Web 環境では何も表示しない。
 */
export default function BannerAd({ margin = 0 }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    showBanner(margin);
    return () => {
      removeBanner();
    };
  }, [margin]);

  // ネイティブバナーは WebView の外に表示されるため、
  // コンテンツが広告で隠れないようスペーサーを挿入
  if (!Capacitor.isNativePlatform()) return null;

  return <div style={{ height: 60 }} />;
}
