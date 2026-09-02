import { useMemo, useState } from 'react';
import { Button, Empty, Segmented, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import type { InstrumentKind } from '../../shared/market/types';
import type {
  ClosedPositionSummary,
  RealizedTradeView,
} from '../../shared/portfolio/types';
import { ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import { AccountSelect } from '../components/trading/AccountSelect';
import { useRealizedHistoryQuery } from '../lib/queries';
import {
  AnimatedValueDisplay,
  formatTradeDate,
  ValueDisplay,
  pricePresetForKind,
  quantityPresetForKind,
} from '../lib/trading-format';
import { routePaths } from '../router/paths';

type HistoryTab = 'trades' | 'closed';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
};

/**
 * 历史持仓 / 已实现盈亏。
 * 主视图按每笔卖出展示 realized PnL；副视图汇总已清仓标的。
 */
export function PositionHistoryPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [tab, setTab] = useState<HistoryTab>('trades');
  const { history, isLoading: loading } = useRealizedHistoryQuery(accountId, year);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => ({
      label: String(current - index),
      value: current - index,
    }));
  }, []);

  const tradeColumns = useMemo<ColumnsType<RealizedTradeView>>(
    () => [
      {
        title: '卖出日期',
        dataIndex: 'tradeAt',
        width: 112,
        render: (value: string) => formatTradeDate(value),
      },
      {
        title: '标的',
        key: 'symbol',
        width: 180,
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
        width: 88,
        align: 'right',
        render: (kind: InstrumentKind) => <Tag>{kindLabels[kind] ?? kind}</Tag>,
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: 88,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />,
      },
      {
        title: '卖价',
        dataIndex: 'sellPrice',
        width: 88,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={pricePresetForKind(row.kind)} value={value} />,
      },
      {
        title: '净收入',
        dataIndex: 'proceeds',
        width: 108,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="currency" value={value} />,
      },
      {
        title: '成本',
        dataIndex: 'costBasis',
        width: 108,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="currency" value={value} />,
      },
      {
        title: '已实现盈亏',
        dataIndex: 'realizedPnl',
        width: 116,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="pnl" value={value} />,
      },
      {
        title: '做T收益',
        dataIndex: 'tTradingPnl',
        width: 108,
        align: 'right',
        render: (value: number | null) =>
          value === null ? '—' : <ValueDisplay kind="pnl" value={value} />,
      },
      {
        title: '收益率',
        dataIndex: 'returnPercent',
        width: 96,
        align: 'right',
        render: (value: number | null) =>
          value === null ? '—' : <ValueDisplay kind="percent" value={value} />,
      },
    ],
    [],
  );

  const closedColumns = useMemo<ColumnsType<ClosedPositionSummary>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        width: 180,
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
        width: 88,
        align: 'right',
        render: (kind: InstrumentKind) => <Tag>{kindLabels[kind] ?? kind}</Tag>,
      },
      {
        title: '卖出笔数',
        dataIndex: 'sellCount',
        width: 88,
        align: 'right',
      },
      {
        title: '累计卖出',
        dataIndex: 'totalQuantitySold',
        width: 96,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />,
      },
      {
        title: '首次卖出',
        dataIndex: 'firstSellAt',
        width: 112,
        render: (value: string) => formatTradeDate(value),
      },
      {
        title: '最后卖出',
        dataIndex: 'lastSellAt',
        width: 112,
        render: (value: string) => formatTradeDate(value),
      },
      {
        title: '累计盈亏',
        dataIndex: 'totalRealizedPnl',
        width: 116,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="pnl" value={value} />,
      },
    ],
    [],
  );

  const summary = history?.summary;
  const tableData = tab === 'trades' ? (history?.trades ?? []) : (history?.closedPositions ?? []);

  return (
    <main className="workspace-page portfolio-page portfolio-history-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">REALIZED PNL</p>
          <h1>历史持仓</h1>
          <p className="page-intro">
            按每笔卖出记录已实现盈亏（移动加权成本）；「做 T 收益」为同日先买后卖配对；「已清仓」汇总完全退出的标的。
          </p>
        </div>
        <div className="portfolio-header-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(routePaths.positions)}>
            返回持仓
          </Button>
          <AccountSelect value={accountId} onChange={setAccountId} includeAllOption className="portfolio-account-select" />
          <Segmented<number> options={yearOptions} value={year} onChange={setYear} />
        </div>
      </header>

      {loading && !history ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <section className="portfolio-metrics">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>累计已实现盈亏</small>
              <AnimatedValueDisplay
                as="strong"
                cacheKey={`history:${accountId}:${year}:total`}
                kind="pnl"
                value={summary?.totalRealizedPnl ?? 0}
              />
              <span>{year} 年</span>
            </article>
            <article className="portfolio-metric-card">
              <small>卖出笔数</small>
              <strong>{summary?.tradeCount ?? 0}</strong>
              <span>盈利 {summary?.winCount ?? 0} · 亏损 {summary?.lossCount ?? 0}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>已清仓标的</small>
              <strong>{history?.closedPositions.length ?? 0}</strong>
              <span>当前无持仓的标的</span>
            </article>
          </section>

          <div className="page-toolbar portfolio-filters">
            <Segmented<HistoryTab>
              options={[
                { label: '卖出明细', value: 'trades' },
                { label: '已清仓汇总', value: 'closed' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tableData.length === 0 ? (
            <Empty description={tab === 'trades' ? '暂无卖出记录' : '暂无已清仓标的'}>
              <Link to={routePaths.positions}>
                <Button type="primary">去持仓页</Button>
              </Link>
            </Empty>
          ) : (
            <Table
              className="watchlist-table"
              columns={tab === 'trades' ? tradeColumns : closedColumns}
              dataSource={tableData}
              rowKey={tab === 'trades' ? 'id' : (row) => `${row.accountId}:${row.symbol}`}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              size="small"
              scroll={{ x: tab === 'trades' ? 1220 : 900 }}
            />
          )}
        </>
      )}
    </main>
  );
}
