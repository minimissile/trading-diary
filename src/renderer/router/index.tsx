import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { lazy, Suspense } from 'react';
import { Skeleton } from 'antd';
import { AppShell } from '../components/trading/AppShell';
import { AlertsPage } from '../pages/AlertsPage';
import { AnalysisPage } from '../pages/AnalysisPage';
import { DividendsPage } from '../pages/DividendsPage';
import { HomePage } from '../pages/HomePage';
import { ImportPage } from '../pages/ImportPage';
import { PlaybookPage } from '../pages/PlaybookPage';
import { JournalPage } from '../pages/JournalPage';
import { PositionsPage } from '../pages/PositionsPage';
import { PositionHistoryPage } from '../pages/PositionHistoryPage';
import { PnlCalendarPage } from '../pages/PnlCalendarPage';
import { AccountsPage } from '../pages/AccountsPage';
import { WatchlistPage } from '../pages/WatchlistPage';
import { StockStrategyPage } from '../pages/StockStrategyPage';
import { DragonTigerPage } from '../pages/DragonTigerPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlansPage } from '../pages/PlansPage';
import { SipPage } from '../pages/SipPage';
import { LofArbitragePage } from '../pages/LofArbitragePage';
import { SettingsPage } from '../pages/SettingsPage';
import { AboutPage } from '../pages/AboutPage';
import { LlmDebugPage } from '../pages/LlmDebugPage';
import { SymbolChartPage } from '../pages/SymbolChartPage';
import { UiComponentsPage } from '../pages/UiComponentsPage';
import { routePaths } from './paths';

const QuantResearchPage = lazy(() => import('../features/quant-research/QuantResearchPage'));

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        {import.meta.env.DEV ? <Route path="/dev/ui-components" element={<UiComponentsPage />} /> : null}
        <Route element={<AppShell />}>
          <Route path={routePaths.home} element={<HomePage />} />
          <Route path={routePaths.plans} element={<PlansPage />} />
          <Route path={routePaths.watchlist} element={<WatchlistPage />} />
          <Route path={routePaths.stockStrategy} element={<StockStrategyPage />} />
          <Route
            path={routePaths.quantResearch}
            element={
              <Suspense fallback={<Skeleton active />}>
                <QuantResearchPage />
              </Suspense>
            }
          />
          <Route path={routePaths.dragonTiger} element={<DragonTigerPage />} />
          <Route path={routePaths.positions} element={<PositionsPage />} />
          <Route path={routePaths.positionHistory} element={<PositionHistoryPage />} />
          <Route path={routePaths.positionPnlCalendar} element={<PnlCalendarPage />} />
          <Route path={routePaths.positionChart} element={<SymbolChartPage />} />
          <Route path={routePaths.dividends} element={<DividendsPage />} />
          <Route path={routePaths.accounts} element={<AccountsPage />} />
          <Route path={routePaths.sip} element={<SipPage />} />
          <Route path={routePaths.lofArbitrage} element={<LofArbitragePage />} />
          <Route path={routePaths.portfolio} element={<Navigate to={routePaths.positions} replace />} />
          <Route path={routePaths.alerts} element={<AlertsPage />} />
          <Route path={routePaths.import} element={<ImportPage />} />
          <Route path={routePaths.playbook} element={<PlaybookPage />} />
          <Route path={routePaths.journal} element={<JournalPage />} />
          <Route path={routePaths.analysis} element={<AnalysisPage />} />
          <Route path={routePaths.settings} element={<SettingsPage />} />
          <Route path={routePaths.about} element={<AboutPage />} />
          {import.meta.env.DEV ? <Route path={routePaths.devLlm} element={<LlmDebugPage />} /> : null}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
