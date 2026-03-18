import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import MapViewerPage from '@/pages/MapViewerPage';
import QuizPage from '@/pages/QuizPage';
import AchievementPage from '@/pages/AchievementPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapViewerPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/achievement" element={<AchievementPage />} />
      </Routes>
    </BrowserRouter>
  );
}
