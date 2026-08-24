import { HashRouter, Route, Routes } from 'react-router';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { routePaths } from './paths';

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path={routePaths.home} element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
