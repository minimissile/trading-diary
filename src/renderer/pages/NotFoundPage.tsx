import { Button } from 'antd';
import { useNavigate } from 'react-router';
import { routePaths } from '../router/paths';

export function NotFoundPage(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <main className="route-fallback">
      <p className="eyebrow">路由未匹配</p>
      <h1>页面不存在</h1>
      <p className="summary">当前地址没有对应的客户端页面。</p>
      <Button type="primary" onClick={() => navigate(routePaths.home)}>
        返回首页
      </Button>
    </main>
  );
}
