import { Link } from 'react-router-dom';
import { useAchievementStore } from '@/stores/achievementStore';
import '@/styles/HomePage.css';

export default function HomePage() {
  const achievedCount = useAchievementStore((s) => s.getAchievedCount());

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">Tokyo Master</h1>
        <p className="home-subtitle">東京の地理をマスターしよう</p>
      </header>

      <nav className="home-nav">
        <Link to="/map" className="home-card home-card--map">
          <span className="home-card__icon">🗺️</span>
          <h2 className="home-card__title">地理確認</h2>
          <p className="home-card__desc">東京の地図を自由に探索</p>
        </Link>

        <Link to="/quiz" className="home-card home-card--quiz">
          <span className="home-card__icon">❓</span>
          <h2 className="home-card__title">地理クイズ</h2>
          <p className="home-card__desc">駅・川・地名のクイズに挑戦</p>
        </Link>

        <Link to="/achievement" className="home-card home-card--achievement">
          <span className="home-card__icon">🏆</span>
          <h2 className="home-card__title">Achievement</h2>
          <p className="home-card__desc">達成数: {achievedCount}</p>
        </Link>
      </nav>

      <Link to="/settings" className="home-settings-link">
        設定
      </Link>
    </div>
  );
}
