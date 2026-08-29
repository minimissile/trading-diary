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
import { ReloadOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type {
  DividendCalendarDay,
  PortfolioDividendRecord,
  PortfolioSummaryView,
} from '../../shared/api.types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../shared/accounts/account-display';
import { pricePresetForKind, quantityPresetForKind } from '../../shared/format/display-presets';
import { ValueDisplay } from '../lib/trading-format';
import { AccountSelect } from '../components/trading/AccountSelect';

type DividendsTab = 'overview' | 'calendar' | 'dividends';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 股息与分红页面，展示分红统计、点亮墙、日历与明细。
 */
export function DividendsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [tab, setTab] = useState<DividendsTab>('overview');
  const [summary, setSummary] = useState<PortfolioSummaryView | null>(null);
  const [dividends, setDividends] = useState<PortfolioDividendRecord[]>([]);
  const [calendarDays, setCalendarDays] = useState<DividendCalendarDay[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [accountLabels, setAccountLabels] = useState<Map<string, string>>(new Map());
  const allAccountsView = isAllAccountsId(accountId);

  useEffect(() => {
    void window.desktop.accounts.list().then((accounts) => {
      setAccountLabels(new Map(accounts.map((item) => [item.id, formatAccountSelectLabel(item)])));
    });
  }, []);

  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const year = new Date().getFullYear();
      const [nextSummary, nextDividends, nextCalendar] = await Promise.all([
        window.desktop.portfolio.getSummary(accountId, year),
        window.desktop.portfolio.listDividends(accountId, year),
        window.desktop.portfolio.getDividendCalendar(accountId, calendarMonth),
      ]);
      setSummary(nextSummary);
      setDividends(nextDividends);
      setCalendarDays(nextCalendar);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '分红数据读取失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId, calendarMonth, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshDividends = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const result = await window.desktop.portfolio.refreshDividends(accountId);
      await load(true);
      void message.success(`已同步 ${result.synced} 条分红，其中 ${result.estimated} 条待确认`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '分红同步失败');
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDividend = async (id: string, confirmed: boolean): Promise<void> => {
    const year = new Date().getFullYear();
    try {
      setDividends(await window.desktop.portfolio.confirmDividend(id, confirmed, undefined, accountId, year));
      setSummary(await window.desktop.portfolio.getSummary(accountId, year));
      void message.success(confirmed ? '分红已确认' : '分红已驳回');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '操作失败');
    }
  };

  const dividendColumns = useMemo<ColumnsType<PortfolioDividendRecord>>(
    () => [
      ...(allAccountsView
        ? [
            {
              title: '账户',
              dataIndex: 'accountId',
              width: 120,
              render: (id: string) => accountLabels.get(id) ?? id,
            } as const,
          ]
        : []),
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
        render: (value: number, row) => <ValueDisplay kind={pricePresetForKind(row.kind)} value={value} />,
      },
      {
        title: '持有份额',
        dataIndex: 'eligibleQuantity',
        width: 96,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />,
      },
      {
        title: '税前金额',
        dataIndex: 'cashAmount',
        width: 108,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="currency" value={value} />,
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
    [accountLabels, allAccountsView],
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
          <p className="page-kicker">DIVIDENDS</p>
          <h1>股息与分红</h1>
          <p className="page-intro">
            {allAccountsView
              ? '汇总全部账户的分红统计，累计分红仅含已确认记录。'
              : '统计建仓后收到的分红，累计分红仅含已确认记录。'}
          </p>
        </div>
        <div className="portfolio-header-actions">
          <AccountSelect
            value={accountId}
            onChange={setAccountId}
            includeAllOption
            className="portfolio-account-select"
          />
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            loading={refreshing}
            onClick={() => void refreshDividends()}
          >
            同步分红
          </Button>
        </div>
      </header>

      <Alert
        className="watchlist-disclaimer"
        type="info"
        showIcon
        title="股息来自公开 API 与用户录入，可能与券商对账单不一致"
        description={
          allAccountsView
            ? '不构成投资建议。汇总视图合并全部账户，点亮墙仅反映已确认累计分红，不含预期分红。'
            : '不构成投资建议。点亮墙仅反映已确认累计分红，不含预期分红。'
        }
      />

      {loading && !summary ? (
        <Skeleton active paragraph={{ rows: 14 }} />
      ) : (
        <>
          <section className="portfolio-metrics portfolio-metrics--four">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>今年累计分红</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.ytdReceived ?? 0} />
              <span>已确认 · {summary?.year ?? new Date().getFullYear()}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>预期分红</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.expectedDividend ?? 0} />
              <span>已公告待除权</span>
            </article>
            <article className="portfolio-metric-card">
              <small>日均分红</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.dailyAverage ?? 0} />
              <span>按日历天折算</span>
            </article>
            <article className="portfolio-metric-card">
              <small>持仓市值</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.totalMarketValue ?? 0} />
              <span>
                成本 <ValueDisplay kind="currency" value={summary?.totalCost ?? 0} />
              </span>
            </article>
          </section>

          {tab === 'overview' ? (
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
                      <small><ValueDisplay kind="currency" value={milestone.threshold} /></small>
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
          ) : null}

          <div className="page-toolbar">
            <Segmented<DividendsTab>
              options={[
                { label: '总览', value: 'overview' },
                { label: '分红日历', value: 'calendar' },
                { label: `分红明细${pendingCount > 0 ? ` (${pendingCount})` : ''}`, value: 'dividends' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'overview' && dividends.length > 0 ? (
            <Table<PortfolioDividendRecord>
              className="watchlist-table"
              columns={dividendColumns}
              dataSource={dividends.slice(0, 8)}
              pagination={false}
              rowKey="id"
              size="small"
              scroll={{ x: 900 }}
            />
          ) : null}

          {tab === 'overview' && dividends.length === 0 ? (
            <Empty description="今年还没有分红记录，可先同步分红或录入持仓">
              <Button onClick={() => void refreshDividends()}>同步分红</Button>
            </Empty>
          ) : null}

          {tab === 'calendar' ? (
            <div className="portfolio-calendar-wrap">
              <Calendar
                fullscreen={false}
                onPanelChange={(value) => {
                  const month = `${value.year()}-${String(value.month() + 1).padStart(2, '0')}`;
                  setCalendarMonth(month);
                  void window.desktop.portfolio.getDividendCalendar(accountId, month).then(setCalendarDays);
                }}
                cellRender={(current, info) => {
                  if (info.type !== 'date') return info.originNode;
                  const key = current.format('YYYY-MM-DD');
                  const items = calendarCellMap.get(key);
                  if (!items?.length) return null;
                  const total = items.reduce((sum, item) => sum + item.cashAmount, 0);
                  return (
                    <ul className="portfolio-calendar-cell">
                      {items.slice(0, 2).map((item, index) => (
                        <li key={`${item.accountId ?? 'all'}-${item.symbol}-${item.status}-${index}`}>
                          {allAccountsView && item.accountId
                            ? `${accountLabels.get(item.accountId) ?? item.accountId} · `
                            : ''}
                          {item.name} <ValueDisplay kind="currency" value={item.cashAmount} />
                        </li>
                      ))}
                      {items.length > 2 ? <li>+{items.length - 2} 条</li> : null}
                      <li className="portfolio-calendar-total">
                        <ValueDisplay kind="currency" value={total} />
                      </li>
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
    </main>
  );
}
