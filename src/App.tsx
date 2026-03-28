import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import MapViewerPage from '@/pages/MapViewerPage';
import QuizPage from '@/pages/QuizPage';
import AchievementPage from '@/pages/AchievementPage';
import SettingsPage from '@/pages/SettingsPage';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapViewerPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/achievement" element={<AchievementPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
