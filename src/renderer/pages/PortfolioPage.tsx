import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Calendar,
  Empty,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, PlusOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type {
  DividendCalendarDay,
  PortfolioDividendRecord,
  PortfolioPositionView,
  PortfolioSummaryView,
} from '../../shared/api.types';
import { PortfolioLedgerModal } from '../components/trading/PortfolioLedgerModal';
import { formatCurrency, formatPrice } from '../lib/trading-format';

type PortfolioTab = 'overview' | 'positions' | 'calendar' | 'dividends';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外',
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function PortfolioPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [tab, setTab] = useState<PortfolioTab>('overview');
  const [summary, setSummary] = useState<PortfolioSummaryView | null>(null);
  const [positions, setPositions] = useState<PortfolioPositionView[]>([]);
  const [dividends, setDividends] = useState<PortfolioDividendRecord[]>([]);
  const [calendarDays, setCalendarDays] = useState<DividendCalendarDay[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const year = new Date().getFullYear();
      const [nextSummary, nextPositions, nextDividends, nextCalendar] = await Promise.all([
        window.desktop.portfolio.getSummary(undefined, year),
        window.desktop.portfolio.listPositions(),
        window.desktop.portfolio.listDividends(undefined, year),
        window.desktop.portfolio.getDividendCalendar(undefined, calendarMonth),
      ]);
      setSummary(nextSummary);
      setPositions(nextPositions);
      setDividends(nextDividends);
      setCalendarDays(nextCalendar);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '持仓数据读取失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calendarMonth, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshQuotes = async (): Promise<void> => {
    setRefreshing(true);
    try {
      setPositions(await window.desktop.portfolio.syncMarketQuotes());
      setSummary(await window.desktop.portfolio.getSummary(undefined, new Date().getFullYear()));
      void message.success('行情已刷新');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '行情刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const refreshDividends = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const result = await window.desktop.portfolio.refreshDividends();
      await load(true);
      void message.success(`已同步 ${result.synced} 条分红，其中 ${result.estimated} 条待确认`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '分红同步失败');
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDividend = async (id: string, confirmed: boolean): Promise<void> => {
    try {
      setDividends(await window.desktop.portfolio.confirmDividend(id, confirmed));
      setSummary(await window.desktop.portfolio.getSummary(undefined, new Date().getFullYear()));
      void message.success(confirmed ? '分红已确认' : '分红已驳回');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '操作失败');
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
        title: '今年分红',
        dataIndex: 'ytdDividendReceived',
        width: 100,
        align: 'right',
        render: (value: number) => formatCurrency(value),
      },
      {
        title: '预期分红',
        dataIndex: 'expectedDividend',
        width: 100,
        align: 'right',
        render: (value: number) => formatCurrency(value),
      },
      {
        title: '股息率',
        key: 'yield',
        width: 88,
        align: 'right',
        render: (_, row) => (row.dividendYieldTtm === null ? '—' : `${row.dividendYieldTtm.toFixed(2)}%`),
      },
    ],
    [],
  );

  const dividendColumns = useMemo<ColumnsType<PortfolioDividendRecord>>(
    () => [
      {
        title: '除权日',
        dataIndex: 'exDividendDate',
        width: 108,
      },
      {
        title: '标的',
        key: 'symbol',
        width: 140,
        render: (_, row) => (
          <span>
            <strong>{row.name}</strong>
            <br />
            <small>{row.symbol}</small>
          </span>
        ),
      },
      {
        title: '每股派息',
        dataIndex: 'cashPerShare',
        width: 96,
        align: 'right',
        render: (value: number) => formatPrice(value),
      },
      {
        title: '持有份额',
        dataIndex: 'eligibleQuantity',
        width: 96,
        align: 'right',
        render: (value: number) => formatPrice(value),
      },
      {
        title: '税前金额',
        dataIndex: 'cashAmount',
        width: 108,
        align: 'right',
        render: (value: number) => formatCurrency(value),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (status: string) => {
          if (status === 'confirmed') return <Tag color="green">已确认</Tag>;
          if (status === 'estimated') return <Tag color="blue">待确认</Tag>;
          return <Tag>已驳回</Tag>;
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (_, row) =>
          row.status === 'estimated' ? (
            <span className="portfolio-row-actions">
              <Button type="link" icon={<CheckOutlined />} onClick={() => void confirmDividend(row.id, true)} />
              <Button type="link" danger icon={<CloseOutlined />} onClick={() => void confirmDividend(row.id, false)} />
            </span>
          ) : null,
      },
    ],
    [],
  );

  const calendarCellMap = useMemo(() => {
    const map = new Map<string, DividendCalendarDay['items']>();
    for (const day of calendarDays) {
      map.set(day.date, day.items);
    }
    return map;
  }, [calendarDays]);

  const pendingCount = dividends.filter((item) => item.status === 'estimated').length;

  return (
    <main className="workspace-page portfolio-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PORTFOLIO</p>
          <h1>持仓与股息</h1>
          <p className="page-intro">记录真实持仓，统计建仓后收到的分红。累计分红仅含已确认记录。</p>
        </div>
        <div className="portfolio-header-actions">
          <Button icon={<ReloadOutlined spin={refreshing} />} loading={refreshing} onClick={() => void refreshQuotes()}>
            刷新行情
          </Button>
          <Button loading={refreshing} onClick={() => void refreshDividends()}>
            同步分红
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLedgerOpen(true)}>
            录入流水
          </Button>
        </div>
      </header>

      <Alert
        className="watchlist-disclaimer"
        type="info"
        showIcon
        message="股息来自公开 API 与用户录入，可能与券商对账单不一致"
        description="不构成投资建议。点亮墙仅反映已确认累计分红，不含预期分红。"
      />

      {loading && !summary ? (
        <Skeleton active paragraph={{ rows: 14 }} />
      ) : (
        <>
          <section className="portfolio-metrics">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>今年累计分红</small>
              <strong>{formatCurrency(summary?.ytdReceived ?? 0)}</strong>
              <span>已确认 · {summary?.year ?? new Date().getFullYear()}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>预期分红</small>
              <strong>{formatCurrency(summary?.expectedDividend ?? 0)}</strong>
              <span>已公告待除权</span>
            </article>
            <article className="portfolio-metric-card">
              <small>日均分红</small>
              <strong>{formatCurrency(summary?.dailyAverage ?? 0)}</strong>
              <span>按日历天折算</span>
            </article>
            <article className="portfolio-metric-card">
              <small>持仓市值</small>
              <strong>{formatCurrency(summary?.totalMarketValue ?? 0)}</strong>
              <span>成本 {formatCurrency(summary?.totalCost ?? 0)}</span>
            </article>
          </section>

          <section className="portfolio-milestones">
            <div className="portfolio-milestones-head">
              <h2>分红点亮墙</h2>
              <span>
                已点亮 {summary?.litMilestoneCount ?? 0} / {summary?.milestones.length ?? 0}
              </span>
            </div>
            <div className="portfolio-milestone-grid">
              {(summary?.milestones ?? []).map((milestone) => (
                <Tooltip key={milestone.id} title={milestone.caption}>
                  <article className={milestone.lit ? 'portfolio-milestone lit' : 'portfolio-milestone'}>
                    <span className="portfolio-milestone-emoji">{milestone.emoji}</span>
                    <strong>{milestone.name}</strong>
                    <small>¥{milestone.threshold.toLocaleString('zh-CN')}</small>
                    {!milestone.lit ? (
                      <div className="portfolio-milestone-progress">
                        <i style={{ width: `${Math.round(milestone.progress * 100)}%` }} />
                      </div>
                    ) : null}
                  </article>
                </Tooltip>
              ))}
            </div>
          </section>

          <div className="page-toolbar">
            <Segmented<PortfolioTab>
              options={[
                { label: '总览', value: 'overview' },
                { label: `持仓 ${positions.length}`, value: 'positions' },
                { label: '分红日历', value: 'calendar' },
                { label: `分红明细${pendingCount > 0 ? ` (${pendingCount})` : ''}`, value: 'dividends' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'overview' ? (
            <div className="portfolio-overview">
              {positions.length === 0 ? (
                <Empty description="还没有持仓，录入第一笔买入流水开始跟踪股息">
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
                  scroll={{ x: 960 }}
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
                scroll={{ x: 960 }}
              />
            )
          ) : null}

          {tab === 'calendar' ? (
            <div className="portfolio-calendar-wrap">
              <Calendar
                fullscreen={false}
                onPanelChange={(value) => {
                  const month = `${value.year()}-${String(value.month() + 1).padStart(2, '0')}`;
                  setCalendarMonth(month);
                  void window.desktop.portfolio.getDividendCalendar(undefined, month).then(setCalendarDays);
                }}
                cellRender={(current, info) => {
                  if (info.type !== 'date') return info.originNode;
                  const key = current.format('YYYY-MM-DD');
                  const items = calendarCellMap.get(key);
                  if (!items?.length) return null;
                  const total = items.reduce((sum, item) => sum + item.cashAmount, 0);
                  return (
                    <ul className="portfolio-calendar-cell">
                      {items.slice(0, 2).map((item) => (
                        <li key={`${item.symbol}-${item.status}`}>
                          {item.name} {formatCurrency(item.cashAmount)}
                        </li>
                      ))}
                      {items.length > 2 ? <li>+{items.length - 2} 条</li> : null}
                      <li className="portfolio-calendar-total">{formatCurrency(total)}</li>
                    </ul>
                  );
                }}
              />
            </div>
          ) : null}

          {tab === 'dividends' ? (
            dividends.length === 0 ? (
              <Empty description="今年还没有分红记录，可先同步分红或录入持仓">
                <Button onClick={() => void refreshDividends()}>同步分红</Button>
              </Empty>
            ) : (
              <Table<PortfolioDividendRecord>
                className="watchlist-table"
                columns={dividendColumns}
                dataSource={dividends}
                pagination={{ pageSize: 20 }}
                rowKey="id"
                size="small"
                scroll={{ x: 900 }}
              />
            )
          ) : null}
        </>
      )}

      <PortfolioLedgerModal
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        onSaved={() => void load(true)}
      />
    </main>
  );
}
