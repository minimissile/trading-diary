import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Segmented, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import type { PortfolioPositionView, PortfolioSummaryView } from '../../shared/api.types';
import { PortfolioLedgerModal } from '../components/trading/PortfolioLedgerModal';
import { AccountSelect } from '../components/trading/AccountSelect';
import { useTradingAccountId } from '../hooks/useTradingAccountId';
import { formatCurrency, formatPrice } from '../lib/trading-format';

type PositionsTab = 'overview' | 'positions';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外',
};

/**
 * 持仓中心页面，展示真实持仓与市值统计。
 */
export function PositionsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [tab, setTab] = useState<PositionsTab>('overview');
  const [summary, setSummary] = useState<PortfolioSummaryView | null>(null);
  const [positions, setPositions] = useState<PortfolioPositionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [accountId, setAccountId] = useTradingAccountId();

  const load = useCallback(async (silent = false): Promise<void> => {
    if (!accountId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const year = new Date().getFullYear();
      const [nextSummary, nextPositions] = await Promise.all([
        window.desktop.portfolio.getSummary(accountId, year),
        window.desktop.portfolio.listPositions(accountId),
      ]);
      setSummary(nextSummary);
      setPositions(nextPositions);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '持仓数据读取失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshQuotes = async (): Promise<void> => {
    if (!accountId) return;
    setRefreshing(true);
    try {
      setPositions(await window.desktop.portfolio.syncMarketQuotes(accountId));
      setSummary(await window.desktop.portfolio.getSummary(accountId, new Date().getFullYear()));
      void message.success('行情已刷新');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '行情刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const positionColumns = useMemo<ColumnsType<PortfolioPositionView>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        fixed: 'left',
        width: 140,
        render: (_, row) => (
          <span className="watchlist-symbol-button">
            <strong>{row.name}</strong>
            <small>{row.symbol}</small>
          </span>
        ),
      },
      {
        title: '类型',
        dataIndex: 'kind',
        width: 72,
        render: (kind: string) => <Tag>{kindLabels[kind] ?? kind}</Tag>,
      },
      {
        title: '份额',
        dataIndex: 'quantity',
        width: 96,
        align: 'right',
        render: (value: number) => formatPrice(value),
      },
      {
        title: '成本',
        dataIndex: 'avgCost',
        width: 88,
        align: 'right',
        render: (value: number) => formatPrice(value),
      },
      {
        title: '现价',
        key: 'price',
        width: 88,
        align: 'right',
        render: (_, row) => (row.marketPrice === null ? '—' : formatPrice(row.marketPrice)),
      },
      {
        title: '市值',
        key: 'mv',
        width: 100,
        align: 'right',
        render: (_, row) => (row.marketValue === null ? '—' : formatCurrency(row.marketValue)),
      },
      {
        title: '浮盈',
        key: 'pnl',
        width: 100,
        align: 'right',
        render: (_, row) =>
          row.unrealizedPnl === null ? '—' : formatCurrency(row.unrealizedPnl),
      },
    ],
    [],
  );

  const unrealizedPnl = summary?.unrealizedPnl ?? 0;

  return (
    <main className="workspace-page portfolio-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">POSITIONS</p>
          <h1>持仓中心</h1>
          <p className="page-intro">录入买入与卖出流水，跟踪真实持仓、成本与市值。</p>
        </div>
        <div className="portfolio-header-actions">
          <AccountSelect value={accountId} onChange={setAccountId} className="portfolio-account-select" />
          <Button icon={<ReloadOutlined spin={refreshing} />} loading={refreshing} onClick={() => void refreshQuotes()}>
            刷新行情
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLedgerOpen(true)}>
            录入流水
          </Button>
        </div>
      </header>

      {loading && !summary ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <section className="portfolio-metrics">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>持仓市值</small>
              <strong>{formatCurrency(summary?.totalMarketValue ?? 0)}</strong>
              <span>成本 {formatCurrency(summary?.totalCost ?? 0)}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>浮动盈亏</small>
              <strong>{formatCurrency(unrealizedPnl)}</strong>
              <span>{unrealizedPnl >= 0 ? '未实现盈利' : '未实现亏损'}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>持仓数量</small>
              <strong>{positions.length}</strong>
              <span>当前有效标的</span>
            </article>
            <article className="portfolio-metric-card">
              <small>行情更新</small>
              <strong>{summary?.lastRefreshedAt ? '已同步' : '待刷新'}</strong>
              <span>{summary?.lastRefreshedAt ?? '点击刷新行情获取现价'}</span>
            </article>
          </section>

          <div className="page-toolbar">
            <Segmented<PositionsTab>
              options={[
                { label: '总览', value: 'overview' },
                { label: `持仓 ${positions.length}`, value: 'positions' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'overview' ? (
            <div className="portfolio-overview">
              {positions.length === 0 ? (
                <Empty description="还没有持仓，录入第一笔买入流水开始跟踪">
                  <Button type="primary" onClick={() => setLedgerOpen(true)}>
                    录入买入
                  </Button>
                </Empty>
              ) : (
                <Table<PortfolioPositionView>
                  className="watchlist-table"
                  columns={positionColumns}
                  dataSource={positions.slice(0, 8)}
                  pagination={false}
                  rowKey="symbol"
                  size="small"
                  scroll={{ x: 760 }}
                />
              )}
            </div>
          ) : null}

          {tab === 'positions' ? (
            positions.length === 0 ? (
              <Empty description="暂无持仓" />
            ) : (
              <Table<PortfolioPositionView>
                className="watchlist-table"
                columns={positionColumns}
                dataSource={positions}
                pagination={false}
                rowKey="symbol"
                size="small"
                scroll={{ x: 760 }}
              />
            )
          ) : null}
        </>
      )}

      <PortfolioLedgerModal
        open={ledgerOpen}
        defaultAccountId={accountId}
        onClose={() => setLedgerOpen(false)}
        onSaved={() => void load(true)}
      />
    </main>
  );
}
