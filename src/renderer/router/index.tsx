import { HashRouter, Route, Routes } from 'react-router';
import { App } from '../ui/App';
import { NotFoundPage } from '../ui/NotFoundPage';
import { routePaths } from './paths';

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path={routePaths.home} element={<App />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
