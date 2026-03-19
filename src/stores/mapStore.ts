import { create } from 'zustand';

interface LayerState {
  wards: boolean;
  prefBorders: boolean;
  /** 個別路線のON/OFF (key = "operator::lineName") */
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
}

interface MapState {
  center: [number, number];
  zoom: number;
  layers: LayerState;
  selectedWardId: string | null;
  distanceMode: boolean;
  distancePoints: [number, number][];
  showHeatmap: boolean;
  /** 選択中のテーマPOIジャンルキー（複数選択可） */
  selectedGenres: string[];
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleLayer: (layer: keyof Omit<LayerState, 'railLines'>) => void;
  toggleRailLine: (lineKey: string) => void;
  toggleOperator: (operator: string, lineKeys: string[], enable: boolean) => void;
  setSelectedWard: (wardId: string | null) => void;
  setDistanceMode: (on: boolean) => void;
  addDistancePoint: (point: [number, number]) => void;
  clearDistancePoints: () => void;
  setShowHeatmap: (on: boolean) => void;
  toggleGenre: (genre: string) => void;
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
  },
  selectedWardId: null,
  distanceMode: false,
  distancePoints: [],
  showHeatmap: false,
  selectedGenres: [],

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),

  toggleLayer: (layer) =>
    set((state) => {
      const newValue = !state.layers[layer];
      // When rivers or roads are toggled ON, auto-deactivate ward focus
      const shouldClearWard =
        newValue && (layer === 'rivers' || layer === 'roads') && state.selectedWardId !== null;
      return {
        layers: {
          ...state.layers,
          [layer]: newValue,
        },
        ...(shouldClearWard ? { selectedWardId: null } : {}),
      };
    }),

  toggleRailLine: (lineKey) =>
    set((state) => {
      const newValue = !state.layers.railLines[lineKey];
      // When a rail line is toggled ON, auto-deactivate ward focus
      const shouldClearWard = newValue && state.selectedWardId !== null;
      return {
        layers: {
          ...state.layers,
          railLines: {
            ...state.layers.railLines,
            [lineKey]: newValue,
          },
        },
        ...(shouldClearWard ? { selectedWardId: null } : {}),
      };
    }),

  toggleOperator: (_, lineKeys, enable) =>
    set((state) => {
      const updated = { ...state.layers.railLines };
      for (const key of lineKeys) {
        updated[key] = enable;
      }
      // When enabling rail lines, auto-deactivate ward focus
      const shouldClearWard = enable && state.selectedWardId !== null;
      return {
        layers: { ...state.layers, railLines: updated },
        ...(shouldClearWard ? { selectedWardId: null } : {}),
      };
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

  setShowHeatmap: (on) => set({ showHeatmap: on }),

  toggleGenre: (genre) =>
    set((state) => {
      const idx = state.selectedGenres.indexOf(genre);
      if (idx >= 0) {
        return { selectedGenres: state.selectedGenres.filter((g) => g !== genre) };
      }
      return { selectedGenres: [...state.selectedGenres, genre] };
    }),
}));
