import { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, App, Button, Calendar, Dropdown, Empty, Segmented, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  InfoCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  CloseOutlined,
  MoreOutlined,
  SwapOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { DividendCalendarDay, PortfolioDividendRecord } from '../../shared/api.types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../shared/accounts/account-display';
import { quantityPresetForKind } from '../../shared/format/display-presets';
import { computeDividendGoalProgressList } from '../../shared/portfolio/dividend-goal';
import { invalidatePortfolio, useAccountsQuery, useDividendGoalQuery, useDividendsDashboardQuery } from '../lib/queries';
import { AnimatedValueDisplay, ValueDisplay } from '../lib/trading-format';
import { AccountSelect } from '../components/trading/AccountSelect';
import { DividendGoalModal } from '../components/trading/DividendGoalModal';
import { DividendGoalPanel } from '../components/trading/DividendGoalPanel';
import { DividendMilestoneWall } from '../components/trading/DividendMilestoneWall';
import { DividendPayoutModeModal } from '../components/trading/DividendPayoutModeModal';
import { dividendPayoutModeLabel, supportsDividendPayoutMode } from '../../shared/portfolio/dividend-payout';

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
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<DividendsTab>('overview');
  const [calendarMonth, setCalendarMonth] = useState(currentMonth());
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const year = new Date().getFullYear();
  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    isError,
    refetch,
  } = useDividendsDashboardQuery(accountId, year, calendarMonth);
  const summary = data?.summary ?? null;
  const dividends = data?.dividends ?? [];
  const calendarDays = data?.calendarDays;
  const { accounts } = useAccountsQuery(false);
  const accountLabels = useMemo(() => new Map(accounts.map((item) => [item.id, formatAccountSelectLabel(item)])), [accounts]);
  const { goalSettings, refetch: refetchGoal } = useDividendGoalQuery(accountId);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [payoutRecord, setPayoutRecord] = useState<PortfolioDividendRecord | null>(null);
  const animationKey = `dividends:${accountId}:${year}`;
  const allAccountsView = isAllAccountsId(accountId);

  const goalProgressList = useMemo(
    () =>
      computeDividendGoalProgressList(goalSettings, {
        ytdReceived: summary?.ytdReceived ?? 0,
        dailyAverage: summary?.dailyAverage ?? 0,
        year: summary?.year ?? new Date().getFullYear(),
      }),
    [goalSettings, summary],
  );

  const changeCalendarMonth = useCallback((value: dayjs.Dayjs): void => {
    setCalendarMonth(`${value.year()}-${String(value.month() + 1).padStart(2, '0')}`);
  }, []);

  const refreshDividends = async (): Promise<void> => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await window.desktop.portfolio.refreshDividends(accountId);
      await refetch();
      void message.success(`已同步 ${result.synced} 条分红，其中 ${result.estimated} 条待确认`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '分红同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const confirmDividend = useCallback(
    async (id: string, confirmed: boolean): Promise<void> => {
      try {
        await window.desktop.portfolio.confirmDividend(id, confirmed, undefined, accountId, year);
        await invalidatePortfolio(accountId, year);
        await refetch();
        void message.success(confirmed ? '分红已确认' : '分红已驳回');
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '操作失败');
      }
    },
    [accountId, message, refetch, year],
  );

  const dividendColumns = useMemo<ColumnsType<PortfolioDividendRecord>>(() => {
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
            <Tag className={`dividend-tag--${mode}`}> {dividendPayoutModeLabel(mode)}</Tag>
          ) : (
            <Tag className="dividend-tag--cash">{dividendPayoutModeLabel('cash')}</Tag>
          ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (status: string) => {
          if (status === 'confirmed') return <Tag className="dividend-tag--confirmed">已确认</Tag>;
          if (status === 'estimated') return <Tag className="dividend-tag--pending">待确认</Tag>;
          return <Tag className="dividend-tag--rejected">已驳回</Tag>;
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
            <Dropdown classNames={{ root: 'dividend-overlay dividend-menu' }} trigger={['click']} menu={{ items }}>
              <Button className="dividend-row-action" size="small" icon={<MoreOutlined />} aria-label="操作菜单" />
            </Dropdown>
          );
        },
      },
    ];
  }, [accountLabels, allAccountsView, confirmDividend]);

  const calendarCellMap = useMemo(() => {
    const map = new Map<string, DividendCalendarDay['items']>();
    for (const day of calendarDays ?? []) {
      map.set(day.date, day.items);
    }
    return map;
  }, [calendarDays]);

  const pendingCount = dividends.filter((item) => item.status === 'estimated').length;

  return (
    <main className="workspace-page portfolio-page dividends-page">
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
            popupClassName="dividend-overlay dividend-account-popup"
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={syncing || refreshing}
            onClick={() => void refreshDividends()}
          >
            同步分红
          </Button>
        </div>
      </header>

      <details className="dividend-source-note">
        <summary>
          <InfoCircleOutlined aria-hidden="true" />
          <span>统计口径：累计分红仅含已确认记录，预期分红单独展示</span>
          <span className="dividend-source-toggle">查看说明</span>
        </summary>
        <p>
          股息来自公开 API 与用户录入，可能与券商对账单不一致。{allAccountsView ? '当前汇总全部账户。' : ''}
          点亮墙按当年已确认累计分红计算，不含预期分红；日均分红按日历天折算。不构成投资建议。
        </p>
      </details>

      {isError ? (
        <Alert
          type="error"
          showIcon
          title="分红数据加载失败"
          description="请检查连接后重试，已有数据会继续保留。"
          action={
            <Button onClick={() => void refetch()} loading={refreshing}>
              重试
            </Button>
          }
        />
      ) : null}

      {loading && !summary ? (
        <Skeleton active paragraph={{ rows: 14 }} />
      ) : !summary ? (
        isError ? null : (
          <Empty description="暂无分红统计" />
        )
      ) : (
        <>
          <section className="portfolio-metrics portfolio-metrics--four" key={animationKey}>
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>今年累计分红</small>
              <AnimatedValueDisplay
                as="strong"
                kind="currency"
                value={summary?.ytdReceived ?? 0}
                cacheKey={`${animationKey}:ytdReceived`}
              />
              <span>已确认 · {summary?.year ?? new Date().getFullYear()}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>预期分红</small>
              <AnimatedValueDisplay
                as="strong"
                kind="currency"
                value={summary?.expectedDividend ?? 0}
                cacheKey={`${animationKey}:expectedDividend`}
              />
              <span>已公告待除权</span>
            </article>
            <article className="portfolio-metric-card">
              <small>日均分红</small>
              <AnimatedValueDisplay
                as="strong"
                kind="currency"
                value={summary?.dailyAverage ?? 0}
                cacheKey={`${animationKey}:dailyAverage`}
              />
              <span>按日历天折算</span>
            </article>
            <article className="portfolio-metric-card">
              <small>持仓市值</small>
              <AnimatedValueDisplay
                as="strong"
                kind="currency"
                value={summary?.totalMarketValue ?? 0}
                cacheKey={`${animationKey}:totalMarketValue`}
              />
              <span>
                成本 <AnimatedValueDisplay kind="currency" value={summary?.totalCost ?? 0} cacheKey={`${animationKey}:cost`} />
              </span>
            </article>
          </section>

          <div className="page-toolbar dividend-view-toolbar">
            <Segmented<DividendsTab>
              options={[
                { label: '总览', value: 'overview' },
                { label: '分红日历', value: 'calendar' },
                { label: `分红明细${pendingCount > 0 ? ` (${pendingCount})` : ''}`, value: 'dividends' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <span className="dividend-update-time">
              <ClockCircleOutlined aria-hidden="true" />
              {syncing || refreshing
                ? '正在更新…'
                : summary.lastRefreshedAt
                  ? `上次同步 ${dayjs(summary.lastRefreshedAt).format('MM-DD HH:mm')}`
                  : '尚未同步'}
            </span>
          </div>

          {tab === 'overview' ? (
            <>
              <DividendGoalPanel
                progressList={goalProgressList}
                animationKey={animationKey}
                allAccountsView={allAccountsView}
                year={summary?.year ?? new Date().getFullYear()}
                onEdit={() => setGoalModalOpen(true)}
              />

              <DividendMilestoneWall
                key={animationKey}
                milestones={summary.milestones}
                received={summary.ytdReceived}
                animationKey={animationKey}
              />
            </>
          ) : null}

          {tab === 'overview' && dividends.length > 0 ? (
            <section className="dividend-recent-records">
              <div className="dividend-section-heading">
                <h2>最近分红</h2>
                <Button type="text" onClick={() => setTab('dividends')}>
                  查看全部 <RightOutlined />
                </Button>
              </div>
              <Table<PortfolioDividendRecord>
                className="watchlist-table"
                columns={dividendColumns}
                dataSource={dividends.slice(0, 8)}
                pagination={false}
                rowKey="id"
                size="small"
                scroll={{ x: 1080 }}
              />
            </section>
          ) : null}

          {tab === 'overview' && dividends.length === 0 ? (
            <Empty description="今年还没有分红记录，可先同步分红或录入持仓">
              <Button loading={syncing || refreshing} onClick={() => void refreshDividends()}>
                同步分红
              </Button>
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
                    <div className="portfolio-calendar-panel-nav">
                      <Button
                        type="text"
                        size="small"
                        aria-label="上一月"
                        icon={<LeftOutlined />}
                        onClick={() => changeCalendarMonth(value.clone().subtract(1, 'month'))}
                      />
                      <strong>
                        {value.year()}年{value.month() + 1}月
                      </strong>
                      <Button
                        type="text"
                        size="small"
                        aria-label="下一月"
                        icon={<RightOutlined />}
                        onClick={() => changeCalendarMonth(value.clone().add(1, 'month'))}
                      />
                    </div>
                    <span>除权日分红</span>
                  </div>
                )}
                onPanelChange={(value, mode) => {
                  if (mode !== 'month') return;
                  changeCalendarMonth(value);
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
                          {item.name} <ValueDisplay kind="currency" value={item.cashAmount} />
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
                <Button loading={syncing || refreshing} onClick={() => void refreshDividends()}>
                  同步分红
                </Button>
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
        settings={goalSettings ?? null}
        onClose={() => setGoalModalOpen(false)}
        onSaved={() => {
          void refetchGoal();
          void refetch();
        }}
      />

      <DividendPayoutModeModal
        open={payoutRecord !== null}
        record={payoutRecord}
        listAccountId={accountId}
        year={summary?.year ?? new Date().getFullYear()}
        onClose={() => setPayoutRecord(null)}
        onSaved={() => {
          void refetch();
        }}
      />
    </main>
  );
}
