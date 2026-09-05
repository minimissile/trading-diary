import { useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Empty, Popconfirm, Skeleton, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import dayjs from 'dayjs';
import type { MarketQuote } from '../../../shared/market/types';
import type { PersonalWatchlistItem, TrackingLog, WatchlistGroup } from '../../../shared/watchlist/personal';
import { marketLookupKey } from '../../../shared/market/instrument-id';
import { labelForVenue } from '../../../shared/market/venues';
import { useTrackingLogsQuery } from '../../lib/queries/useWatchlistQueries';
import { invalidateAlerts, invalidatePlans, invalidateWorkspaceData } from '../../lib/queries/invalidate';
import { formatPrice, formatDateTime, ValueDisplay } from '../../lib/trading-format';
import { routePaths } from '../../router/paths';
import { PlanCreateModal } from '../trading/PlanCreateModal';
import { TrackingLogEditor, WatchlistReminderEditor, WatchlistSettingsEditor } from './WatchlistEditors';
import { isWatchlistQuoteFresh, useWatchlistAction } from './watchlist-utils';

export function TrackingDrawer({
  item,
  groups,
  quote,
  onClose,
}: {
  item: PersonalWatchlistItem;
  groups: WatchlistGroup[];
  quote?: MarketQuote;
  onClose: () => void;
}): React.JSX.Element {
  const navigate = useNavigate();
  const logs = useTrackingLogsQuery(item.id);
  const { busy, run } = useWatchlistAction();
  const [editor, setEditor] = useState<TrackingLog | 'new' | null>(null);
  const [settings, setSettings] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [plan, setPlan] = useState(false);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const grouped = new Map<string, TrackingLog[]>();
  for (const log of logs.data ?? []) {
    if (!dateFilter || log.date === dateFilter) grouped.set(log.date, [...(grouped.get(log.date) ?? []), log]);
  }
  const latest = logs.data?.[0];
  const thesis = [
    latest ? `${latest.date}\n${latest.review}\n${latest.feeling}` : '',
    item.waitingFor ? `等待：${item.waitingFor}` : '',
    item.invalidation ? `失效条件：${item.invalidation}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1000);

  return (
    <Drawer
      className="watchlist-tracking-drawer"
      open
      size={740}
      onClose={onClose}
      title={
        <span>
          {item.name}{' '}
          <small>
            {item.symbol} · {labelForVenue(item.venue)}
          </small>
        </span>
      }
    >
      <div className="watchlist-detail-summary">
        <div>
          <span>最新价 · {item.quoteCurrency}</span>
          <strong>{quote?.price == null ? '—' : formatPrice(quote.price)}</strong>
          <ValueDisplay kind="percent" value={quote?.changePercent ?? null} />
        </div>
        <button type="button" className="watchlist-text-button" onClick={() => setReminder(true)}>
          <span>提醒价格</span>
          <strong>
            {item.reminder
              ? `${item.reminder.condition === 'at_or_above' ? '≥' : '≤'} ${formatPrice(item.reminder.targetPrice)}`
              : '点击设置'}
          </strong>
          <small>
            {item.reminder
              ? { active: '监控中', triggered: '已触发', disabled: '已停用', completed: '已完成' }[item.reminder.status]
              : '按价格条件提醒'}
          </small>
        </button>
        <div>
          <span>加入自选</span>
          <strong>{dayjs(item.createdAt).format('YYYY-MM-DD')}</strong>
          <small>{item.holding ? '当前已持仓' : '持续观察中'}</small>
        </div>
      </div>
      <p className="watchlist-detail-sync">
        {quote
          ? `行情获取于 ${formatDateTime(quote.fetchedAt)}${isWatchlistQuoteFresh(quote) ? '' : ' · 已过期'}`
          : '行情暂不可用，仍可记录跟踪日志'}
      </p>
      <div className="watchlist-detail-actions">
        <Space wrap>
          <Button onClick={() => setSettings(true)}>管理自选</Button>
          <Button onClick={() => setReminder(true)}>设置提醒价格</Button>
          <Button disabled={logs.isPending || logs.isError} onClick={() => setPlan(true)}>
            创建交易计划
          </Button>
          {item.holding ? (
            <Button onClick={() => void navigate(`${routePaths.positions}?symbol=${encodeURIComponent(item.symbol)}`)}>
              查看持仓
            </Button>
          ) : null}
        </Space>
        <Popconfirm
          title={`将${item.name}移出自选？`}
          description="停止该自选的价格监控，保留跟踪日志及交易记录。重新添加可恢复日志。"
          onConfirm={async () => {
            if (
              await run(async () => {
                await window.desktop.watchlist.remove(item.id);
                await invalidateAlerts();
              }, '已移出自选')
            )
              onClose();
          }}
        >
          <Button className="ui-icon-button" danger disabled={busy} aria-label="移出自选" icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
      {item.waitingFor || item.invalidation || item.tags.length ? (
        <details className="watchlist-observation-notes">
          <summary>观察条件与标签</summary>
          {item.waitingFor ? (
            <div>
              <strong>正在等什么</strong>
              <p>{item.waitingFor}</p>
            </div>
          ) : null}
          {item.invalidation ? (
            <div>
              <strong>什么情况不再看好</strong>
              <p>{item.invalidation}</p>
            </div>
          ) : null}
          <Space wrap>
            {item.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>
        </details>
      ) : null}
      <section className="watchlist-log-section" aria-label="按日期查看跟踪日志">
        <div className="watchlist-log-heading">
          <div>
            <h2>
              跟踪日志 <span>{logs.data?.length ?? 0}</span>
            </h2>
            <p>留下每天的复盘与盘感，回看判断如何变化。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor('new')}>
            写日志
          </Button>
        </div>
        <DatePicker
          aria-label="筛选日志日期"
          placeholder="按日期查看，默认全部"
          value={dateFilter ? dayjs(dateFilter) : null}
          onChange={(date) => setDateFilter(date?.format('YYYY-MM-DD') ?? null)}
        />
        {logs.isError ? (
          <Alert
            type="error"
            showIcon
            title="跟踪日志加载失败"
            description={logs.error.message}
            action={<Button onClick={() => void logs.refetch()}>重试</Button>}
          />
        ) : logs.isPending ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : grouped.size ? (
          <div className="watchlist-log-timeline">
            {[...grouped].map(([date, entries]) => (
              <section className="watchlist-log-day" key={date}>
                <h3>
                  <span className="watchlist-log-dot" />
                  {date}
                  <small>
                    {dayjs(date).format('ddd')} · {entries.length} 条记录
                  </small>
                </h3>
                {entries.map((log) => (
                  <article className="watchlist-log-entry" key={log.id}>
                    <div className="watchlist-log-entry-meta">
                      <span>
                        {dayjs(log.createdAt).format('HH:mm')} 记录
                        {log.updatedAt !== log.createdAt ? ` · ${formatDateTime(log.updatedAt)} 编辑` : ''}
                      </span>
                      <Space size={4}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          aria-label={`编辑${date}的日志`}
                          onClick={() => setEditor(log)}
                        />
                        <Popconfirm
                          title="删除这条跟踪日志？"
                          onConfirm={() => run(() => window.desktop.watchlist.removeLog(log.id, item.id), '日志已删除')}
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            disabled={busy}
                            icon={<DeleteOutlined />}
                            aria-label={`删除${date}的日志`}
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                    {log.review ? (
                      <div className="watchlist-log-copy">
                        <h4>复盘记录</h4>
                        <p>{log.review}</p>
                      </div>
                    ) : null}
                    {log.feeling ? (
                      <div className="watchlist-log-copy watchlist-feeling">
                        <h4>盘感记录</h4>
                        <p>{log.feeling}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={dateFilter ? '这一天还没有跟踪日志' : '还没有跟踪日志，记录下第一次观察吧'}
          >
            {dateFilter ? (
              <Button onClick={() => setDateFilter(null)}>查看全部日期</Button>
            ) : (
              <Button onClick={() => setEditor('new')}>写第一条日志</Button>
            )}
          </Empty>
        )}
      </section>
      {editor ? (
        <TrackingLogEditor itemId={item.id} log={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />
      ) : null}
      {settings ? <WatchlistSettingsEditor item={item} groups={groups} onClose={() => setSettings(false)} /> : null}
      {reminder ? <WatchlistReminderEditor item={item} onClose={() => setReminder(false)} /> : null}
      {plan ? (
        <PlanCreateModal
          open
          initialValues={{ symbol: marketLookupKey(item), name: `${item.name}交易计划`, thesis, activateNow: false }}
          onClose={() => setPlan(false)}
          onSaved={() => {
            setPlan(false);
            void invalidatePlans();
            void invalidateWorkspaceData();
          }}
        />
      ) : null}
    </Drawer>
  );
}
