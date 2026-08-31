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
import { ValueDisplay, AnimatedValueDisplay, formatQuoteRefreshTime, formatFloatingPnlCaption, formatDailyPnlCaption } from '../lib/trading-format';
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

function matchesAssetFilter(
  position: PortfolioPositionView,
  category: AssetCategory,
  stockSubKind: StockSubKind,
): boolean {
  if (category === 'all') return true;
  if (category === 'fund') return position.kind === 'otc_fund';
  if (position.kind === 'otc_fund') return false;
  if (stockSubKind === 'all') return true;
  if (stockSubKind === 'stock') return position.kind === 'stock';
  return position.kind === 'etf' || position.kind === 'lof';
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

  const filteredPositions = useMemo(
    () =>
      positions.filter(
        (row) =>
          matchesAssetFilter(row, assetCategory, stockSubKind) &&
          matchesSymbolQuery(row, symbolQuery),
      ),
    [assetCategory, positions, stockSubKind, symbolQuery],
  );

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
        title: (
          <div className="portfolio-symbol-column-head">
            <span>标的</span>
            <Input
              allowClear
              size="small"
              placeholder="搜索代码/名称"
              prefix={<SearchOutlined aria-hidden="true" />}
              value={symbolQuery}
              onChange={(event) => setSymbolQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label="搜索标的"
            />
          </div>
        ),
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
            {row.fundProfile?.operationModeLabel ? (
              <Tag color="orange">{row.fundProfile.operationModeLabel}</Tag>
            ) : null}
          </span>
        ),
      },
      {
        title: '份额',
        dataIndex: 'quantity',
        width: 96,
        align: 'right',
        render: (value: number, row) => (
          <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />
        ),
      },
      {
        title: '成本',
        dataIndex: 'avgPrice',
        width: 96,
        align: 'right',
        render: (value: number, row) => (
          <ValueDisplay kind={priceListPresetForKind(row.kind)} value={value} />
        ),
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
          row.marketValue === null ? (
            '—'
          ) : (
            <AnimatedValueDisplay
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
            <AnimatedValueDisplay
              cacheKey={`positions:${accountId}:${row.symbol}:dailyPnl`}
              kind="pnl"
              value={row.dailyPnl}
            />
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
          row.unrealizedReturnPercent === null ? (
            '—'
          ) : (
            <ValueDisplay kind="percent" value={row.unrealizedReturnPercent} />
          ),
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
              type="text"
              size="small"
              icon={<MoreOutlined />}
              loading={deletingSymbol === row.symbol}
              aria-label="操作菜单"
            />
          </Dropdown>
        ),
      },
    ],
    [accountId, deletePosition, deletingSymbol, modal, navigate, symbolQuery],
  );

  const unrealizedPnl = summary?.unrealizedPnl ?? 0;
  const dailyPnl = summary?.dailyPnl ?? 0;
  const missingQuoteCount = useMemo(
    () => positions.filter((row) => row.marketPrice === null).length,
    [positions],
  );
  const missingDailyPnlCount = useMemo(
    () => positions.filter((row) => row.dailyPnl === null && row.quantity > 0).length,
    [positions],
  );

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
          <AccountSelect
            value={accountId}
            onChange={setAccountId}
            includeAllOption
            className="portfolio-account-select"
          />
          <Button icon={<ReloadOutlined spin={refreshing} />} loading={refreshing} onClick={() => void refreshQuotes()}>
            刷新行情
          </Button>
          <Link to={routePaths.positionHistory}>
            <Button icon={<HistoryOutlined />}>历史持仓</Button>
          </Link>
          <Link to={routePaths.positionPnlCalendar}>
            <Button icon={<CalendarOutlined />}>收益日历</Button>
          </Link>
          <Button icon={<PictureOutlined />} onClick={() => setAiImportOpen(true)}>
            AI 识图导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLedgerOpen(true)}>
            录入流水
          </Button>
        </div>
      </header>

      {isLoading && !summary ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <section className="portfolio-metrics">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>持仓市值</small>
              <AnimatedValueDisplay
                as="strong"
                cacheKey={`positions:${accountId}:summary:totalMarketValue`}
                kind="currency"
                value={summary?.totalMarketValue ?? 0}
              />
              <span>
                成本 <ValueDisplay kind="currency" value={summary?.totalCost ?? 0} />
              </span>
            </article>
            <article className="portfolio-metric-card">
              <small>浮动盈亏</small>
              <AnimatedValueDisplay
                as="strong"
                cacheKey={`positions:${accountId}:summary:unrealizedPnl`}
                kind="pnl"
                value={unrealizedPnl}
              />
              <span>{formatFloatingPnlCaption(unrealizedPnl, { missingQuoteCount })}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>日收益</small>
              <AnimatedValueDisplay
                as="strong"
                cacheKey={`positions:${accountId}:summary:dailyPnl`}
                kind="pnl"
                value={dailyPnl}
              />
              <span>{formatDailyPnlCaption(dailyPnl, { missingQuoteCount: missingDailyPnlCount })}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>持仓数量</small>
              <strong>{filteredPositions.length}</strong>
              <span>{assetCategory === 'all' ? '当前有效标的' : `筛选后 / 共 ${positions.length}`}</span>
            </article>
            <article className="portfolio-metric-card">
              <small>行情更新</small>
              <strong>{summary?.lastRefreshedAt ? '已同步' : '待刷新'}</strong>
              <span>{formatQuoteRefreshTime(summary?.lastRefreshedAt)}</span>
            </article>
          </section>

          <div className="page-toolbar portfolio-filters">
            <Segmented<AssetCategory>
              options={[
                { label: '全部', value: 'all' },
                { label: '基金', value: 'fund' },
                { label: '股票', value: 'stock' },
              ]}
              value={assetCategory}
              onChange={(value) => {
                setAssetCategory(value);
                if (value !== 'stock') setStockSubKind('all');
              }}
            />
            {assetCategory === 'stock' ? (
              <div className="portfolio-filters__stock">
                <Segmented<StockSubKind>
                  options={[
                    { label: '全部', value: 'all' },
                    { label: 'A股', value: 'stock' },
                    { label: '场内基金', value: 'listed_fund' },
                  ]}
                  value={stockSubKind}
                  onChange={setStockSubKind}
                />
              </div>
            ) : null}
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
