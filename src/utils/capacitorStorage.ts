import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { StateStorage } from 'zustand/middleware';

/**
 * Zustand 用 Capacitor Preferences アダプター。
 * ネイティブ環境では UserDefaults/SharedPreferences を使い、
 * iOS の localStorage パージに耐えるデータ永続化を実現する。
 * Web では通常の localStorage にフォールバック。
 */
export const capacitorStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) {
      return localStorage.getItem(name);
    }
    const { value } = await Preferences.get({ key: name });
    return value;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(name, value);
      return;
    }
    await Preferences.set({ key: name, value });
  },

  removeItem: async (name: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(name);
      return;
    }
    await Preferences.remove({ key: name });
  },
};
