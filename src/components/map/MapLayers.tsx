import { useEffect, useState, useMemo } from 'react';
import { GeoJSON, CircleMarker, Polyline, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { extractFocusArea, clipGeoJSONToFocusArea, pointInFocusArea } from '@/utils/geoClip';
import type { FocusArea } from '@/utils/geoClip';
import { useMapStore } from '@/stores/mapStore';
import type { LineIndexEntry } from '@/types';
import {
  loadWards,
  loadPrefBorders,
  loadRailLines,
  loadRivers,
  loadRoads,
  loadLineIndex,
  loadWardCenters,
  loadWardObjects,
} from '@/utils/dataLoader';
import type { WardCenter, WardObjects } from '@/utils/dataLoader';

interface GeoData {
  wards: FeatureCollection | null;
  prefBorders: FeatureCollection | null;
  railLines: FeatureCollection | null;
  rivers: FeatureCollection | null;
  roads: FeatureCollection | null;
}

interface LayerFlags {
  wards: boolean;
  prefBorders: boolean;
  railLines: Record<string, boolean>;
  rivers: boolean;
  roads: boolean;
}

function useGeoData(layers: LayerFlags, wardFocusActive: boolean): GeoData {
  const [data, setData] = useState<GeoData>({
    wards: null,
    prefBorders: null,
    railLines: null,
    rivers: null,
    roads: null,
  });

  useEffect(() => {
    if (!data.wards) loadWards().then((d) => setData((p) => ({ ...p, wards: d })));
  }, [data.wards]);

  useEffect(() => {
    if (layers.prefBorders && !data.prefBorders)
      loadPrefBorders().then((d) => setData((p) => ({ ...p, prefBorders: d })));
  }, [layers.prefBorders, data.prefBorders]);

  // 路線: 手動選択 or フォーカスモードで必要
  useEffect(() => {
    const needRail = Object.values(layers.railLines).some(Boolean) || wardFocusActive;
    if (needRail && !data.railLines)
      loadRailLines().then((d) => setData((p) => ({ ...p, railLines: d })));
  }, [layers.railLines, wardFocusActive, data.railLines]);

  // 川: 手動 or フォーカス
  useEffect(() => {
    if ((layers.rivers || wardFocusActive) && !data.rivers)
      loadRivers().then((d) => setData((p) => ({ ...p, rivers: d })));
  }, [layers.rivers, wardFocusActive, data.rivers]);

  // 道路: 手動 or フォーカス
  useEffect(() => {
    if ((layers.roads || wardFocusActive) && !data.roads)
      loadRoads().then((d) => setData((p) => ({ ...p, roads: d })));
  }, [layers.roads, wardFocusActive, data.roads]);

  return data;
}

function useLineIndex(): LineIndexEntry[] {
  const [lines, setLines] = useState<LineIndexEntry[]>([]);
  useEffect(() => {
    loadLineIndex().then((d) => setLines(d.lines));
  }, []);
  return lines;
}

function useWardMeta(): {
  centers: WardCenter[];
  objects: Record<string, WardObjects>;
} {
  const [centers, setCenters] = useState<WardCenter[]>([]);
  const [objects, setObjects] = useState<Record<string, WardObjects>>({});
  useEffect(() => {
    loadWardCenters().then(setCenters);
    loadWardObjects().then(setObjects);
  }, []);
  return { centers, objects };
}

// ======= Tokyo highlight =======
function TokyoHighlight({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="tokyo-bg"
      data={data}
      style={{ color: 'transparent', weight: 0, fillColor: '#e0f2fe', fillOpacity: 0.25 }}
    />
  );
}

// ======= Ward boundaries =======
function WardLayer({
  data,
  focusedWardId,
}: {
  data: FeatureCollection;
  focusedWardId: string | null;
}) {
  const setSelectedWard = useMapStore((s) => s.setSelectedWard);
  const map = useMap();

  const defaultStyle = (feature?: Feature): L.PathOptions => {
    const isFocused = focusedWardId && feature?.properties?.id === focusedWardId;
    return {
      color: isFocused ? '#4a90d9' : '#94a3b8',
      weight: isFocused ? 2.5 : 1.2,
      fillColor: isFocused ? '#a8d8ea' : 'transparent',
      fillOpacity: isFocused ? 0.35 : 0,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    const path = layer as L.Path;
    const isFocused = focusedWardId && feature.properties?.id === focusedWardId;

    if (!isFocused) {
      path.on('mouseover', () => {
        path.setStyle({ fillColor: '#a8d8ea', fillOpacity: 0.2, weight: 2, color: '#4a90d9' });
      });
      path.on('mouseout', () => {
        path.setStyle(defaultStyle(feature));
      });
    }

    path.on('dblclick', (e) => {
      L.DomEvent.stopPropagation(e as L.LeafletEvent);
      setSelectedWard(feature.properties?.id);
      map.fitBounds((layer as L.Polygon).getBounds(), { padding: [50, 50] });
    });
  };

  return (
    <GeoJSON
      key={`wards-${focusedWardId || 'none'}`}
      data={data}
      style={defaultStyle}
      onEachFeature={onEachFeature}
    />
  );
}

// ======= Ward name labels (center of each ward) =======
function WardNameLabels({ centers }: { centers: WardCenter[] }) {
  return (
    <>
      {centers.map((c) => (
        <Marker
          key={`wlabel-${c.id}`}
          position={[c.lat, c.lng]}
          icon={L.divIcon({
            className: 'ward-name-label',
            html: `<span>${c.name}</span>`,
            iconSize: [0, 0],
          })}
          interactive={false}
        />
      ))}
    </>
  );
}

// ======= Prefecture borders =======
function PrefBorderLayer({ data }: { data: FeatureCollection }) {
  return (
    <GeoJSON
      key="pref-borders"
      data={data}
      style={{ color: '#64748b', weight: 2.5, opacity: 0.6, dashArray: '10, 6' }}
    />
  );
}

// ======= Focus area: polygon + bbox for fast rejection =======
// FocusArea is imported from @/utils/geoClip

// ======= Rail lines + stations =======

function useRailData({
  railGeoData,
  lineIndex,
  visibleLines,
  focusArea,
}: {
  railGeoData: FeatureCollection;
  lineIndex: LineIndexEntry[];
  visibleLines: Record<string, boolean>;
  focusArea: FocusArea | null;
}) {
  const activeKeys = useMemo(
    () =>
      new Set(
        Object.entries(visibleLines)
          .filter(([, v]) => v)
          .map(([k]) => k),
      ),
    [visibleLines],
  );

  const activeLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of lineIndex) {
      if (activeKeys.has(entry.key)) {
        for (const lid of entry.lineIds) ids.add(lid);
      }
    }
    return ids;
  }, [lineIndex, activeKeys]);

  const filteredGeo = useMemo(() => {
    if (activeLineIds.size === 0) return null;
    return {
      ...railGeoData,
      features: railGeoData.features.filter((f) => activeLineIds.has(f.properties?.id)),
    } as FeatureCollection;
  }, [railGeoData, activeLineIds]);

  // 駅を名前+近傍で重複排除、所属路線を集約
  const activeStations = useMemo(() => {
    const byNameGrid = new Map<
      string,
      {
        id: string;
        name: string;
        lat: number;
        lng: number;
        color: string;
        inFocus: boolean;
        lines: { name: string; abbr: string; color: string }[];
      }
    >();

    for (const entry of lineIndex) {
      if (!activeKeys.has(entry.key)) continue;
      const lineInfo = { name: entry.name, abbr: entry.abbr, color: entry.color };
      for (const s of entry.stations) {
        if (s.name.startsWith('駅-')) continue;
        const gridKey = `${s.name}_${Math.round(s.lat * 100)}_${Math.round(s.lng * 100)}`;
        const existing = byNameGrid.get(gridKey);
        if (existing) {
          if (!existing.lines.some((l) => l.name === entry.name)) {
            existing.lines.push(lineInfo);
          }
        } else {
          const inFocus = !focusArea || pointInFocusArea([s.lng, s.lat], focusArea);
          byNameGrid.set(gridKey, {
            ...s,
            color: entry.color,
            inFocus,
            lines: [lineInfo],
          });
        }
      }
    }
    return [...byNameGrid.values()];
  }, [lineIndex, activeKeys, focusArea]);

  if (activeKeys.size === 0) return null;

  return { filteredGeo, activeStations };
}

// bbox→短い文字列キー
function focusKey(area: FocusArea | null): string {
  if (!area) return 'none';
  return `${area.minLat.toFixed(3)}_${area.maxLng.toFixed(3)}`;
}

// 路線の線のみ描画（灰色+白, 2層方式）
function RailLineLayer({
  geo,
  focusArea,
}: {
  geo: FeatureCollection;
  focusArea: FocusArea | null;
}) {
  const clipped = useMemo(
    () => (focusArea ? clipGeoJSONToFocusArea(geo, focusArea) : null),
    [geo, focusArea],
  );

  const bk = focusKey(focusArea);
  const railBase = { color: '#6b7280', lineCap: 'butt' as const, lineJoin: 'miter' as const };
  const railDash = {
    color: '#ffffff',
    dashArray: '6, 6',
    lineCap: 'butt' as const,
    lineJoin: 'miter' as const,
  };

  const railInteraction = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    const path = layer as L.Path;
    path.bindTooltip(name, { sticky: true, className: 'rail-tooltip' });
    path.bindPopup(`<strong>${name}</strong>`, { closeButton: false });
  };

  return (
    <>
      {/* 背景: 全路線薄く */}
      <GeoJSON
        key={`rail-base-bg-${bk}-${geo.features.length}`}
        data={geo}
        style={() => ({ ...railBase, weight: 5, opacity: focusArea ? 0.1 : 0.7 })}
        interactive={false}
      />
      <GeoJSON
        key={`rail-dash-bg-${bk}-${geo.features.length}`}
        data={geo}
        style={() => ({ ...railDash, weight: 3, opacity: focusArea ? 0.08 : 0.7 })}
        interactive={false}
      />
      {/* 当たり判定用の透明太線レイヤー */}
      {!focusArea && (
        <GeoJSON
          key={`rail-hit-bg-${bk}-${geo.features.length}`}
          data={geo}
          style={() => ({ color: 'transparent', weight: 16, opacity: 0 })}
          onEachFeature={railInteraction}
        />
      )}
      {/* フォーカス層: bbox内だけ濃く */}
      {clipped && clipped.features.length > 0 && (
        <>
          <GeoJSON
            key={`rail-base-focus-${bk}`}
            data={clipped}
            style={() => ({ ...railBase, weight: 5, opacity: 0.7 })}
            interactive={false}
          />
          <GeoJSON
            key={`rail-dash-focus-${bk}`}
            data={clipped}
            style={() => ({ ...railDash, weight: 3, opacity: 0.7 })}
            interactive={false}
          />
          {/* フォーカス層の当たり判定 */}
          <GeoJSON
            key={`rail-hit-focus-${bk}`}
            data={clipped}
            style={() => ({ color: 'transparent', weight: 16, opacity: 0 })}
            onEachFeature={railInteraction}
          />
        </>
      )}
    </>
  );
}

// 駅のみ描画（最前面レイヤー用）
function StationMarkers({
  stations,
  focusArea,
}: {
  stations: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    color: string;
    inFocus: boolean;
    lines: { name: string; abbr: string; color: string }[];
  }[];
  focusArea: FocusArea | null;
}) {
  return (
    <>
      {focusArea &&
        stations
          .filter((s) => !s.inFocus)
          .map((s, i) => (
            <CircleMarker
              key={`dim-${i}-${s.name}`}
              center={[s.lat, s.lng]}
              radius={3}
              pathOptions={{ color: '#ccc', fillColor: '#f0f0f0', fillOpacity: 0.6, weight: 1 }}
            >
              <Tooltip permanent direction="top" offset={[0, -4]} className="station-label-dim">
                {s.name}
              </Tooltip>
            </CircleMarker>
          ))}
      {stations
        .filter((s) => s.inFocus)
        .map((s, i) => (
          <CircleMarker
            key={`st-${i}-${s.name}`}
            center={[s.lat, s.lng]}
            radius={5}
            pathOptions={{ color: s.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]} className="station-label">
              {s.name}
            </Tooltip>
            <Popup>
              <div style={{ fontSize: '0.85rem' }}>
                <strong>{s.name}</strong>
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                  {s.lines.map((l) => (
                    <li
                      key={l.name}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 24,
                          height: 16,
                          padding: '0 3px',
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          border: `1.5px solid ${l.color}`,
                          borderRadius: 3,
                          color: l.color,
                          backgroundColor: `${l.color}15`,
                        }}
                      >
                        {l.abbr}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#334155' }}>{l.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </>
  );
}

// clipGeoJSONToFocusArea, extractFocusArea は @/utils/geoClip からインポート

// ======= Rivers (2層: 全体薄く + bbox内を濃く) =======
function RiverLayer({ data, focusArea }: { data: FeatureCollection; focusArea: FocusArea | null }) {
  const bk = focusKey(focusArea);
  const clipped = useMemo(
    () => (focusArea ? clipGeoJSONToFocusArea(data, focusArea) : null),
    [data, focusArea],
  );

  const interactionHandler = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    if (!name) return;
    const path = layer as L.Path;
    path.bindTooltip(name, { sticky: true, className: 'river-tooltip' });
    path.bindPopup(`<strong style="color:#0ea5e9">${name}</strong>`, {
      closeButton: false,
      className: 'river-popup',
    });
    path.on('mouseover', () => {
      path.setStyle({ weight: 7, opacity: 1 });
      path.bringToFront();
    });
    path.on('mouseout', () => {
      path.setStyle({ weight: 4, opacity: 0.8 });
    });
  };

  return (
    <>
      <GeoJSON
        key={`rivers-bg-${bk}`}
        data={data}
        style={{
          color: '#38bdf8',
          weight: focusArea ? 2 : 4,
          opacity: focusArea ? 0.12 : 0.8,
          lineCap: 'round',
        }}
        onEachFeature={focusArea ? undefined : interactionHandler}
      />
      {clipped && clipped.features.length > 0 && (
        <GeoJSON
          key={`rivers-focus-${bk}`}
          data={clipped}
          style={{ color: '#38bdf8', weight: 4, opacity: 0.8, lineCap: 'round' }}
          onEachFeature={interactionHandler}
        />
      )}
    </>
  );
}

// ======= Roads (2層: 全体薄く + bbox内を濃く) =======
function RoadLayer({ data, focusArea }: { data: FeatureCollection; focusArea: FocusArea | null }) {
  const bk = focusKey(focusArea);
  const clipped = useMemo(
    () => (focusArea ? clipGeoJSONToFocusArea(data, focusArea) : null),
    [data, focusArea],
  );

  const interactionHandler = (feature: Feature, layer: L.Layer) => {
    const name = feature.properties?.name || '';
    if (!name) return;
    const path = layer as L.Path;
    path.bindTooltip(name, { sticky: true, className: 'road-tooltip' });
    path.bindPopup(`<strong style="color:#ea580c">${name}</strong>`, {
      closeButton: false,
      className: 'road-popup',
    });
    path.on('mouseover', () => {
      path.setStyle({ weight: 6, opacity: 1 });
      path.bringToFront();
    });
    path.on('mouseout', () => {
      path.setStyle({ weight: 3.5, opacity: 0.7 });
    });
  };

  return (
    <>
      <GeoJSON
        key={`roads-bg-${bk}`}
        data={data}
        style={{
          color: '#fb923c',
          weight: focusArea ? 2 : 3.5,
          opacity: focusArea ? 0.12 : 0.7,
          lineCap: 'round',
        }}
        onEachFeature={focusArea ? undefined : interactionHandler}
      />
      {clipped && clipped.features.length > 0 && (
        <GeoJSON
          key={`roads-focus-${bk}`}
          data={clipped}
          style={{ color: '#fb923c', weight: 3.5, opacity: 0.7, lineCap: 'round' }}
          onEachFeature={interactionHandler}
        />
      )}
    </>
  );
}

// ======= Genre POI Layer =======
import genrePoisData from '@/data/genre_pois.json';

interface GenrePOI {
  name: string;
  lat: number;
  lng: number;
  group?: string;
}
interface GenreEntry {
  label: string;
  icon: string;
  pois: GenrePOI[];
}

const allGenreKeys = Object.keys(genrePoisData as Record<string, GenreEntry>);

function GenrePOILayer({ genreKey, focusArea }: { genreKey: string; focusArea: FocusArea | null }) {
  const genre = (genrePoisData as Record<string, GenreEntry>)[genreKey];
  const [highlightGroup, setHighlightGroup] = useState<string | null>(null);
  if (!genre) return null;

  // Filter POIs to only those within the focused ward when ward focus is active
  const visiblePois = focusArea
    ? genre.pois.filter((poi) => pointInFocusArea([poi.lng, poi.lat], focusArea))
    : genre.pois;

  return (
    <>
      {visiblePois.map((poi, i) => {
        const group = (poi as GenrePOI).group;
        const isHighlighted = highlightGroup && group && highlightGroup === group;
        return (
          <Marker
            key={`genre-${genreKey}-${i}`}
            position={[poi.lat, poi.lng]}
            icon={L.divIcon({
              className: `genre-poi-icon ${isHighlighted ? 'genre-poi-icon--highlight' : ''}`,
              html: `<span>${genre.icon}</span>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
            eventHandlers={{
              click: () => {
                if (group) setHighlightGroup(highlightGroup === group ? null : group);
              },
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]} className="genre-poi-label">
              {poi.name}
            </Tooltip>
            <Popup>
              <strong>{poi.name}</strong>
              {group && group !== poi.name && (
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{group}</div>
              )}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// ======= Distance dots + line =======
function DistanceOverlay() {
  const points = useMapStore((s) => s.distancePoints);
  return (
    <>
      {points.map((p, i) => (
        <CircleMarker
          key={`dist-pt-${i}`}
          center={p as [number, number]}
          radius={6}
          pathOptions={{ color: '#e91e63', fillColor: '#e91e63', fillOpacity: 1, weight: 2 }}
        />
      ))}
      {points.length === 2 && (
        <Polyline
          positions={points as [number, number][]}
          pathOptions={{ color: '#e91e63', weight: 2.5, dashArray: '8, 6', opacity: 0.9 }}
        />
      )}
    </>
  );
}

// extractFocusArea は @/utils/geoClip からインポート

// ======= Main =======
export default function MapLayers() {
  const layers = useMapStore((s) => s.layers);
  const selectedWardId = useMapStore((s) => s.selectedWardId);
  const selectedGenres = useMapStore((s) => s.selectedGenres);
  const { centers, objects } = useWardMeta();
  const lineIndex = useLineIndex();

  // Ward focus is active whenever a ward is selected (no separate toggle)
  const wardFocusActive = !!selectedWardId;
  const geoData = useGeoData(layers, wardFocusActive);

  const focusData = useMemo(() => {
    if (!wardFocusActive || !selectedWardId) return null;
    const wo = objects[selectedWardId];
    if (!wo) return null;
    return {
      lineKeys: new Set(wo.lineKeys),
      riverNames: new Set(wo.riverNames),
      roadNames: new Set(wo.roadNames),
    };
  }, [wardFocusActive, selectedWardId, objects]);

  const focusArea = useMemo(() => {
    if (!wardFocusActive || !selectedWardId || !geoData.wards) return null;
    return extractFocusArea(geoData.wards, selectedWardId);
  }, [wardFocusActive, selectedWardId, geoData.wards]);

  const effectiveRailLines = useMemo(() => {
    if (focusData) {
      const merged: Record<string, boolean> = {};
      for (const k of focusData.lineKeys) merged[k] = true;
      return merged;
    }
    return layers.railLines;
  }, [focusData, layers.railLines]);

  const emptyGeo: FeatureCollection = useMemo(
    () => ({ type: 'FeatureCollection', features: [] }),
    [],
  );
  const railData = useRailData({
    railGeoData: geoData.railLines || emptyGeo,
    lineIndex,
    visibleLines: effectiveRailLines,
    focusArea,
  });
  const hasRailData = geoData.railLines !== null && lineIndex.length > 0;

  const showRivers = focusData ? true : layers.rivers;
  const showRoads = focusData ? true : layers.roads;
  const focusedWardId = wardFocusActive ? selectedWardId : null;

  return (
    <>
      {geoData.wards && <TokyoHighlight data={geoData.wards} />}
      {layers.prefBorders && geoData.prefBorders && <PrefBorderLayer data={geoData.prefBorders} />}
      {layers.wards && geoData.wards && (
        <WardLayer data={geoData.wards} focusedWardId={focusedWardId} />
      )}
      {layers.wards && centers.length > 0 && <WardNameLabels centers={centers} />}

      {/* 路線（線のみ） */}
      {hasRailData && railData?.filteredGeo && (
        <RailLineLayer geo={railData.filteredGeo} focusArea={focusArea} />
      )}

      {showRivers && geoData.rivers && <RiverLayer data={geoData.rivers} focusArea={focusArea} />}
      {showRoads && geoData.roads && <RoadLayer data={geoData.roads} focusArea={focusArea} />}

      {/* テーマPOI: 区フォーカス時は全ジャンルを自動表示 */}
      {wardFocusActive &&
        focusArea &&
        allGenreKeys.map((key) => (
          <GenrePOILayer key={`auto-${key}`} genreKey={key} focusArea={focusArea} />
        ))}
      {/* テーマPOI: 手動ジャンル選択（区フォーカスでないとき） */}
      {!wardFocusActive &&
        selectedGenres.map((genreKey) => (
          <GenrePOILayer key={`genre-${genreKey}`} genreKey={genreKey} focusArea={focusArea} />
        ))}
      <DistanceOverlay />

      {/* 駅は最前面レイヤー */}
      {hasRailData && (railData?.activeStations?.length ?? 0) > 0 && (
        <StationMarkers stations={railData!.activeStations} focusArea={focusArea} />
      )}
    </>
  );
}
