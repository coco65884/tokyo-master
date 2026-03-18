import { useMapStore } from '@/stores/mapStore';
import { haversineDistance, formatDistance } from '@/utils/distance';

export default function DistanceDisplay() {
  const points = useMapStore((s) => s.distancePoints);
  const clearPoints = useMapStore((s) => s.clearDistancePoints);

  const distance =
    points.length === 2
      ? haversineDistance(points[0][0], points[0][1], points[1][0], points[1][1])
      : null;

  return (
    <div className="distance-display">
      <h3 className="distance-display__title">距離計測</h3>
      <p className="distance-display__hint">地図上の2点をクリックしてください</p>

      {points.length > 0 && (
        <div className="distance-display__info">
          <p>
            地点1: {points[0][0].toFixed(4)}, {points[0][1].toFixed(4)}
          </p>
          {points.length === 2 && (
            <>
              <p>
                地点2: {points[1][0].toFixed(4)}, {points[1][1].toFixed(4)}
              </p>
              <p className="distance-display__result">
                直線距離: <strong>{formatDistance(distance!)}</strong>
              </p>
            </>
          )}
          <button className="distance-display__clear" onClick={clearPoints}>
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
