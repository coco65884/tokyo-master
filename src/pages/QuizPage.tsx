import { Link } from 'react-router-dom';
import '@/styles/QuizPage.css';

export default function QuizPage() {
  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <Link to="/" className="back-link">
          ← ホーム
        </Link>
        <h1>地理クイズ</h1>
      </header>
      <div className="quiz-content">
        <p className="quiz-placeholder">クイズ機能は次のフェーズで実装されます</p>
      </div>
    </div>
  );
}
