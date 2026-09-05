import { useState } from 'react';
import { Alert, Button, Segmented } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { usePersonalWatchlistQuery, useWatchlistQuotesQuery } from '../lib/queries/useWatchlistQueries';
import { PersonalWatchlist } from '../components/watchlist/PersonalWatchlist';
import { WatchlistAddModal } from '../components/watchlist/WatchlistAddModal';
import { TrackingDrawer } from '../components/watchlist/TrackingDrawer';
import { StrategyWatchlist } from './StrategyWatchlist';
import { instrumentPositionKey } from '../../shared/market/instrument-id';

export function WatchlistPage(): React.JSX.Element {
  const [view, setView] = useState<'personal' | 'strategy'>('personal');
  const [addSeed, setAddSeed] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const personal = usePersonalWatchlistQuery();
  const items = personal.data?.items ?? [];
  const groups = personal.data?.groups ?? [];
  const quotes = useWatchlistQuotesQuery(items, view === 'personal' || selectedId !== null);
  const selected = items.find((item) => item.id === selectedId);

  return (
    <main className="workspace-page watchlist-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">WATCHLIST</p>
          <h1>自选股</h1>
          <p className="page-intro">收录值得观察的股票，用提醒价格守候机会，用跟踪日志沉淀判断。</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={personal.isPending || personal.isError}
          onClick={() => setAddSeed('')}
        >
          添加自选
        </Button>
      </header>
      <div className="watchlist-view-tabs">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'personal', label: '我的自选' },
            { value: 'strategy', label: '策略观察池' },
          ]}
        />
      </div>
      {personal.isError ? (
        <Alert
          className="watchlist-page-error"
          type="error"
          showIcon
          title="个人自选加载失败"
          description={personal.error.message}
          action={<Button onClick={() => void personal.refetch()}>重试</Button>}
        />
      ) : null}
      {view === 'personal' ? (
        personal.isError && !personal.data ? null : (
          <PersonalWatchlist
            items={items}
            groups={groups}
            quotes={quotes.data ?? []}
            loading={personal.isPending}
            refreshing={quotes.isFetching}
            quoteError={quotes.error}
            onRefresh={() => {
              void personal.refetch();
              if (items.length) void quotes.refetch();
            }}
            onAdd={() => {
              if (personal.data && !personal.isError) setAddSeed('');
            }}
            onSelect={setSelectedId}
          />
        )
      ) : (
        <StrategyWatchlist
          onAdd={(symbol) => {
            if (personal.data && !personal.isError) setAddSeed(symbol);
          }}
        />
      )}
      {addSeed !== null ? (
        <WatchlistAddModal
          seed={addSeed}
          groups={groups}
          onClose={() => setAddSeed(null)}
          onSaved={(item) => {
            setAddSeed(null);
            setView('personal');
            setSelectedId(item.id);
          }}
        />
      ) : null}
      {selected ? (
        <TrackingDrawer
          key={selected.id}
          item={selected}
          groups={groups}
          quote={quotes.data?.find((quote) => instrumentPositionKey(quote) === instrumentPositionKey(selected))}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}
