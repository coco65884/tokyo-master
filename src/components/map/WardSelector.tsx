import { useEffect, useState } from 'react';

interface WardMeta {
  id: string;
  name: { kanji: string };
  type: string;
}

export default function WardSelector({
  onSelectWard,
}: {
  onSelectWard: (wardId: string | null) => void;
}) {
  const [wards, setWards] = useState<WardMeta[]>([]);

  useEffect(() => {
    import('@/data/wards.json').then((mod) => {
      const data = (mod.default as WardMeta[]).sort((a, b) =>
        a.name.kanji.localeCompare(b.name.kanji, 'ja'),
      );
      setWards(data);
    });
  }, []);

  return (
    <div className="ward-selector">
      <h3 className="ward-selector__title">区/市を選択</h3>
      <select
        className="ward-selector__select"
        onChange={(e) => onSelectWard(e.target.value || null)}
        defaultValue=""
      >
        <option value="">東京都全体</option>
        <optgroup label="特別区">
          {wards
            .filter((w) => w.type === 'ku')
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name.kanji}
              </option>
            ))}
        </optgroup>
        <optgroup label="市">
          {wards
            .filter((w) => w.type === 'shi')
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name.kanji}
              </option>
            ))}
        </optgroup>
        <optgroup label="町村">
          {wards
            .filter((w) => w.type !== 'ku' && w.type !== 'shi')
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name.kanji}
              </option>
            ))}
        </optgroup>
      </select>
    </div>
  );
}
