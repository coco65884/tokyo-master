import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizConfig, QuizResult } from '@/types';

interface QuizState {
  currentConfig: QuizConfig | null;
  results: QuizResult[];
  setConfig: (config: QuizConfig) => void;
  addResult: (result: QuizResult) => void;
  getResultsByScope: (scopeType: string, scopeId: string) => QuizResult[];
  getBestAccuracy: (scopeType: string, scopeId: string) => number;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      currentConfig: null,
      results: [],

      setConfig: (config) => set({ currentConfig: config }),

      addResult: (result) =>
        set((state) => ({
          results: [...state.results, result],
        })),

      getResultsByScope: (scopeType, scopeId) =>
        get().results.filter((r) => r.scopeType === scopeType && r.scopeId === scopeId),

      getBestAccuracy: (scopeType, scopeId) => {
        const results = get().results.filter(
          (r) => r.scopeType === scopeType && r.scopeId === scopeId,
        );
        if (results.length === 0) return 0;
        return Math.max(...results.map((r) => r.accuracy));
      },
    }),
    { name: 'tokyo-master-quiz' },
  ),
);
