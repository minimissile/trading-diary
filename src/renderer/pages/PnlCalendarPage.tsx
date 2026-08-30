import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Calendar, Empty, Skeleton, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import type { PortfolioPnlCalendarView } from '../../shared/portfolio/types';
import { currentMonthPrefix, formatMonthPrefix, parseMonthPrefix } from '../../shared/portfolio/pnl-calendar-window';
import { AccountSelect } from '../components/trading/AccountSelect';
import { AnimatedValueDisplay, ValueDisplay } from '../lib/trading-format';
import { routePaths } from '../router/paths';

function monthFromDayjs(value: Dayjs): string {
  return formatMonthPrefix(value.year(), value.month() + 1);
}

/**
 * 近一年持仓收益日历（含浮盈日变动 + 分红；统计窗口最多 365 天）。
 */
export function PnlCalendarPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [calendarMonth, setCalendarMonth] = useState(currentMonthPrefix());
  const [view, setView] = useState<PortfolioPnlCalendarView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setView(await window.desktop.portfolio.getPnlCalendar(accountId, calendarMonth));
    } finally {
      setLoading(false);
    }
  }, [accountId, calendarMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayMap = useMemo(() => {
    const map = new Map<string, PortfolioPnlCalendarView['days'][number]>();
    for (const day of view?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [view?.days]);

  const monthOptions = useMemo(() => {
    if (!view) return [calendarMonth];
    const end = dayjs(view.windowEnd);
    const start = dayjs(view.windowStart);
    const options: string[] = [];
    let cursor = end.startOf('month');
    while (cursor.isAfter(start, 'month') || cursor.isSame(start, 'month')) {
      options.push(monthFromDayjs(cursor));
      cursor = cursor.subtract(1, 'month');
    }
    return options;
  }, [calendarMonth, view]);

  const summary = view?.summary;
  const disabledDate = useCallback(
    (current: Dayjs): boolean => {
      if (!view) return false;
      const key = current.format('YYYY-MM-DD');
      return key < view.windowStart || key > view.windowEnd;
    },
    [view],
  );

  return (
    <main className="workspace-page portfolio-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PNL CALENDAR</p>
          <h1>收益日历</h1>
          <p className="page-intro">
            基于本地缓存的近一年日收盘价，汇总持仓浮盈变动与分红；首次打开会后台同步行情（串行限流）。
          </p>
        </div>
        <div className="portfolio-header-actions">
          <AccountSelect
            value={accountId}
            onChange={setAccountId}
            includeAllOption
            className="portfolio-account-select"
          />
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(routePaths.positions)}>
            返回持仓
          </Button>
        </div>
      </header>

      {loading ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : !view ? (
        <Empty description="暂无收益数据" />
      ) : (
        <>
          {view.missingBarSymbols.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              className="portfolio-inline-alert"
              message={`${view.missingBarSymbols.length} 个标的尚未同步历史收盘价，对应日期可能为空`}
              description={view.missingBarSymbols.slice(0, 8).join('、')}
            />
          ) : null}

          <section className="portfolio-summary-grid pnl-calendar-summary">
            <article className={summary && summary.totalPnl >= 0 ? 'metric-profit' : 'metric-loss'}>
              <small>本月合计</small>
              <AnimatedValueDisplay kind="currency" value={summary?.totalPnl ?? 0} />
            </article>
            <article>
              <small>有效交易日</small>
              <strong>{summary?.activeDays ?? 0}</strong>
            </article>
            <article>
              <small>盈利 / 亏损天</small>
              <strong>
                {summary?.positiveDays ?? 0} / {summary?.negativeDays ?? 0}
              </strong>
            </article>
            <article>
              <small>分红贡献</small>
              <ValueDisplay kind="currency" value={summary?.dividendPnl ?? 0} />
            </article>
          </section>

          <div className="pnl-calendar-toolbar">
            <Tag color="blue">
              统计窗口 {view.windowStart} ~ {view.windowEnd}
            </Tag>
            <div className="pnl-calendar-month-tabs">
              {monthOptions.map((month) => {
                const { year, month: monthIndex } = parseMonthPrefix(month);
                return (
                  <Button
                    key={month}
                    size="small"
                    type={month === calendarMonth ? 'primary' : 'default'}
                    onClick={() => setCalendarMonth(month)}
                  >
                    {year}年{monthIndex}月
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="portfolio-calendar-wrap pnl-calendar-wrap">
            <Calendar
              fullscreen={false}
              value={dayjs(`${calendarMonth}-01`)}
              disabledDate={disabledDate}
              onPanelChange={(value) => {
                const nextMonth = monthFromDayjs(value);
                if (monthOptions.includes(nextMonth)) {
                  setCalendarMonth(nextMonth);
                }
              }}
              cellRender={(current, info) => {
                if (info.type !== 'date') return info.originNode;
                const key = current.format('YYYY-MM-DD');
                const day = dayMap.get(key);
                if (!day || Math.abs(day.totalPnl) < 1e-8) return null;

                const positive = day.totalPnl > 0;
                return (
                  <div className={`pnl-calendar-cell ${positive ? 'pnl-calendar-cell--up' : 'pnl-calendar-cell--down'}`}>
                    <ValueDisplay kind="currency" value={day.totalPnl} />
                    {day.dividendPnl > 0 ? <small>含分红</small> : null}
                  </div>
                );
              }}
            />
          </div>
        </>
      )}
    </main>
  );
}
