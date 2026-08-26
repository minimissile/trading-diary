import { HashRouter, Route, Routes } from 'react-router';
import { AppShell } from '../components/trading/AppShell';
import { AlertsPage } from '../pages/AlertsPage';
import { AnalysisPage } from '../pages/AnalysisPage';
import { HomePage } from '../pages/HomePage';
import { JournalPage } from '../pages/JournalPage';
import { PortfolioPage } from '../pages/PortfolioPage';
import { WatchlistPage } from '../pages/WatchlistPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlansPage } from '../pages/PlansPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LlmDebugPage } from '../pages/LlmDebugPage';
import { routePaths } from './paths';

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path={routePaths.home} element={<HomePage />} />
          <Route path={routePaths.plans} element={<PlansPage />} />
          <Route path={routePaths.watchlist} element={<WatchlistPage />} />
          <Route path={routePaths.portfolio} element={<PortfolioPage />} />
          <Route path={routePaths.alerts} element={<AlertsPage />} />
          <Route path={routePaths.journal} element={<JournalPage />} />
          <Route path={routePaths.analysis} element={<AnalysisPage />} />
          <Route path={routePaths.settings} element={<SettingsPage />} />
          {import.meta.env.DEV ? <Route path={routePaths.devLlm} element={<LlmDebugPage />} /> : null}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
