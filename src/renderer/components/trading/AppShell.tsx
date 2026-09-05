import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  DownOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Badge, Button, Input } from 'antd';
import { useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { useWorkspaceSnapshot } from '../../lib/queries';
import { routePaths } from '../../router/paths';
import { AppSidebar } from './AppSidebar';
import { BackgroundPicker } from './BackgroundPicker';

const routeByNavigationKey: Readonly<Record<string, string>> = {
  today: routePaths.home,
  plans: routePaths.plans,
  watchlist: routePaths.watchlist,
  positions: routePaths.positions,
  dividends: routePaths.dividends,
  sip: routePaths.sip,
  lofArbitrage: routePaths.lofArbitrage,
  accounts: routePaths.accounts,
  alerts: routePaths.alerts,
  journal: routePaths.journal,
  playbook: routePaths.playbook,
  import: routePaths.import,
  analysis: routePaths.analysis,
  settings: routePaths.settings,
  about: routePaths.about,
};

function navigationKeyFromPath(pathname: string): string {
  const exact = Object.entries(routeByNavigationKey).find(([, path]) => path === pathname);
  if (exact) return exact[0];

  // 子路由沿用父级菜单高亮（如 /positions/history、/positions/chart/600519 → 持仓中心）
  const prefix = Object.entries(routeByNavigationKey)
    .filter(([, path]) => path !== routePaths.home && pathname.startsWith(`${path}/`))
    .sort(([, a], [, b]) => b.length - a.length)[0];
  return prefix?.[0] ?? 'today';
}

function compactDate(): string {
  const date = new Date();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
  const localDate = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('/', '-');
  return `${localDate}  ${weekday}`;
}

export function AppShell(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const pageScrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(pageScrollRef);
  const { triggeredAlertCount: alertCount } = useWorkspaceSnapshot();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`trading-app${collapsed ? ' trading-app--collapsed' : ''}`}>
      <AppSidebar
        activeKey={navigationKeyFromPath(location.pathname)}
        alertCount={alertCount}
        collapsed={collapsed}
        onSelect={(key) => {
          const path = routeByNavigationKey[key];
          if (path) void navigate(path);
        }}
      />
      <div className="app-stage">
        <header className="command-topbar">
          <div className="topbar-leading">
            <button
              className="sidebar-collapse sidebar-collapse--content"
              type="button"
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <div className="command-search">
              <SearchOutlined aria-hidden="true" />
              <Input
                variant="borderless"
                placeholder="搜索计划、回合、规则、标的…"
                suffix={<kbd>Ctrl K</kbd>}
                aria-label="全局搜索"
              />
            </div>
          </div>

          <div className="market-context">
            <span className="topbar-chip topbar-date">
              <CalendarOutlined aria-hidden="true" />
              {compactDate()}
            </span>
            <span className="topbar-chip market-state">
              A股 <b className="market-closed">休市</b>
              <i />
              港股 <b className="market-open">交易中</b>
              <i />
              美股 <b className="market-closed">休市</b>
            </span>
          </div>

          <div className="topbar-actions">
            <BackgroundPicker />
            <Button
              className="new-plan-button"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                if (location.pathname === routePaths.home) window.dispatchEvent(new Event('open-plan-create'));
                else void navigate(routePaths.home, { state: { newPlan: true } });
              }}
            >
              新建计划
            </Button>
            <Button
              className="record-trade-button"
              icon={<CalendarOutlined />}
              onClick={() => void navigate(routePaths.journal, { state: { openExecution: true } })}
            >
              记录成交 <DownOutlined />
            </Button>
            <Badge count={alertCount} size="small" overflowCount={99}>
              <Button
                className="topbar-icon-button"
                type="text"
                icon={<BellOutlined />}
                aria-label="提醒中心"
                onClick={() => void navigate(routePaths.alerts)}
              />
            </Badge>
            <Button
              className="topbar-icon-button analytics-button"
              type="text"
              icon={<BarChartOutlined />}
              aria-label="分析报表"
              onClick={() => void navigate(routePaths.analysis)}
            />
          </div>
        </header>

        <div className="app-page-scroll" ref={pageScrollRef}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
