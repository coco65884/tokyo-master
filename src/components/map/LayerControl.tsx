import { useMapStore } from '@/stores/mapStore';

export default function LayerControl() {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  const layerItems: { key: keyof typeof layers; label: string }[] = [
    { key: 'wards', label: '区/市境界' },
    { key: 'prefBorders', label: '都道府県境界' },
    { key: 'stations', label: '駅' },
    { key: 'rivers', label: '川' },
    { key: 'roads', label: '主要道路' },
    { key: 'landmarks', label: '観光地' },
  ];

  return (
    <div className="layer-control">
      {layerItems.map(({ key, label }) => (
        <label key={key} className="layer-control__item">
          <input
            type="checkbox"
            checked={typeof layers[key] === 'boolean' ? (layers[key] as boolean) : false}
            onChange={() => toggleLayer(key)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
