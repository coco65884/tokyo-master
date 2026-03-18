import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserAchievement } from '@/types';

interface AchievementState {
  achievements: Record<string, UserAchievement>;
  updateAchievement: (achievementId: string, accuracy: number) => void;
  getAchievement: (achievementId: string) => UserAchievement | undefined;
  getAchievedCount: () => number;
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      achievements: {},

      updateAchievement: (achievementId, accuracy) =>
        set((state) => {
          const existing = state.achievements[achievementId];
          const isNewBest = !existing || accuracy > existing.bestAccuracy;
          const achieved = accuracy === 100;

          return {
            achievements: {
              ...state.achievements,
              [achievementId]: {
                achievementId,
                achieved: existing?.achieved || achieved,
                bestAccuracy: isNewBest ? accuracy : (existing?.bestAccuracy ?? 0),
                achievedAt:
                  achieved && !existing?.achieved ? new Date().toISOString() : existing?.achievedAt,
                attempts: (existing?.attempts ?? 0) + 1,
              },
            },
          };
        }),

      getAchievement: (achievementId) => get().achievements[achievementId],

      getAchievedCount: () => Object.values(get().achievements).filter((a) => a.achieved).length,
    }),
    { name: 'tokyo-master-achievements' },
  ),
);
