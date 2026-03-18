import { create } from 'zustand';

interface LayerState {
  wards: boolean;
  prefBorders: boolean;
  /** 個別路線のON/OFF (key = "operator::lineName") */
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
  landmarks: boolean;
}

interface MapState {
  center: [number, number];
  zoom: number;
  layers: LayerState;
  selectedWardId: string | null;
  distanceMode: boolean;
  distancePoints: [number, number][];
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleLayer: (layer: keyof Omit<LayerState, 'railLines'>) => void;
  toggleRailLine: (lineKey: string) => void;
  toggleOperator: (operator: string, lineKeys: string[], enable: boolean) => void;
  setSelectedWard: (wardId: string | null) => void;
  setDistanceMode: (on: boolean) => void;
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
  },
  selectedWardId: null,
  distanceMode: false,
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

  toggleRailLine: (lineKey) =>
    set((state) => ({
      layers: {
        ...state.layers,
        railLines: {
          ...state.layers.railLines,
          [lineKey]: !state.layers.railLines[lineKey],
        },
      },
    })),

  toggleOperator: (_, lineKeys, enable) =>
    set((state) => {
      const updated = { ...state.layers.railLines };
      for (const key of lineKeys) {
        updated[key] = enable;
      }
      return { layers: { ...state.layers, railLines: updated } };
    }),

  setSelectedWard: (wardId) => set({ selectedWardId: wardId }),

  setDistanceMode: (on) => set({ distanceMode: on, distancePoints: on ? [] : [] }),

  addDistancePoint: (point) =>
    set((state) => {
      if (!state.distanceMode) return {};
      const points = [...state.distancePoints, point];
      if (points.length > 2) {
        return { distancePoints: [point] };
      }
      return { distancePoints: points };
    }),

  clearDistancePoints: () => set({ distancePoints: [] }),
}));
