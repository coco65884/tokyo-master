import { Link } from 'react-router-dom';
import { useQuizStore } from '@/stores/quizStore';
import { useAchievementStore } from '@/stores/achievementStore';
import '@/styles/SettingsPage.css';

export default function SettingsPage() {
  const quizResults = useQuizStore((s) => s.results);
  const achievements = useAchievementStore((s) => s.achievements);

  const handleClearQuizData = () => {
    if (window.confirm('クイズの履歴をすべて削除しますか？')) {
      localStorage.removeItem('tokyo-master-quiz');
      window.location.reload();
    }
  };

  const handleClearAchievements = () => {
    if (window.confirm('Achievementをすべてリセットしますか？')) {
      localStorage.removeItem('tokyo-master-achievements');
      window.location.reload();
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <Link to="/" className="back-link">
          ← ホーム
        </Link>
        <h1>設定</h1>
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <h2 className="settings-section__title">データ管理</h2>
          <div className="settings-section__item">
            <div>
              <p className="settings-section__label">クイズ履歴</p>
              <p className="settings-section__value">{quizResults.length} 件の記録</p>
            </div>
            <button className="settings-btn settings-btn--danger" onClick={handleClearQuizData}>
              削除
            </button>
          </div>
          <div className="settings-section__item">
            <div>
              <p className="settings-section__label">Achievement</p>
              <p className="settings-section__value">{Object.keys(achievements).length} 件の記録</p>
            </div>
            <button className="settings-btn settings-btn--danger" onClick={handleClearAchievements}>
              リセット
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">アプリ情報</h2>
          <div className="settings-section__item">
            <p className="settings-section__label">バージョン</p>
            <p className="settings-section__value">0.1.0</p>
          </div>
          <div className="settings-section__item">
            <p className="settings-section__label">データソース</p>
            <p className="settings-section__value">OpenStreetMap</p>
          </div>
        </section>
      </div>
    </div>
  );
}
