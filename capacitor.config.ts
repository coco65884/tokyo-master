import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tokyomaster.app',
  appName: 'Tokyo Master',
  webDir: 'dist',
  server: {
    // 本番ビルドではローカルファイルを使用（サーバー不要）
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Tokyo Master',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      backgroundColor: '#1a73e8',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#1a73e8',
    },
    Keyboard: {
      resize: 'none',
    },
  },
};

export default config;
