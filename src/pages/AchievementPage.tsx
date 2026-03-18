import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AchievementCard from '@/components/achievement/AchievementCard';
import ShareCard from '@/components/achievement/ShareCard';
import { useAchievementStore } from '@/stores/achievementStore';
import { loadLineIndex } from '@/utils/dataLoader';
import {
  generateLineAchievements,
  generateWardAchievements,
  generateRiverAchievement,
} from '@/data/achievements';
import type { AchievementDefinition } from '@/types';
import '@/styles/AchievementPage.css';

type FilterTab = 'all' | 'line' | 'ward' | 'theme';

export default function AchievementPage() {
  const achievements = useAchievementStore((s) => s.achievements);
  const achievedCount = useAchievementStore((s) => s.getAchievedCount());

  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDef, setSelectedDef] = useState<AchievementDefinition | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { lines } = await loadLineIndex();
      if (cancelled) return;

      const lineAch = generateLineAchievements(lines);
      const wardAch = generateWardAchievements();
      const riverAch = generateRiverAchievement();

      setDefinitions([...lineAch, ...wardAch, riverAch]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDefs = useMemo(() => {
    if (filterTab === 'all') return definitions;
    return definitions.filter((d) => d.scopeType === filterTab);
  }, [definitions, filterTab]);

  if (loading) {
    return (
      <div className="achievement-page">
        <header className="achievement-header">
          <Link to="/" className="back-link">
            &larr; ホーム
          </Link>
          <h1>Achievement</h1>
        </header>
        <div className="achievement-content">
          <p className="achievement-loading">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="achievement-page">
      <header className="achievement-header">
        <Link to="/" className="back-link">
          &larr; ホーム
        </Link>
        <h1>Achievement</h1>
        <p className="achievement-summary">
          達成: {achievedCount} / {definitions.length}
        </p>
      </header>

      {/* Filter tabs */}
      <div className="achievement-tabs">
        {(
          [
            ['all', 'すべて'],
            ['line', '路線'],
            ['ward', '区/市'],
            ['theme', 'テーマ'],
          ] as [FilterTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`achievement-tab ${filterTab === key ? 'achievement-tab--active' : ''}`}
            onClick={() => setFilterTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Achievement grid */}
      <div className="achievement-grid">
        {filteredDefs.map((def) => (
          <AchievementCard
            key={def.id}
            definition={def}
            userAchievement={achievements[def.id]}
            onClick={() => setSelectedDef(def)}
          />
        ))}
      </div>

      {filteredDefs.length === 0 && (
        <p className="achievement-empty">該当するアチーブメントがありません</p>
      )}

      {/* Share modal */}
      {selectedDef && (
        <ShareCard
          definition={selectedDef}
          userAchievement={achievements[selectedDef.id]}
          onClose={() => setSelectedDef(null)}
        />
      )}
    </div>
  );
}
