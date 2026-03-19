import { useMapStore } from '@/stores/mapStore';
import genrePois from '@/data/genre_pois.json';

interface GenreEntry {
  label: string;
  icon: string;
  pois: { name: string; lat: number; lng: number }[];
}

const genres = genrePois as Record<string, GenreEntry>;
const genreKeys = Object.keys(genres);

export default function GenreSelector() {
  const selectedGenres = useMapStore((s) => s.selectedGenres);
  const toggleGenre = useMapStore((s) => s.toggleGenre);

  return (
    <div className="genre-selector">
      <div className="genre-selector__title">テーマ表示</div>
      <div className="genre-selector__list">
        {genreKeys.map((key) => {
          const g = genres[key];
          const active = selectedGenres.includes(key);
          return (
            <button
              key={key}
              className={`genre-selector__item ${active ? 'genre-selector__item--active' : ''}`}
              onClick={() => toggleGenre(key)}
            >
              <span className="genre-selector__icon">{g.icon}</span>
              <span className="genre-selector__label">{g.label}</span>
              <span className="genre-selector__count">{g.pois.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
