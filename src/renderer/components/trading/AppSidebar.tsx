import {
  SwapOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  DashboardOutlined,
  FundOutlined,
  HistoryOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProjectOutlined,
  WalletOutlined,
  StarOutlined,
  SettingOutlined,
  MoneyCollectOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';

const navItems = [
  { key: 'today', label: '今日指挥台', icon: DashboardOutlined },
  { key: 'plans', label: '计划工作台', icon: ProjectOutlined },
  { key: 'watchlist', label: '自选观察池', icon: StarOutlined },
  { key: 'positions', label: '持仓中心', icon: WalletOutlined },
  { key: 'dividends', label: '股息与分红', icon: MoneyCollectOutlined },
  { key: 'sip', label: '定投管理', icon: FundOutlined },
  { key: 'lofArbitrage', label: 'LOF 套利', icon: SwapOutlined },
  { key: 'accounts', label: '账户管理', icon: BankOutlined },
  { key: 'alerts', label: '提醒中心', icon: BellOutlined },
  { key: 'import', label: '成交导入', icon: ImportOutlined },
  { key: 'journal', label: '交易日记', icon: HistoryOutlined },
  { key: 'playbook', label: '规则库', icon: SafetyCertificateOutlined },
  { key: 'analysis', label: '分析报表', icon: BarChartOutlined },
  { key: 'settings', label: '数据与设置', icon: SettingOutlined },
] as const;

interface AppSidebarProps {
  activeKey: string;
  alertCount: number;
  collapsed: boolean;
  onCollapse: () => void;
  onSelect: (key: string) => void;
}

export function AppSidebar({ activeKey, alertCount, collapsed, onCollapse, onSelect }: AppSidebarProps): React.JSX.Element {
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    void window.desktop.updater
      .getState()
      .then((state) => setAppVersion(state.currentVersion))
      .catch(() => setAppVersion(''));
  }, []);

  return (
    <aside className="app-sidebar" aria-label="交易日记主导航">
      <div className="app-brand">
        <img className="brand-mark" src="./logo.png" alt="" aria-hidden="true" draggable={false} />
        <span className="brand-copy">
          <strong>交易日记</strong>
          <small>交易为生，复盘为师</small>
        </span>
        <button className="sidebar-collapse sidebar-collapse--top" type="button" aria-label="折叠侧栏" onClick={onCollapse}>
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      </div>

      <nav className="primary-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;
          return (
            <button
              className={isActive ? 'active' : ''}
              key={item.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              onClick={() => onSelect(item.key)}
            >
              <Icon className="nav-icon" aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
              {item.key === 'alerts' && alertCount > 0 ? (
                <span className="nav-attention" aria-label={`${alertCount} 条未处理提醒`}>
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          className={`sidebar-footer-link${activeKey === 'about' ? ' active' : ''}`}
          type="button"
          aria-current={activeKey === 'about' ? 'page' : undefined}
          title={collapsed ? '关于我们' : undefined}
          onClick={() => onSelect('about')}
        >
          <InfoCircleOutlined className="nav-icon" aria-hidden="true" />
          <span className="nav-label">关于我们</span>
        </button>
        <div className="sidebar-footer-meta">
          <span className="sidebar-version" title={appVersion ? `版本 ${appVersion}` : undefined}>
            {appVersion ? `v${appVersion}` : '—'}
          </span>
        </div>
      </div>
    </aside>
  );
}
