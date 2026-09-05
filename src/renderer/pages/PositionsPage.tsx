import { useCallback, useMemo, useState } from 'react';
import { App, Button, Dropdown, Empty, Input, Segmented, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  CalendarOutlined,
  MoreOutlined,
  ReloadOutlined,
  PlusOutlined,
  FallOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import type { InstrumentKind } from '../../shared/market/types';
import type { PortfolioPositionView } from '../../shared/portfolio/types';
import { ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import { priceListPresetForKind, quantityPresetForKind } from '../../shared/format/display-presets';
import { PortfolioLedgerModal } from '../components/trading/PortfolioLedgerModal';
import { LedgerAiImportModal } from '../components/trading/LedgerAiImportModal';
import { PositionLedgerDrawer } from '../components/trading/PositionLedgerDrawer';
import { PositionSellModal } from '../components/trading/PositionSellModal';
import { AccountSelect } from '../components/trading/AccountSelect';
import {
  ValueDisplay,
  AnimatedValueDisplay,
  formatQuoteRefreshTime,
  formatFloatingPnlCaption,
  formatDailyPnlCaption,
} from '../lib/trading-format';
import { usePortfolioDashboard } from '../hooks/usePortfolioDashboard';
import { confirmDanger } from '../lib/confirm-dialog';
import { deletePortfolioPosition } from '../lib/portfolio-actions';
import { buildPositionChartPath, routePaths } from '../router/paths';

type AssetCategory = 'all' | 'fund' | 'stock';
type StockSubKind = 'all' | 'stock' | 'listed_fund';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
};

function isFundKind(kind: InstrumentKind): boolean {
  return kind === 'otc_fund' || kind === 'etf' || kind === 'lof';
}

function matchesAssetFilter(position: PortfolioPositionView, category: AssetCategory, stockSubKind: StockSubKind): boolean {
  if (category === 'all') return true;
  if (category === 'fund') {
    if (!isFundKind(position.kind)) return false;
    if (stockSubKind === 'all') return true;
    if (stockSubKind === 'listed_fund') return position.kind === 'etf' || position.kind === 'lof';
    return position.kind === 'otc_fund';
  }
  if (isFundKind(position.kind)) return false;
  if (stockSubKind === 'all') return true;
  return position.kind === 'stock';
}

function symbolSearchKeys(value: string): string[] {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 0 && digits.length <= 6) {
    keys.add(digits.padStart(6, '0'));
    const stripped = digits.replace(/^0+/u, '');
    if (stripped) keys.add(stripped);
  }
  return [...keys];
}

function matchesSymbolQuery(position: PortfolioPositionView, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const lowered = trimmed.toLowerCase();
  if (position.name.toLowerCase().includes(lowered)) return true;

  const queryKeys = symbolSearchKeys(trimmed);
  const symbolKeys = symbolSearchKeys(position.symbol);
  return queryKeys.some((queryKey) =>
    symbolKeys.some((symbolKey) => symbolKey.includes(queryKey) || queryKey.includes(symbolKey)),
  );
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

interface FilteredPortfolioStats {
  totalMarketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  dailyPnl: number;
  missingQuoteCount: number;
  missingDailyPnlCount: number;
  positionCount: number;
}

function aggregatePortfolioStats(rows: readonly PortfolioPositionView[]): FilteredPortfolioStats {
  let totalMarketValue = 0;
  let totalCost = 0;
  let unrealizedPnl = 0;
  let dailyPnl = 0;
  let missingQuoteCount = 0;
  let missingDailyPnlCount = 0;

  for (const row of rows) {
    totalMarketValue += row.marketValue ?? 0;
    totalCost += row.avgCost * row.quantity;
    unrealizedPnl += row.unrealizedPnl ?? 0;
    dailyPnl += row.dailyPnl ?? 0;
    if (row.marketPrice === null) missingQuoteCount += 1;
    if (row.dailyPnl === null && row.quantity > 0) missingDailyPnlCount += 1;
  }

  return {
    totalMarketValue,
    totalCost,
    unrealizedPnl,
    dailyPnl,
    missingQuoteCount,
    missingDailyPnlCount,
    positionCount: rows.length,
  };
}

function statsCacheSuffix(category: AssetCategory, stockSubKind: StockSubKind): string {
  if (category === 'all') return 'all';
  if (category === 'fund') return stockSubKind === 'all' ? 'fund' : `fund:${stockSubKind}`;
  return stockSubKind === 'all' ? 'stock' : `stock:${stockSubKind}`;
}

/**
 * 持仓中心页面，展示真实持仓与市值统计。
 */
export function PositionsPage(): React.JSX.Element {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('all');
  const [stockSubKind, setStockSubKind] = useState<StockSubKind>('all');
  const [editingPosition, setEditingPosition] = useState<PortfolioPositionView | null>(null);
  const [sellingPosition, setSellingPosition] = useState<PortfolioPositionView | null>(null);
  const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null);
  const [symbolQuery, setSymbolQuery] = useState('');

  const { summary, positions, isLoading, isFetching, refetch, invalidate } = usePortfolioDashboard(accountId, year);

  const refreshQuotes = useCallback(
    async (silent = false): Promise<void> => {
      const result = await refetch();
      if (result.error) {
        if (!silent) void message.error(result.error instanceof Error ? result.error.message : '行情刷新失败');
        return;
      }
      if (!silent) void message.success('行情已刷新');
    },
    [message, refetch],
  );

  const tabFilteredPositions = useMemo(
    () => positions.filter((row) => matchesAssetFilter(row, assetCategory, stockSubKind)),
    [assetCategory, positions, stockSubKind],
  );

  const filteredPositions = useMemo(
    () => tabFilteredPositions.filter((row) => matchesSymbolQuery(row, symbolQuery)),
    [symbolQuery, tabFilteredPositions],
  );

  const filteredStats = useMemo(() => aggregatePortfolioStats(tabFilteredPositions), [tabFilteredPositions]);

  const statsCacheKey = statsCacheSuffix(assetCategory, stockSubKind);

  const deletePosition = useCallback(
    async (row: PortfolioPositionView): Promise<void> => {
      setDeletingSymbol(row.symbol);
      try {
        await deletePortfolioPosition(accountId, row.symbol);
        void message.success('持仓已删除');
        await invalidate();
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '删除失败');
      } finally {
        setDeletingSymbol(null);
      }
    },
    [accountId, invalidate, message],
  );

  const positionColumns = useMemo<ColumnsType<PortfolioPositionView>>(
    () => [
      {
        title: '标的',
        key: 'symbol',
        fixed: 'left',
        width: 260,
        render: (_, row) => (
          <button
            className="watchlist-symbol-button"
            type="button"
            onClick={() => void navigate(buildPositionChartPath(row.symbol))}
          >
            <strong>{row.name}</strong>
            <small>{row.symbol}</small>
          </button>
        ),
      },
      {
        title: '类型',
        dataIndex: 'kind',
        width: 120,
        align: 'right',
        render: (kind: InstrumentKind, row) => (
          <span className="portfolio-kind-tags">
            <Tag>{kindLabels[kind] ?? kind}</Tag>
            {row.fundProfile?.operationModeLabel ? <Tag color="orange">{row.fundProfile.operationModeLabel}</Tag> : null}
          </span>
        ),
      },
      {
        title: '份额',
        dataIndex: 'quantity',
        width: 96,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />,
      },
      {
        title: '成本',
        dataIndex: 'avgPrice',
        width: 96,
        align: 'right',
        render: (value: number, row) => <ValueDisplay kind={priceListPresetForKind(row.kind)} value={value} />,
      },
      {
        title: '现价',
        key: 'price',
        width: 96,
        align: 'right',
        render: (_, row) =>
          row.marketPrice === null ? (
            '—'
          ) : (
            <AnimatedValueDisplay
              cacheKey={`positions:${accountId}:${row.symbol}:marketPrice`}
              kind={priceListPresetForKind(row.kind)}
              value={row.marketPrice}
            />
          ),
      },
      {
        title: '市值',
        key: 'mv',
        width: 116,
        align: 'right',
        render: (_, row) =>
          row.marketValue == null ? (
            '—'
          ) : (
            <AnimatedValueDisplay
              key={`${accountId}:${row.symbol}:${row.marketValue}`}
              cacheKey={`positions:${accountId}:${row.symbol}:marketValue`}
              kind="currency"
              value={row.marketValue}
            />
          ),
      },
      {
        title: '日收益',
        key: 'dailyPnl',
        width: 116,
        align: 'right',
        render: (_, row) =>
          row.dailyPnl === null ? (
            '—'
          ) : (
            <AnimatedValueDisplay cacheKey={`positions:${accountId}:${row.symbol}:dailyPnl`} kind="pnl" value={row.dailyPnl} />
          ),
      },
      {
        title: '浮盈',
        key: 'pnl',
        width: 116,
        align: 'right',
        sorter: (a, b) => compareNullableNumber(a.unrealizedPnl, b.unrealizedPnl),
        sortDirections: ['descend', 'ascend'],
        render: (_, row) =>
          row.unrealizedPnl === null ? (
            '—'
          ) : (
            <AnimatedValueDisplay
              cacheKey={`positions:${accountId}:${row.symbol}:unrealizedPnl`}
              kind="pnl"
              value={row.unrealizedPnl}
            />
          ),
      },
      {
        title: '收益率',
        key: 'returnRate',
        width: 96,
        align: 'right',
        sorter: (a, b) => compareNullableNumber(a.unrealizedReturnPercent, b.unrealizedReturnPercent),
        sortDirections: ['descend', 'ascend'],
        render: (_, row) =>
          row.unrealizedReturnPercent === null ? '—' : <ValueDisplay kind="percent" value={row.unrealizedReturnPercent} />,
      },
      {
        title: '操作',
        key: 'actions',
        width: 64,
        fixed: 'right',
        align: 'center',
        render: (_, row) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'sell',
                  label: '卖出',
                  icon: <FallOutlined />,
                  onClick: () => setSellingPosition(row),
                },
                {
                  key: 'edit',
                  label: '编辑',
                  icon: <EditOutlined />,
                  onClick: () => setEditingPosition(row),
                },
                {
                  key: 'delete',
                  label: '删除',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    confirmDanger(modal.confirm, {
                      title: '删除此持仓？',
                      content:
                        accountId === ALL_ACCOUNTS_ID
                          ? `将删除所有账户中 ${row.symbol} 的全部流水，且不可恢复。`
                          : `将删除当前账户中 ${row.symbol} 的全部流水，且不可恢复。`,
                      okText: '删除',
                      onOk: () => deletePosition(row),
                    });
                  },
                },
              ],
            }}
          >
            <Button
              className="ui-icon-button"
              icon={<MoreOutlined />}
              loading={deletingSymbol === row.symbol}
              aria-label="操作菜单"
            />
          </Dropdown>
        ),
      },
    ],
    [accountId, deletePosition, deletingSymbol, modal, navigate],
  );

  const unrealizedPnl = filteredStats.unrealizedPnl;
  const dailyPnl = filteredStats.dailyPnl;
  const missingQuoteCount = filteredStats.missingQuoteCount;
  const missingDailyPnlCount = filteredStats.missingDailyPnlCount;

  const refreshing = isFetching && !isLoading;

  return (
    <main className="workspace-page portfolio-page positions-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">POSITIONS</p>
          <h1>持仓中心</h1>
          <p className="page-intro">录入买入与卖出流水，跟踪真实持仓、成本与市值。</p>
        </div>
        <div className="portfolio-header-actions">
          <AccountSelect value={accountId} onChange={setAccountId} includeAllOption className="portfolio-account-select" />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLedgerOpen(true)}>
            录入流水
          </Button>
        </div>
      </header>

      {isLoading && !summary ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <section className="positions-overview" aria-label="资产概览">
            <div className="positions-overview-heading">
              <h2>资产概览</h2>
              <span>
                {assetCategory === 'all' ? '全部持仓' : assetCategory === 'fund' ? '基金持仓' : '股票持仓'} ·{' '}
                {filteredStats.positionCount} 个标的
              </span>
            </div>
            <div className="positions-summary" key={statsCacheKey}>
              <article className="positions-summary-primary">
                <small>持仓市值</small>
                <ValueDisplay as="strong" kind="currency" value={filteredStats.totalMarketValue} />
                <span>
                  投入成本 <ValueDisplay kind="currency" value={filteredStats.totalCost} />
                </span>
              </article>
              <article>
                <small>浮动盈亏</small>
                <ValueDisplay as="strong" kind="pnl" value={unrealizedPnl} />
                <span>{formatFloatingPnlCaption(unrealizedPnl, { missingQuoteCount })}</span>
              </article>
              <article>
                <small>日收益</small>
                <ValueDisplay as="strong" kind="pnl" value={dailyPnl} />
                <span>{formatDailyPnlCaption(dailyPnl, { missingQuoteCount: missingDailyPnlCount })}</span>
              </article>
            </div>
            <div className="positions-overview-footer">
              <div className="positions-quote-status">
                <span>
                  {summary?.lastRefreshedAt ? '行情更新' : '行情待刷新'} · {formatQuoteRefreshTime(summary?.lastRefreshedAt)}
                </span>
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined spin={refreshing} />}
                  loading={refreshing}
                  onClick={() => void refreshQuotes()}
                >
                  刷新行情
                </Button>
              </div>
              <nav aria-label="持仓分析" className="positions-related-links">
                <Link to={routePaths.positionHistory}>
                  <HistoryOutlined /> 历史持仓
                </Link>
                <Link to={routePaths.positionPnlCalendar}>
                  <CalendarOutlined /> 收益日历
                </Link>
              </nav>
            </div>
          </section>

          <section className="positions-holdings" aria-labelledby="positions-holdings-title">
            <div className="positions-holdings-heading">
              <div>
                <h2 id="positions-holdings-title">
                  持仓明细 <span>{filteredPositions.length}</span>
                </h2>
                <p>
                  {symbolQuery.trim()
                    ? `匹配 ${filteredPositions.length} / ${tabFilteredPositions.length} 个标的 · 搜索不影响上方资产统计`
                    : '查看行情与收益，点击标的进入详情'}
                </p>
              </div>
              <Button icon={<PictureOutlined />} onClick={() => setAiImportOpen(true)}>
                AI 识图导入
              </Button>
            </div>
            <div className="positions-list-toolbar">
              <div className="positions-category-filters">
                <Segmented<AssetCategory>
                  options={[
                    { label: '全部', value: 'all' },
                    { label: '基金', value: 'fund' },
                    { label: '股票', value: 'stock' },
                  ]}
                  value={assetCategory}
                  onChange={(value) => {
                    setAssetCategory(value);
                    setStockSubKind('all');
                  }}
                />
                {assetCategory === 'fund' ? (
                  <div className="portfolio-filters__stock">
                    <Segmented<StockSubKind>
                      options={[
                        { label: '全部', value: 'all' },
                        { label: '场外', value: 'stock' },
                        { label: '场内', value: 'listed_fund' },
                      ]}
                      value={stockSubKind}
                      onChange={setStockSubKind}
                    />
                  </div>
                ) : null}
                {assetCategory === 'stock' ? (
                  <div className="portfolio-filters__stock">
                    <Segmented<StockSubKind>
                      options={[
                        { label: '全部', value: 'all' },
                        { label: 'A股', value: 'stock' },
                      ]}
                      value={stockSubKind}
                      onChange={setStockSubKind}
                    />
                  </div>
                ) : null}
              </div>
              <Input
                className="positions-search"
                allowClear
                placeholder="搜索代码或名称"
                prefix={<SearchOutlined aria-hidden="true" />}
                value={symbolQuery}
                onChange={(event) => setSymbolQuery(event.target.value)}
                aria-label="搜索标的"
              />
            </div>

            {filteredPositions.length === 0 ? (
              <Empty
                description={
                  positions.length === 0
                    ? '还没有持仓，录入第一笔买入流水开始跟踪'
                    : symbolQuery.trim()
                      ? '未找到匹配的标的'
                      : '当前筛选条件下暂无持仓'
                }
              >
                {positions.length === 0 ? (
                  <Button type="primary" onClick={() => setLedgerOpen(true)}>
                    录入买入
                  </Button>
                ) : null}
              </Empty>
            ) : (
              <Table<PortfolioPositionView>
                className="watchlist-table"
                columns={positionColumns}
                dataSource={filteredPositions}
                pagination={false}
                rowKey="symbol"
                size="small"
                scroll={{ x: 1024 }}
              />
            )}
          </section>
        </>
      )}

      <PortfolioLedgerModal
        open={ledgerOpen}
        defaultAccountId={accountId === ALL_ACCOUNTS_ID ? undefined : accountId}
        onClose={() => setLedgerOpen(false)}
        onSaved={() => void invalidate()}
      />

      <LedgerAiImportModal
        open={aiImportOpen}
        defaultAccountId={accountId === ALL_ACCOUNTS_ID ? undefined : accountId}
        onClose={() => setAiImportOpen(false)}
        onSaved={() => void invalidate()}
      />

      <PositionSellModal
        open={sellingPosition !== null}
        position={sellingPosition}
        accountId={accountId}
        onClose={() => setSellingPosition(null)}
        onSaved={() => void invalidate()}
      />

      <PositionLedgerDrawer
        open={editingPosition !== null}
        position={editingPosition}
        accountId={accountId}
        onClose={() => setEditingPosition(null)}
        onChanged={() => void invalidate()}
      />
    </main>
  );
}
