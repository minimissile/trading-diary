import { useMemo, useState } from 'react';
import { Alert, Button, Dropdown, Empty, Input, Segmented, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MoreOutlined, ReloadOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import type { MarketQuote } from '../../../shared/market/types';
import type { PersonalWatchlistItem, WatchlistGroup } from '../../../shared/watchlist/personal';
import { instrumentPositionKey } from '../../../shared/market/instrument-id';
import { labelForVenue } from '../../../shared/market/venues';
import { formatDateTime, formatPrice, ValueDisplay } from '../../lib/trading-format';
import { hasReachedReminder, isWatchlistQuoteFresh, useWatchlistAction } from './watchlist-utils';
import { WatchlistGroupsModal } from './WatchlistGroupsModal';

type Filter = 'all' | 'starred' | 'reached';
type Sort = 'manual' | 'change' | 'added';
export function PersonalWatchlist({
  items,
  groups,
  quotes,
  loading,
  refreshing,
  quoteError,
  onRefresh,
  onAdd,
  onSelect,
}: {
  items: PersonalWatchlistItem[];
  groups: WatchlistGroup[];
  quotes: MarketQuote[];
  loading: boolean;
  refreshing: boolean;
  quoteError: Error | null;
  onRefresh: () => void;
  onAdd: () => void;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('manual');
  const [manageGroups, setManageGroups] = useState(false);
  const { busy, run } = useWatchlistAction();
  const quoteMap = useMemo(() => new Map(quotes.map((quote) => [instrumentPositionKey(quote), quote])), [quotes]);
  const groupsMap = new Map(groups.map((group) => [group.id, group.name]));
  const quoteFor = (item: PersonalWatchlistItem) => quoteMap.get(instrumentPositionKey(item));
  const reached = items.filter((item) => hasReachedReminder(item, quoteFor(item))).length;
  const effectiveGroupId = groupId === 'ungrouped' || groups.some((group) => group.id === groupId) ? groupId : 'all';
  const visible = items
    .filter((item) => {
      const text = `${item.name} ${item.symbol} ${item.tags.join(' ')} ${item.latestLog ?? ''}`.toLowerCase();
      return (
        text.includes(search.trim().toLowerCase()) &&
        (effectiveGroupId === 'all' ||
          (effectiveGroupId === 'ungrouped' ? item.groupIds.length === 0 : item.groupIds.includes(effectiveGroupId))) &&
        (filter === 'all' || (filter === 'starred' ? item.starred : hasReachedReminder(item, quoteFor(item))))
      );
    })
    .sort((a, b) => {
      if (sort === 'added') return b.createdAt.localeCompare(a.createdAt) || a.position - b.position;
      if (sort === 'change')
        return (quoteFor(b)?.changePercent ?? -Infinity) - (quoteFor(a)?.changePercent ?? -Infinity) || a.position - b.position;
      return Number(b.starred) - Number(a.starred) || a.position - b.position;
    });
  const manualMoves = sort === 'manual' && !search.trim() && effectiveGroupId === 'all' && filter !== 'reached';
  const unavailable = items.filter((item) => !isWatchlistQuoteFresh(quoteFor(item))).length;
  const columns: ColumnsType<PersonalWatchlistItem> = [
    {
      title: '',
      key: 'star',
      width: 48,
      fixed: 'left',
      render: (_, row) => (
        <Button
          type="text"
          className={row.starred ? 'watchlist-star is-starred' : 'watchlist-star'}
          aria-label={`${row.starred ? '取消重点关注' : '重点关注'}${row.name}`}
          aria-pressed={row.starred}
          disabled={busy}
          icon={row.starred ? <StarFilled /> : <StarOutlined />}
          onClick={() => void run(() => window.desktop.watchlist.update(row.id, { starred: !row.starred }))}
        />
      ),
    },
    {
      title: '股票',
      key: 'symbol',
      width: 160,
      fixed: 'left',
      render: (_, row) => (
        <div>
          <button className="watchlist-symbol-button" type="button" onClick={() => onSelect(row.id)}>
            <strong>{row.name}</strong>
            <small>
              {row.symbol} · {labelForVenue(row.venue)} · {row.quoteCurrency}
            </small>
          </button>
          {row.holding ? (
            <Tag className="watchlist-holding-tag" color="processing">
              已持仓
            </Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: '最新价 / 涨跌幅',
      key: 'price',
      align: 'right',
      width: 142,
      render: (_, row) => {
        const quote = quoteFor(row);
        return (
          <Tooltip title={quote ? `行情获取时间：${formatDateTime(quote.fetchedAt)}` : '行情暂不可用，可重试刷新'}>
            <div className="watchlist-price-cell">
              <strong>{quote?.price == null ? '—' : formatPrice(quote.price)}</strong>
              <ValueDisplay kind="percent" value={quote?.changePercent ?? null} />
              {!isWatchlistQuoteFresh(quote) ? <small>{quote ? '行情已过期' : '暂无行情'}</small> : null}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: '加入后涨跌',
      key: 'since',
      align: 'right',
      width: 115,
      render: (_, row) => {
        const price = quoteFor(row)?.price;
        return (
          <Tooltip
            title={
              row.addedPrice
                ? `加入时参考价 ${formatPrice(row.addedPrice)} · ${row.addedPriceAt ? formatDateTime(row.addedPriceAt) : ''}；仅价格变化，非持仓收益`
                : '加入时未取得有效行情，不补填参考价格'
            }
          >
            <span>
              <ValueDisplay kind="percent" value={row.addedPrice && price != null ? (price / row.addedPrice - 1) * 100 : null} />
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '提醒价格',
      key: 'reminder',
      width: 155,
      render: (_, row) => (
        <button type="button" className="watchlist-text-button" onClick={() => onSelect(row.id)}>
          {row.reminder ? (
            <>
              <strong>
                {row.reminder.condition === 'at_or_above' ? '≥' : '≤'} {formatPrice(row.reminder.targetPrice)}
              </strong>
              <small>
                {row.reminder.status === 'triggered'
                  ? '已触发提醒'
                  : row.reminder.status === 'disabled'
                    ? '已停用'
                    : row.reminder.status === 'completed'
                      ? '已完成'
                      : hasReachedReminder(row, quoteFor(row))
                        ? '已达提醒价'
                        : '监控中'}
              </small>
            </>
          ) : (
            <span className="watchlist-muted">设置提醒价格</span>
          )}
        </button>
      ),
    },
    {
      title: '跟踪日志',
      key: 'logs',
      width: 245,
      render: (_, row) => (
        <button type="button" className="watchlist-text-button watchlist-log-preview" onClick={() => onSelect(row.id)}>
          <span>{row.latestLog ?? '记录今天的复盘与盘感'}</span>
          <small>{row.latestLogDate ? `${row.latestLogDate} · 共 ${row.logCount} 条` : '添加第一条跟踪日志'}</small>
        </button>
      ),
    },
    {
      title: '分组 / 标签',
      key: 'groups',
      width: 175,
      render: (_, row) => (
        <div className="watchlist-tags">
          {row.groupIds.map((id) => (
            <Tag key={id}>{groupsMap.get(id) ?? '—'}</Tag>
          ))}
          {row.tags.map((tag) => (
            <Tag key={tag} bordered={false}>
              {tag}
            </Tag>
          ))}
          {row.groupIds.length === 0 && row.tags.length === 0 ? <span className="watchlist-muted">未分组</span> : null}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 58,
      fixed: 'right',
      render: (_, row) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'detail', label: '打开跟踪日志' },
              {
                key: 'up',
                label: '上移',
                disabled: !manualMoves || busy || items.filter((item) => item.starred === row.starred)[0]?.id === row.id,
              },
              {
                key: 'down',
                label: '下移',
                disabled: !manualMoves || busy || items.filter((item) => item.starred === row.starred).at(-1)?.id === row.id,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'detail') onSelect(row.id);
              else void run(() => window.desktop.watchlist.move(row.id, key as 'up' | 'down'));
            },
          }}
        >
          <Button className="ui-icon-button" aria-label={`${row.name}的更多操作`} icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <section className="watchlist-overview" aria-label="自选概览">
        <div>
          <span>我的自选</span>
          <strong>
            {items.length}
            <small>只标的</small>
          </strong>
        </div>
        <div>
          <span>重点关注</span>
          <strong>
            {items.filter((item) => item.starred).length}
            <small>只标的</small>
          </strong>
        </div>
        <div>
          <span>已达提醒价格</span>
          <strong>
            {reached}
            <small>只标的</small>
          </strong>
        </div>
        <div>
          <span>持续跟踪</span>
          <strong>
            {items.reduce((sum, item) => sum + item.logCount, 0)}
            <small>条日志</small>
          </strong>
        </div>
      </section>
      <section className="watchlist-results" aria-label="我的自选列表">
        <div className="watchlist-results-heading">
          <h2>
            观察清单 <span>{visible.length}</span>
          </h2>
          <Space>
            <Button onClick={() => setManageGroups(true)}>管理分组</Button>
            <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>
              刷新行情
            </Button>
          </Space>
        </div>
        <div className="watchlist-controls personal-watchlist-controls">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'starred', label: '重点关注' },
              { value: 'reached', label: '已达提醒价' },
            ]}
          />
          <div className="watchlist-filter-controls">
            <Select
              aria-label="筛选分组"
              value={effectiveGroupId}
              onChange={setGroupId}
              options={[
                { value: 'all', label: '全部分组' },
                { value: 'ungrouped', label: '未分组' },
                ...groups.map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
            <Select<Sort>
              aria-label="排序方式"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'manual', label: '手动排序' },
                { value: 'change', label: '涨跌幅排序' },
                { value: 'added', label: '最近添加' },
              ]}
            />
            <Input
              className="watchlist-search"
              aria-label="搜索自选股"
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="搜索股票、标签或跟踪日志"
            />
          </div>
        </div>
        {quoteError ? (
          <Alert
            type="warning"
            showIcon
            title="行情刷新失败，已保存的自选与日志仍可查看"
            description={quoteError.message}
            action={<Button onClick={onRefresh}>重试</Button>}
          />
        ) : unavailable && !refreshing ? (
          <p className="watchlist-sync-note">{unavailable} 只标的行情缺失或已过期，价格条件暂不判断。</p>
        ) : null}
        <Table<PersonalWatchlistItem>
          className="watchlist-table"
          columns={columns}
          dataSource={visible}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 1200 }}
          loading={loading}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={items.length ? '没有符合筛选条件的股票' : '把想持续观察的股票放在这里'}
              >
                {items.length ? (
                  <Button
                    onClick={() => {
                      setFilter('all');
                      setGroupId('all');
                      setSearch('');
                    }}
                  >
                    清除筛选
                  </Button>
                ) : (
                  <Button type="primary" onClick={onAdd}>
                    添加第一只自选股
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </section>
      {manageGroups ? <WatchlistGroupsModal groups={groups} onClose={() => setManageGroups(false)} /> : null}
    </>
  );
}
