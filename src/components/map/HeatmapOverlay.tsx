import { useEffect, useState, useMemo } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { useQuizStore } from '@/stores/quizStore';
import { useMapStore } from '@/stores/mapStore';
import { loadWards } from '@/utils/dataLoader';

/**
 * Accuracy-based color: green (100%) -> yellow (50%) -> red (0%)
 * Gray if no data.
 */
function accuracyToColor(accuracy: number): string {
  // accuracy: 0..1
  if (accuracy >= 0.75) {
    // green -> yellow-green (0.75..1.0)
    const t = (accuracy - 0.75) / 0.25;
    const r = Math.round(255 * (1 - t) + 34 * t);
    const g = Math.round(197 * (1 - t) + 197 * t);
    const b = Math.round(94 * (1 - t) + 94 * t);
    return `rgb(${r},${g},${b})`;
  }
  if (accuracy >= 0.5) {
    // yellow -> orange (0.5..0.75)
    const t = (accuracy - 0.5) / 0.25;
    const r = Math.round(239 * (1 - t) + 255 * t);
    const g = Math.round(68 * (1 - t) + 197 * t);
    const b = Math.round(68 * (1 - t) + 94 * t);
    return `rgb(${r},${g},${b})`;
  }
  // red -> orange (0..0.5)
  const t = accuracy / 0.5;
  const r = Math.round(239);
  const g = Math.round(68 * t);
  const b = Math.round(68 * t);
  return `rgb(${r},${g},${b})`;
}

export default function HeatmapOverlay() {
  const showHeatmap = useMapStore((s) => s.showHeatmap);
  const results = useQuizStore((s) => s.results);
  const [wardsGeo, setWardsGeo] = useState<FeatureCollection | null>(null);
  const map = useMap();

  useEffect(() => {
    loadWards().then(setWardsGeo);
  }, []);

  // Build a map of wardId -> best accuracy
  const wardAccuracyMap = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of results) {
      if (r.scopeType === 'ward') {
        const existing = acc[r.scopeId] ?? 0;
        acc[r.scopeId] = Math.max(existing, r.accuracy);
      }
    }
    return acc;
  }, [results]);

  if (!showHeatmap || !wardsGeo) return null;

  const styleFunc = (feature?: Feature): L.PathOptions => {
    const wardId = feature?.properties?.id as string | undefined;
    const accuracy = wardId ? wardAccuracyMap[wardId] : undefined;

    if (accuracy === undefined) {
      return {
        color: '#94a3b8',
        weight: 1,
        fillColor: '#d1d5db',
        fillOpacity: 0.4,
      };
    }

    return {
      color: '#64748b',
      weight: 1,
      fillColor: accuracyToColor(accuracy),
      fillOpacity: 0.55,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const wardId = feature.properties?.id as string | undefined;
    const wardName = feature.properties?.name as string | undefined;
    const accuracy = wardId ? wardAccuracyMap[wardId] : undefined;

    const label =
      accuracy !== undefined
        ? `${wardName}: ${Math.round(accuracy * 100)}%`
        : `${wardName}: データなし`;

    const path = layer as L.Path;
    path.bindTooltip(label, { sticky: true, className: 'heatmap-tooltip' });

    path.on('mouseover', () => {
      path.setStyle({ weight: 2.5, fillOpacity: 0.7 });
      path.bringToFront();
    });
    path.on('mouseout', () => {
      path.setStyle(styleFunc(feature));
    });
    path.on('click', () => {
      map.fitBounds((layer as L.Polygon).getBounds(), { padding: [50, 50] });
    });
  };

  const geoKey = `heatmap-${Object.keys(wardAccuracyMap).length}-${Object.values(wardAccuracyMap).join(',')}`;

  return <GeoJSON key={geoKey} data={wardsGeo} style={styleFunc} onEachFeature={onEachFeature} />;
}
