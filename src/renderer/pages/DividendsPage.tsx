import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  Calendar,
  Dropdown,
  Empty,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, CheckOutlined, CloseOutlined, MoreOutlined, SwapOutlined } from '@ant-design/icons';
import type {
  DividendCalendarDay,
  PortfolioDividendRecord,
  PortfolioSummaryView,
} from '../../shared/api.types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../shared/accounts/account-display';
import { quantityPresetForKind } from '../../shared/format/display-presets';
import type { DividendGoalSettings } from '../../shared/portfolio/dividend-goal';
import { computeDividendGoalProgressList } from '../../shared/portfolio/dividend-goal';
import { ValueDisplay } from '../lib/trading-format';
import { AccountSelect } from '../components/trading/AccountSelect';
import { DividendGoalModal } from '../components/trading/DividendGoalModal';
import { DividendGoalPanel } from '../components/trading/DividendGoalPanel';
import { DividendPayoutModeModal } from '../components/trading/DividendPayoutModeModal';
import {
  dividendPayoutModeLabel,
  supportsDividendPayoutMode,
} from '../../shared/portfolio/dividend-payout';

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
  const [goalSettings, setGoalSettings] = useState<DividendGoalSettings | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [payoutRecord, setPayoutRecord] = useState<PortfolioDividendRecord | null>(null);
  const allAccountsView = isAllAccountsId(accountId);

  useEffect(() => {
    void window.desktop.accounts.list().then((accounts) => {
      setAccountLabels(new Map(accounts.map((item) => [item.id, formatAccountSelectLabel(item)])));
    });
  }, []);

  useEffect(() => {
    void window.desktop.portfolio.getDividendGoal(accountId).then(setGoalSettings);
  }, [accountId]);

  const goalProgressList = useMemo(
    () =>
      computeDividendGoalProgressList(goalSettings, {
        ytdReceived: summary?.ytdReceived ?? 0,
        dailyAverage: summary?.dailyAverage ?? 0,
        year: summary?.year ?? new Date().getFullYear(),
      }),
    [goalSettings, summary],
  );

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

  const confirmDividend = useCallback(async (id: string, confirmed: boolean): Promise<void> => {
    const year = new Date().getFullYear();
    try {
      setDividends(await window.desktop.portfolio.confirmDividend(id, confirmed, undefined, accountId, year));
      setSummary(await window.desktop.portfolio.getSummary(accountId, year));
      void message.success(confirmed ? '分红已确认' : '分红已驳回');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '操作失败');
    }
  }, [accountId, message]);

  const dividendColumns = useMemo<ColumnsType<PortfolioDividendRecord>>(
    () => {
      const symbolColumn = {
        title: '标的',
        key: 'symbol',
        width: 220,
        render: (_: unknown, row: PortfolioDividendRecord) => (
          <span className="portfolio-dividend-symbol-cell">
            <strong>{row.name}</strong>
            <br />
            <small>{row.symbol}</small>
          </span>
        ),
      } as const;

      return [
      ...(allAccountsView
        ? [
            {
              title: '账户',
              dataIndex: 'accountId',
              width: 120,
              render: (id: string) => accountLabels.get(id) ?? id,
            } as const,
            symbolColumn,
          ]
        : [symbolColumn]),
      {
        title: '除权日',
        dataIndex: 'exDividendDate',
        width: 108,
      },
      {
        title: '每股派息',
        dataIndex: 'cashPerShare',
        width: 96,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="currency" value={value} />,
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
        width: 120,
        align: 'right',
        render: (value: number, row) => (
          <span className="portfolio-dividend-amount-cell">
            <ValueDisplay kind="currency" value={value} />
            {row.payoutMode === 'reinvest' && row.reinvestQuantity !== null ? (
              <>
                <br />
                <small>
                  <ValueDisplay kind={quantityPresetForKind(row.kind)} value={row.reinvestQuantity} /> 份
                </small>
              </>
            ) : null}
          </span>
        ),
      },
      {
        title: '分红方式',
        dataIndex: 'payoutMode',
        width: 108,
        render: (mode: PortfolioDividendRecord['payoutMode'], row) =>
          supportsDividendPayoutMode(row.kind) ? (
            <Tag color={mode === 'reinvest' ? 'purple' : 'default'}>{dividendPayoutModeLabel(mode)}</Tag>
          ) : (
            <Tag>{dividendPayoutModeLabel('cash')}</Tag>
          ),
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
        width: 64,
        fixed: 'right',
        align: 'center',
        render: (_, row) => {
          const items = [
            ...(supportsDividendPayoutMode(row.kind)
              ? [
                  {
                    key: 'payout-mode',
                    label: '分红方式',
                    icon: <SwapOutlined />,
                    onClick: () => setPayoutRecord(row),
                  },
                ]
              : []),
            ...(row.status === 'estimated'
              ? [
                  {
                    key: 'confirm',
                    label: '确认',
                    icon: <CheckOutlined />,
                    onClick: () => void confirmDividend(row.id, true),
                  },
                  {
                    key: 'reject',
                    label: '驳回',
                    icon: <CloseOutlined />,
                    danger: true,
                    onClick: () => void confirmDividend(row.id, false),
                  },
                ]
              : []),
          ];
          if (items.length === 0) return null;
          return (
            <Dropdown trigger={['click']} menu={{ items }}>
              <Button type="text" size="small" icon={<MoreOutlined />} aria-label="操作菜单" />
            </Dropdown>
          );
        },
      },
    ];
    },
    [accountLabels, allAccountsView, confirmDividend],
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

          <DividendGoalPanel
            progressList={goalProgressList}
            allAccountsView={allAccountsView}
            year={summary?.year ?? new Date().getFullYear()}
            onEdit={() => setGoalModalOpen(true)}
          />

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
              scroll={{ x: 1080 }}
            />
          ) : null}

          {tab === 'overview' && dividends.length === 0 ? (
            <Empty description="今年还没有分红记录，可先同步分红或录入持仓">
              <Button onClick={() => void refreshDividends()}>同步分红</Button>
            </Empty>
          ) : null}

          {tab === 'calendar' ? (
            <div className="portfolio-calendar-wrap portfolio-dividend-calendar-wrap">
              <Calendar
                fullscreen={false}
                mode="month"
                value={dayjs(`${calendarMonth}-01`)}
                headerRender={({ value }) => (
                  <div className="portfolio-calendar-panel-head">
                    <strong>{value.year()}年{value.month() + 1}月</strong>
                    <span>除权日分红</span>
                  </div>
                )}
                onPanelChange={(value, mode) => {
                  if (mode !== 'month') return;
                  const month = `${value.year()}-${String(value.month() + 1).padStart(2, '0')}`;
                  setCalendarMonth(month);
                  void window.desktop.portfolio.getDividendCalendar(accountId, month).then(setCalendarDays);
                }}
                cellRender={(current, info) => {
                  if (info.type !== 'date') return info.originNode;
                  const key = current.format('YYYY-MM-DD');
                  const items = calendarCellMap.get(key);
                  if (!items?.length) return null;
                  return (
                    <ul className="portfolio-calendar-cell portfolio-dividend-calendar-cell">
                      {items.slice(0, 2).map((item, index) => (
                        <li key={`${item.accountId ?? 'all'}-${item.symbol}-${item.status}-${index}`}>
                          {item.name}{' '}
                          <ValueDisplay kind="currency" value={item.cashAmount} />
                        </li>
                      ))}
                      {items.length > 2 ? <li>+{items.length - 2} 条</li> : null}
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
                scroll={{ x: 1080 }}
              />
            )
          ) : null}
        </>
      )}

      <DividendGoalModal
        open={goalModalOpen}
        accountId={accountId}
        settings={goalSettings}
        onClose={() => setGoalModalOpen(false)}
        onSaved={setGoalSettings}
      />

      <DividendPayoutModeModal
        open={payoutRecord !== null}
        record={payoutRecord}
        listAccountId={accountId}
        year={summary?.year ?? new Date().getFullYear()}
        onClose={() => setPayoutRecord(null)}
        onSaved={(records) => {
          setDividends(records);
          void window.desktop.portfolio.getSummary(accountId, summary?.year ?? new Date().getFullYear()).then(setSummary);
        }}
      />
    </main>
  );
}
