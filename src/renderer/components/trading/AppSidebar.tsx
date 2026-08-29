import {
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  BookFilled,
  DashboardOutlined,
  HistoryOutlined,
  ImportOutlined,
  SafetyCertificateOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProjectOutlined,
  WalletOutlined,
  StarOutlined,
  SettingOutlined,
  MoneyCollectOutlined,
} from '@ant-design/icons';

const navItems = [
  { key: 'today', label: '今日指挥台', icon: DashboardOutlined },
  { key: 'plans', label: '计划工作台', icon: ProjectOutlined },
  { key: 'watchlist', label: '自选观察池', icon: StarOutlined },
  { key: 'positions', label: '持仓中心', icon: WalletOutlined },
  { key: 'dividends', label: '股息与分红', icon: MoneyCollectOutlined },
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
  return (
    <aside className="app-sidebar" aria-label="交易日记主导航">
      <div className="app-brand">
        <img className="brand-mark" src="/logo.png" alt="" aria-hidden="true" draggable={false} />
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

      <blockquote className="sidebar-quote">
        <span>今日语录</span>
        <p>
          专注流程，控制风险，
          <br />
          让概率替你赚钱。
        </p>
        <BookFilled aria-hidden="true" />
      </blockquote>

      <button className="sidebar-collapse sidebar-collapse--bottom" type="button" aria-label="折叠侧栏" onClick={onCollapse}>
        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </button>
    </aside>
  );
}
