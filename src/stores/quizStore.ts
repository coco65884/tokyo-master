import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizConfig, QuizResult } from '@/types';

export interface SpeedRunRecord {
  lineKey: string;
  lineName: string;
  elapsedMs: number;
  accuracy: number;
  completedAt: string;
}

interface QuizState {
  currentConfig: QuizConfig | null;
  results: QuizResult[];
  speedRunRecords: SpeedRunRecord[];
  setConfig: (config: QuizConfig) => void;
  addResult: (result: QuizResult) => void;
  getResultsByScope: (scopeType: string, scopeId: string) => QuizResult[];
  getBestAccuracy: (scopeType: string, scopeId: string) => number;
  addSpeedRunRecord: (record: SpeedRunRecord) => void;
  getBestSpeedRun: (lineKey: string) => SpeedRunRecord | null;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      currentConfig: null,
      results: [],
      speedRunRecords: [],

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

      addSpeedRunRecord: (record) =>
        set((state) => ({
          speedRunRecords: [...state.speedRunRecords, record],
        })),

      getBestSpeedRun: (lineKey) => {
        const records = get().speedRunRecords.filter(
          (r) => r.lineKey === lineKey && r.accuracy === 1,
        );
        if (records.length === 0) return null;
        return records.reduce((best, r) => (r.elapsedMs < best.elapsedMs ? r : best));
      },
    }),
    { name: 'tokyo-master-quiz' },
  ),
);
