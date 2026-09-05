import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Calendar, Empty, Select, Skeleton, Spin } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import type { PortfolioPnlCalendarView } from '../../shared/portfolio/types';
import {
  currentMonthPrefix,
  formatMonthPrefix,
  parseMonthPrefix,
  resolvePnlCalendarPanelDate,
} from '../../shared/portfolio/pnl-calendar-window';
import { AccountSelect } from '../components/trading/AccountSelect';
import { usePnlCalendarQuery } from '../lib/queries';
import { AnimatedValueDisplay, ValueDisplay } from '../lib/trading-format';
import { routePaths } from '../router/paths';

function monthFromDayjs(value: Dayjs): string {
  return formatMonthPrefix(value.year(), value.month() + 1);
}

function formatMonthLabel(month: string): string {
  const { year, month: monthIndex } = parseMonthPrefix(month);
  return `${year}年${monthIndex}月`;
}

/**
 * 近一年持仓收益日历（含浮盈日变动 + 分红；统计窗口最多 365 天）。
 */
export function PnlCalendarPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [calendarMonth, setCalendarMonth] = useState(currentMonthPrefix());
  const {
    view,
    isLoading: loading,
    isFetching: refreshing,
    isPlaceholderData,
    error: queryError,
    refetch,
  } = usePnlCalendarQuery(accountId, calendarMonth);
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const syncRunId = useRef(0);
  const autoSyncAccountRef = useRef<string | null>(null);

  const refreshCalendar = refetch;

  const runSync = useCallback(
    async (symbols: readonly string[]): Promise<void> => {
      if (symbols.length === 0) return;

      const runId = syncRunId.current + 1;
      syncRunId.current = runId;
      setSyncing(true);
      setSyncErrors([]);

      const failed: string[] = [];
      for (let index = 0; index < symbols.length; index += 1) {
        if (syncRunId.current !== runId) return;
        const symbol = symbols[index]!;
        setSyncLabel(`${symbol} 正在同步历史收盘价… (${index + 1}/${symbols.length})`);
        try {
          const result = await window.desktop.portfolio.syncPnlCalendarBar(accountId, symbol);
          const item = result.items[0];
          const label = item?.name ?? symbol;
          if (item?.error) failed.push(`${label}: ${item.error}`);
          else setSyncLabel(`${label} 正在同步历史收盘价… (${index + 1}/${symbols.length})`);
        } catch (error) {
          failed.push(`${symbol}: ${error instanceof Error ? error.message : '同步失败'}`);
        }
      }

      if (syncRunId.current !== runId) return;
      setSyncErrors(failed);
      setSyncLabel(null);
      setSyncing(false);
      await refreshCalendar();
    },
    [accountId, refreshCalendar],
  );

  useEffect(() => {
    autoSyncAccountRef.current = null;
  }, [accountId]);

  const viewReady = Boolean(view && !isPlaceholderData && view.month === calendarMonth);

  useEffect(() => {
    if (!viewReady || !view || view.missingBarSymbols.length === 0) return;
    if (autoSyncAccountRef.current === accountId) return;
    autoSyncAccountRef.current = accountId;
    void runSync(view.missingBarSymbols);
  }, [accountId, runSync, view, viewReady]);

  const dayMap = useMemo(() => {
    const map = new Map<string, PortfolioPnlCalendarView['days'][number]>();
    for (const day of view?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [view?.days]);

  const monthOptions = useMemo(() => {
    if (!view) return [{ label: formatMonthLabel(calendarMonth), value: calendarMonth }];
    const end = dayjs(view.windowEnd);
    const start = dayjs(view.windowStart);
    const options: Array<{ label: string; value: string }> = [];
    let cursor = end.startOf('month');
    while (cursor.isAfter(start, 'month') || cursor.isSame(start, 'month')) {
      const value = monthFromDayjs(cursor);
      options.push({ label: formatMonthLabel(value), value });
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

  const calendarPanelValue = useMemo((): Dayjs | undefined => {
    if (!viewReady || !view) return undefined;
    const anchor = resolvePnlCalendarPanelDate(calendarMonth, view.windowStart, view.windowEnd);
    return dayjs(anchor);
  }, [calendarMonth, view, viewReady]);

  const handleManualSync = (): void => {
    if (!view) return;
    const symbols = view.missingBarSymbols;
    if (symbols.length === 0) {
      setSyncLabel('行情已是最新，正在刷新日历…');
      void refreshCalendar().finally(() => setSyncLabel(null));
      return;
    }
    void runSync(symbols);
  };

  return (
    <main className="workspace-page portfolio-page pnl-calendar-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PNL CALENDAR</p>
          <h1>收益日历</h1>
          <p className="page-intro">历史日期基于日收盘价；当日与持仓中心一致（实时行情）。仅统计持仓期间，不构成投资建议。</p>
        </div>
        <div className="portfolio-header-actions">
          <AccountSelect value={accountId} onChange={setAccountId} includeAllOption className="portfolio-account-select" />
          <Button
            icon={<ReloadOutlined spin={syncing || refreshing} />}
            loading={syncing}
            onClick={() => void handleManualSync()}
          >
            同步行情
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(routePaths.positions)}>
            返回持仓
          </Button>
        </div>
      </header>

      {syncLabel ? (
        <div className="pnl-calendar-sync-status" role="status" aria-live="polite">
          <Spin size="small" />
          <span>{syncLabel}</span>
        </div>
      ) : null}

      {!syncing && syncErrors.length > 0 ? (
        <Alert
          className="calendar-notice"
          type="error"
          showIcon
          title="部分标的同步失败"
          description={
            <div>
              已有数据仍可查看。
              <details className="calendar-sync-errors">
                <summary>查看失败详情</summary>
                {syncErrors.slice(0, 3).map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </details>
            </div>
          }
        />
      ) : null}

      {queryError ? (
        <Alert
          className="calendar-notice"
          type="error"
          showIcon
          title="收益日历加载失败"
          description={queryError.message}
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : null}

      {!syncing && viewReady && view && view.missingBarSymbols.length > 0 && !syncLabel ? (
        <Alert
          className="calendar-notice"
          type="warning"
          showIcon
          title={`${view.missingBarSymbols.length} 个标的尚未同步历史收盘价`}
          description={`${view.missingBarSymbols.slice(0, 6).join('、')}${view.missingBarSymbols.length > 6 ? '…' : ''}。可点击「同步行情」重试`}
        />
      ) : null}

      {(loading && !view) || (view && !viewReady) ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : !view ? (
        <Empty description="暂无收益数据，请先录入持仓流水" />
      ) : (
        <>
          <section className="portfolio-metrics calendar-summary">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>本月合计</small>
              <AnimatedValueDisplay
                as="strong"
                cacheKey={`pnl-calendar:${accountId}:${calendarMonth}:total`}
                kind="pnl"
                value={summary?.totalPnl ?? 0}
              />
              <span>{formatMonthLabel(calendarMonth)}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>有效交易日</small>
              <strong>{summary?.activeDays ?? 0}</strong>
              <span>
                盈利 {summary?.positiveDays ?? 0} · 亏损 {summary?.negativeDays ?? 0}
              </span>
            </article>
            <article className="portfolio-metric-card">
              <small>分红贡献</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.dividendPnl ?? 0} />
              <span>除息日到账</span>
            </article>
          </section>

          <div className="portfolio-calendar-wrap pnl-calendar-wrap">
            <Calendar
              fullscreen={false}
              mode="month"
              value={calendarPanelValue}
              disabledDate={disabledDate}
              headerRender={({ value }) => (
                <div className="pnl-calendar-panel-head">
                  <div>
                    <strong>
                      {value.year()}年{value.month() + 1}月
                    </strong>
                    <span>按日汇总持仓盈亏</span>
                  </div>
                  <Select aria-label="选择收益月份" options={monthOptions} value={calendarMonth} onChange={setCalendarMonth} />
                </div>
              )}
              onPanelChange={(value, mode) => {
                if (mode !== 'month') return;
                const nextMonth = monthFromDayjs(value);
                if (monthOptions.some((item) => item.value === nextMonth)) {
                  setCalendarMonth(nextMonth);
                }
              }}
              cellRender={(current, info) => {
                if (info.type !== 'date') return info.originNode;
                const key = current.format('YYYY-MM-DD');
                const day = dayMap.get(key);
                if (!day || Math.abs(day.totalPnl) < 1e-8) return null;

                return (
                  <ul className="portfolio-calendar-cell pnl-calendar-cell">
                    <li>
                      <ValueDisplay kind="pnl" value={day.totalPnl} />
                    </li>
                    {day.dividendPnl > 0 ? <li className="pnl-calendar-cell-note">含分红</li> : null}
                  </ul>
                );
              }}
            />
            <footer className="calendar-window-note">
              统计窗口 {view.windowStart} 至 {view.windowEnd} · 近一年滚动
            </footer>
          </div>
        </>
      )}
    </main>
  );
}
