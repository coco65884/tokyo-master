import { Link } from 'react-router-dom';
import '@/styles/AchievementPage.css';

export default function AchievementPage() {
  return (
    <div className="achievement-page">
      <header className="achievement-header">
        <Link to="/" className="back-link">
          ← ホーム
        </Link>
        <h1>Achievement</h1>
      </header>
      <div className="achievement-content">
        <p className="achievement-placeholder">Achievement機能は次のフェーズで実装されます</p>
      </div>
    </div>
  );
}
