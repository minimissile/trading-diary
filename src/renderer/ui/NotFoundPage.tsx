import { Link } from 'react-router';
import { routePaths } from '../router/paths';

export function NotFoundPage(): React.JSX.Element {
  return (
    <main className="route-fallback">
      <p className="eyebrow">路由未匹配</p>
      <h1>页面不存在</h1>
      <p className="summary">当前地址没有对应的客户端页面。</p>
      <Link className="route-link" to={routePaths.home}>
        返回首页
      </Link>
    </main>
  );
}
