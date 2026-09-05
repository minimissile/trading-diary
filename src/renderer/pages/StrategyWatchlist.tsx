import { useMemo, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Segmented, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { DividendPoolItemLive, GrowthPoolItemLive, OverlapPoolItemLive, WatchlistPoolId } from '../../shared/api.types';
import type { DividendEvent } from '../../shared/api.types';
import { useMarketSnapshotQuery, useWatchlistPoolSnapshotQuery, useWatchlistPoolsQuery } from '../lib/queries';
import { formatPrice, ValueDisplay } from '../lib/trading-format';

type PoolTab = WatchlistPoolId;

function formatYield(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)}%`;
}

function stabilityColor(grade: string): string {
  if (grade === 'A+') return 'green';
  if (grade === 'A') return 'blue';
  if (grade === 'A-') return 'default';
  return 'orange';
}

export function StrategyWatchlist({ onAdd }: { onAdd: (symbol: string) => void }): React.JSX.Element {
  const { pools, isLoading: loadingMeta } = useWatchlistPoolsQuery();
  const [search, setSearch] = useState('');
  const [activePool, setActivePool] = useState<PoolTab>('dividend');
  const {
    snapshot,
    error: snapshotError,
    isLoading: loadingSnapshot,
    isFetching: refreshing,
    refetch: refetchSnapshot,
  } = useWatchlistPoolSnapshotQuery(activePool);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const { snapshot: detailSnapshot, isLoading: detailLoading } = useMarketSnapshotQuery(detailSymbol);

  const openDetail = (symbol: string): void => {
    setDetailSymbol(symbol);
  };

  const dividendColumns = useMemo<ColumnsType<DividendPoolItemLive>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        fixed: 'left',
        width: 140,
        render: (_, row) => (
          <button className="watchlist-symbol-button" type="button" onClick={() => void openDetail(row.symbol)}>
            <strong>{row.name}</strong>
            <small>{row.symbol}</small>
          </button>
        ),
      },
      { title: '行业', dataIndex: 'industry', width: 96 },
      {
        title: '最新价',
        key: 'price',
        width: 96,
        align: 'right',
        render: (_, row) => (row.quote?.price === null || row.quote?.price === undefined ? '—' : formatPrice(row.quote.price)),
      },
      {
        title: '涨跌幅',
        key: 'change',
        width: 88,
        align: 'right',
        render: (_, row) => <ValueDisplay kind="percent" value={row.quote?.changePercent ?? null} />,
      },
      {
        title: '实时股息率',
        key: 'liveYield',
        width: 108,
        align: 'right',
        render: (_, row) => formatYield(row.liveYieldPercent),
      },
      {
        title: '参考股息率',
        key: 'refYield',
        width: 108,
        align: 'right',
        render: (_, row) => formatYield(row.referenceYieldPercent),
      },
      {
        title: '2023—2025 股息',
        key: 'dps',
        width: 160,
        render: (_, row) =>
          `${row.dividendPerShare2023.toFixed(2)} / ${row.dividendPerShare2024.toFixed(2)} / ${row.dividendPerShare2025.toFixed(2)}`,
      },
      {
        title: '一手约需',
        key: 'lot',
        width: 108,
        align: 'right',
        render: (_, row) => {
          const cost = row.liveLotCost ?? row.referenceLotCost;
          return <ValueDisplay kind="currency" value={cost} />;
        },
      },
      {
        title: '稳定性',
        dataIndex: 'stability',
        width: 88,
        render: (value: string) => <Tag color={stabilityColor(value)}>{value}</Tag>,
      },
      {
        title: '逻辑与风险',
        dataIndex: 'thesis',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  const growthColumns = useMemo<ColumnsType<GrowthPoolItemLive>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        fixed: 'left',
        width: 140,
        render: (_, row) => (
          <button className="watchlist-symbol-button" type="button" onClick={() => void openDetail(row.symbol)}>
            <strong>{row.name}</strong>
            <small>{row.symbol}</small>
          </button>
        ),
      },
      { title: '行业', dataIndex: 'industry', width: 108 },
      {
        title: '最新价',
        key: 'price',
        width: 96,
        align: 'right',
        render: (_, row) => (row.quote?.price === null || row.quote?.price === undefined ? '—' : formatPrice(row.quote.price)),
      },
      {
        title: '涨跌幅',
        key: 'change',
        width: 88,
        align: 'right',
        render: (_, row) => <ValueDisplay kind="percent" value={row.quote?.changePercent ?? null} />,
      },
      {
        title: '营收 CAGR',
        dataIndex: 'revenueCagrPercent',
        width: 100,
        align: 'right',
        render: (value: number) => formatYield(value),
      },
      {
        title: '净利 CAGR',
        dataIndex: 'profitCagrPercent',
        width: 100,
        align: 'right',
        render: (value: number) => formatYield(value),
      },
      {
        title: '2025 ROE',
        dataIndex: 'roe2025Percent',
        width: 96,
        align: 'right',
        render: (value: number) => formatYield(value),
      },
      {
        title: '实时股息率',
        key: 'yield',
        width: 108,
        align: 'right',
        render: (_, row) => formatYield(row.liveYieldPercent),
      },
      {
        title: '成长驱动',
        dataIndex: 'drivers',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
      },
      {
        title: '主要风险',
        dataIndex: 'risks',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  const overlapColumns = useMemo<ColumnsType<OverlapPoolItemLive>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        fixed: 'left',
        width: 140,
        render: (_, row) => (
          <button className="watchlist-symbol-button" type="button" onClick={() => void openDetail(row.symbol)}>
            <strong>{row.name}</strong>
            <small>{row.symbol}</small>
          </button>
        ),
      },
      { title: '综合定位', dataIndex: 'positioning', width: 160 },
      {
        title: '最新价',
        key: 'price',
        width: 96,
        align: 'right',
        render: (_, row) => (row.quote?.price === null || row.quote?.price === undefined ? '—' : formatPrice(row.quote.price)),
      },
      {
        title: '涨跌幅',
        key: 'change',
        width: 88,
        align: 'right',
        render: (_, row) => <ValueDisplay kind="percent" value={row.quote?.changePercent ?? null} />,
      },
      {
        title: '实时股息率',
        key: 'liveYield',
        width: 108,
        align: 'right',
        render: (_, row) => formatYield(row.liveYieldPercent),
      },
      {
        title: '参考股息率',
        key: 'refYield',
        width: 108,
        align: 'right',
        render: (_, row) => formatYield(row.referenceYieldPercent),
      },
      {
        title: '营收 CAGR',
        key: 'rev',
        width: 100,
        align: 'right',
        render: (_, row) => formatYield(row.revenueCagrPercent),
      },
      {
        title: '净利 CAGR',
        key: 'profit',
        width: 100,
        align: 'right',
        render: (_, row) => formatYield(row.profitCagrPercent),
      },
      {
        title: '注意事项',
        dataIndex: 'notes',
        ellipsis: true,
        render: (value: string) => (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  const activeMeta = pools.find((pool) => pool.id === activePool) ?? snapshot?.meta;
  const matchesSearch = (row: { name: string; symbol: string }): boolean => {
    const query = search.trim().toLowerCase();
    return !query || `${row.name} ${row.symbol}`.toLowerCase().includes(query);
  };
  const tableLoading = loadingMeta || loadingSnapshot;

  return (
    <div className="strategy-watchlist">
      <div className="watchlist-strategy-toolbar">
        <span>按股息、成长与交集策略发现值得跟踪的标的</span>
        <Button icon={<ReloadOutlined spin={refreshing} />} loading={refreshing} onClick={() => void refetchSnapshot()}>
          刷新行情
        </Button>
      </div>

      <section className="watchlist-research" aria-label="观察池说明">
        <div className="watchlist-research-heading">
          <div>
            <h2>{activeMeta?.title ?? '观察清单'}</h2>
            <p>长期观察池，不代表即时买入建议</p>
          </div>
          <div className="watchlist-context">
            <span>
              文档快照 <strong>{activeMeta?.dataDate ?? '—'}</strong>
            </span>
            <span>
              行情更新{' '}
              <strong>
                {snapshot?.fetchedAt
                  ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
                      new Date(snapshot.fetchedAt),
                    )
                  : '—'}
              </strong>
            </span>
          </div>
        </div>
        <details className="watchlist-research-notes">
          <summary>查看研究要点与数据口径</summary>
          <p>财务与 CAGR 为研究文档快照，现价与股息率由东方财富 API 刷新。静态高股息率可能来自股价下跌；进入池不等于可以买入。</p>
          <p>原文配置约束：单一行业不超过 25%，银行选 1—2 只，高速公路选 1 只。</p>
          {snapshot?.highlights.length ? (
            <ul>
              {snapshot.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </details>
      </section>

      <section className="watchlist-results" aria-label="观察标的">
        <div className="watchlist-results-heading">
          <h2>
            观察标的 <span>{snapshot?.items.filter(matchesSearch).length ?? 0}</span>
          </h2>
          <span>点击标的查看行情与分红详情</span>
        </div>
        <div className="watchlist-controls">
          <Segmented<PoolTab>
            options={pools.map((pool) => ({ label: `${pool.title} ${pool.itemCount}`, value: pool.id }))}
            value={activePool}
            onChange={setActivePool}
          />
          <Input
            className="watchlist-search"
            allowClear
            prefix={<SearchOutlined />}
            aria-label="搜索观察标的"
            placeholder="搜索名称或代码"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {snapshotError ? (
          <Alert
            type="error"
            showIcon
            title="行情加载失败"
            description={snapshotError.message}
            action={
              <Button size="small" onClick={() => void refetchSnapshot()}>
                重试
              </Button>
            }
          />
        ) : null}
        {tableLoading && !snapshot ? (
          <Skeleton active paragraph={{ rows: 12 }} />
        ) : snapshot?.poolId === 'dividend' ? (
          <Table<DividendPoolItemLive>
            className="watchlist-table"
            columns={dividendColumns}
            dataSource={snapshot.items.filter(matchesSearch)}
            loading={tableLoading}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search.trim() ? '未找到匹配标的' : '当前观察池暂无标的'}>
                  {search.trim() ? <Button onClick={() => setSearch('')}>清除搜索</Button> : null}
                </Empty>
              ),
            }}
            pagination={false}
            rowKey="symbol"
            scroll={{ x: 1280 }}
            size="small"
          />
        ) : snapshot?.poolId === 'growth' ? (
          <Table<GrowthPoolItemLive>
            className="watchlist-table"
            columns={growthColumns}
            dataSource={snapshot.items.filter(matchesSearch)}
            loading={tableLoading}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search.trim() ? '未找到匹配标的' : '当前观察池暂无标的'}>
                  {search.trim() ? <Button onClick={() => setSearch('')}>清除搜索</Button> : null}
                </Empty>
              ),
            }}
            pagination={false}
            rowKey="symbol"
            scroll={{ x: 1200 }}
            size="small"
          />
        ) : snapshot?.poolId === 'overlap' ? (
          <Table<OverlapPoolItemLive>
            className="watchlist-table"
            columns={overlapColumns}
            dataSource={snapshot.items.filter(matchesSearch)}
            loading={tableLoading}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search.trim() ? '未找到匹配标的' : '当前观察池暂无标的'}>
                  {search.trim() ? <Button onClick={() => setSearch('')}>清除搜索</Button> : null}
                </Empty>
              ),
            }}
            pagination={false}
            rowKey="symbol"
            scroll={{ x: 1100 }}
            size="small"
          />
        ) : !snapshotError ? (
          <Empty description="暂无观察数据" />
        ) : null}
      </section>

      <Drawer
        className="watchlist-detail-drawer"
        title={detailSnapshot ? `${detailSnapshot.instrument.name} (${detailSnapshot.instrument.symbol})` : detailSymbol}
        open={detailSymbol !== null}
        extra={
          <Button
            type="primary"
            disabled={!detailSymbol}
            onClick={() => {
              if (detailSymbol) onAdd(detailSymbol);
            }}
          >
            加入我的自选
          </Button>
        }
        size={480}
        onClose={() => {
          setDetailSymbol(null);
        }}
      >
        {detailLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : detailSnapshot ? (
          <div className="watchlist-detail">
            <dl>
              <div>
                <dt>最新价</dt>
                <dd>{detailSnapshot.quote.price === null ? '—' : formatPrice(detailSnapshot.quote.price)}</dd>
              </div>
              <div>
                <dt>涨跌幅</dt>
                <dd>
                  <ValueDisplay kind="percent" value={detailSnapshot.quote.changePercent} />
                </dd>
              </div>
              <div>
                <dt>股息率 (TTM)</dt>
                <dd>{formatYield(detailSnapshot.quote.dividendYieldTtm)}</dd>
              </div>
              <div>
                <dt>市盈率 TTM</dt>
                <dd>{detailSnapshot.quote.peTtm ?? '—'}</dd>
              </div>
              <div>
                <dt>市净率</dt>
                <dd>{detailSnapshot.quote.pb ?? '—'}</dd>
              </div>
            </dl>
            {detailSnapshot.upcomingDividends.length > 0 ? (
              <>
                <h3>待实施分红</h3>
                <ul className="watchlist-dividend-list">
                  {detailSnapshot.upcomingDividends.map((event: DividendEvent, index) => (
                    <li key={`${event.planText}-${index}`}>
                      <strong>{event.planText}</strong>
                      {event.cashPerShare !== null ? <span> · 每股 {event.cashPerShare.toFixed(4)} 元</span> : null}
                      {event.exDividendDate ? <span> · 除权 {event.exDividendDate}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="watchlist-detail-empty">暂无待实施分红记录。</p>
            )}
          </div>
        ) : (
          <p className="watchlist-detail-empty">无法加载标的详情。</p>
        )}
      </Drawer>
    </div>
  );
}
