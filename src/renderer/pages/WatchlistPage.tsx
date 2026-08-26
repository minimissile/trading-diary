import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Drawer, Segmented, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import type {
  DividendPoolItemLive,
  GrowthPoolItemLive,
  OverlapPoolItemLive,
  WatchlistPoolId,
  WatchlistPoolMeta,
  WatchlistPoolSnapshot,
} from '../../shared/api.types';
import type { DividendEvent, MarketSnapshotView } from '../../shared/api.types';
import { formatCurrency, formatPrice } from '../lib/trading-format';

type PoolTab = WatchlistPoolId;

function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}%`;
}

function formatYield(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)}%`;
}

function changeClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? 'market-up' : 'market-down';
}

function stabilityColor(grade: string): string {
  if (grade === 'A+') return 'green';
  if (grade === 'A') return 'blue';
  if (grade === 'A-') return 'default';
  return 'orange';
}

export function WatchlistPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [pools, setPools] = useState<WatchlistPoolMeta[]>([]);
  const [activePool, setActivePool] = useState<PoolTab>('dividend');
  const [snapshot, setSnapshot] = useState<WatchlistPoolSnapshot | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<MarketSnapshotView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSnapshot = useCallback(
    async (poolId: PoolTab, silent = false): Promise<void> => {
      if (!silent) setLoadingSnapshot(true);
      else setRefreshing(true);
      try {
        setSnapshot(await window.desktop.watchlist.getPoolSnapshot(poolId));
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '自选池行情读取失败');
      } finally {
        setLoadingSnapshot(false);
        setRefreshing(false);
      }
    },
    [message],
  );

  useEffect(() => {
    let active = true;
    void window.desktop.watchlist
      .listPools()
      .then((nextPools) => {
        if (active) setPools(nextPools);
      })
      .catch((reason: unknown) => {
        if (active) void message.error(reason instanceof Error ? reason.message : '自选池列表读取失败');
      })
      .finally(() => {
        if (active) setLoadingMeta(false);
      });
    return () => {
      active = false;
    };
  }, [message]);

  useEffect(() => {
    let active = true;
    setLoadingSnapshot(true);
    void window.desktop.watchlist
      .getPoolSnapshot(activePool)
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch((reason: unknown) => {
        if (active) void message.error(reason instanceof Error ? reason.message : '自选池行情读取失败');
      })
      .finally(() => {
        if (active) setLoadingSnapshot(false);
      });
    return () => {
      active = false;
    };
  }, [activePool, message]);

  const openDetail = async (symbol: string): Promise<void> => {
    setDetailSymbol(symbol);
    setDetailSnapshot(null);
    setDetailLoading(true);
    try {
      setDetailSnapshot(await window.desktop.market.getSnapshot(symbol));
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '标的详情读取失败');
    } finally {
      setDetailLoading(false);
    }
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
        render: (_, row) => (
          <span className={changeClass(row.quote?.changePercent)}>
            {formatPercent(row.quote?.changePercent)}
          </span>
        ),
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
          return formatCurrency(cost);
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
        render: (_, row) => (
          <span className={changeClass(row.quote?.changePercent)}>
            {formatPercent(row.quote?.changePercent)}
          </span>
        ),
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
        render: (_, row) => (
          <span className={changeClass(row.quote?.changePercent)}>
            {formatPercent(row.quote?.changePercent)}
          </span>
        ),
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
  const tableLoading = loadingMeta || loadingSnapshot;

  return (
    <main className="workspace-page watchlist-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">WATCHLIST</p>
          <h1>自选观察池</h1>
          <p className="page-intro">
            基于 2026-08-26 研究文档的长期观察清单。财务与 CAGR 为文档快照，现价与股息率由东方财富 API 实时刷新。
          </p>
        </div>
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          loading={refreshing}
          onClick={() => void loadSnapshot(activePool, true)}
        >
          刷新行情
        </Button>
      </header>

      <Alert
        className="watchlist-disclaimer"
        type="info"
        showIcon
        message="长期观察池，不代表即时买入建议"
        description="静态高股息率可能来自股价下跌；进入池不等于可以买入。单一行业不超过 25%，银行选 1—2 只，高速公路选 1 只。"
      />

      <div className="page-toolbar watchlist-toolbar">
        <Segmented<PoolTab>
          options={pools.map((pool) => ({
            label: `${pool.title} ${pool.itemCount}`,
            value: pool.id,
          }))}
          value={activePool}
          onChange={setActivePool}
        />
        {activeMeta ? (
          <span className="watchlist-meta">
            文档快照 {activeMeta.dataDate}
            {snapshot?.fetchedAt ? (
              <>
                {' '}
                · 行情刷新{' '}
                {new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
                  new Date(snapshot.fetchedAt),
                )}
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      {snapshot?.highlights.length ? (
        <ul className="watchlist-highlights">
          {snapshot.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {tableLoading && !snapshot ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : snapshot?.poolId === 'dividend' ? (
        <Table<DividendPoolItemLive>
          className="watchlist-table"
          columns={dividendColumns}
          dataSource={snapshot.items}
          loading={tableLoading}
          pagination={false}
          rowKey="symbol"
          scroll={{ x: 1280 }}
          size="small"
        />
      ) : snapshot?.poolId === 'growth' ? (
        <Table<GrowthPoolItemLive>
          className="watchlist-table"
          columns={growthColumns}
          dataSource={snapshot.items}
          loading={tableLoading}
          pagination={false}
          rowKey="symbol"
          scroll={{ x: 1200 }}
          size="small"
        />
      ) : snapshot?.poolId === 'overlap' ? (
        <Table<OverlapPoolItemLive>
          className="watchlist-table"
          columns={overlapColumns}
          dataSource={snapshot.items}
          loading={tableLoading}
          pagination={false}
          rowKey="symbol"
          scroll={{ x: 1100 }}
          size="small"
        />
      ) : null}

      <Drawer
        title={detailSnapshot ? `${detailSnapshot.instrument.name} (${detailSnapshot.instrument.symbol})` : detailSymbol}
        open={detailSymbol !== null}
        width={480}
        onClose={() => {
          setDetailSymbol(null);
          setDetailSnapshot(null);
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
                <dd className={changeClass(detailSnapshot.quote.changePercent)}>
                  {formatPercent(detailSnapshot.quote.changePercent)}
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
    </main>
  );
}
