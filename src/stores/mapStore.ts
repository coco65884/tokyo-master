import { create } from 'zustand';
import type { LayerVisibility } from '@/types';

interface MapState {
  center: [number, number];
  zoom: number;
  layers: LayerVisibility;
  selectedWardId: string | null;
  distancePoints: [number, number][];
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  toggleRailLine: (lineId: string) => void;
  setSelectedWard: (wardId: string | null) => void;
  addDistancePoint: (point: [number, number]) => void;
  clearDistancePoints: () => void;
}

const DEFAULT_TOKYO_CENTER: [number, number] = [35.6762, 139.6503];
const DEFAULT_ZOOM = 11;

export const useMapStore = create<MapState>((set) => ({
  center: DEFAULT_TOKYO_CENTER,
  zoom: DEFAULT_ZOOM,
  layers: {
    wards: true,
    prefBorders: true,
    railLines: {},
    rivers: false,
    roads: false,
    landmarks: false,
    stations: true,
  },
  selectedWardId: null,
  distancePoints: [],

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),

  toggleLayer: (layer) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: !state.layers[layer],
      },
    })),

  toggleRailLine: (lineId) =>
    set((state) => ({
      layers: {
        ...state.layers,
        railLines: {
          ...state.layers.railLines,
          [lineId]: !state.layers.railLines[lineId],
        },
      },
    })),

  setSelectedWard: (wardId) => set({ selectedWardId: wardId }),

  addDistancePoint: (point) =>
    set((state) => {
      const points = [...state.distancePoints, point];
      if (points.length > 2) {
        return { distancePoints: [point] };
      }
      return { distancePoints: points };
    }),

  clearDistancePoints: () => set({ distancePoints: [] }),
}));
