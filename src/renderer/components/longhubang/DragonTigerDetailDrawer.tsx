import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Empty, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import type { LhbEvent, LhbSeat } from '../../../shared/longhubang/types';
import { LHB_EXCHANGE_LABELS, LHB_PERIOD_LABELS } from '../../../shared/longhubang/types';
import { LhbMoney, LhbNumber } from './LonghubangValues';

const seatColumns: ColumnsType<LhbSeat> = [
  { title: '排名', dataIndex: 'rank', width: 52 },
  {
    title: '营业部 / 席位',
    dataIndex: 'departmentName',
    width: 230,
    render: (value: string) => <span className="lhb-seat-name">{value}</span>,
  },
  {
    title: '买入额',
    dataIndex: 'buyCents',
    width: 106,
    align: 'right',
    render: (value: number | null) => <LhbMoney cents={value} />,
  },
  {
    title: '卖出额',
    dataIndex: 'sellCents',
    width: 106,
    align: 'right',
    render: (value: number | null) => <LhbMoney cents={value} />,
  },
  {
    title: '净买额',
    dataIndex: 'netCents',
    width: 110,
    align: 'right',
    render: (value: number | null) => <LhbMoney cents={value} signed />,
  },
  {
    title: '买入占比',
    dataIndex: 'buyRatioPercent',
    width: 88,
    align: 'right',
    render: (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`),
  },
];

/** 父组件按股票、日期、初始事件重新挂载，防止保留上次原因选择。 */
export function DragonTigerDetailDrawer({
  event,
  onClose,
  onHistory,
}: {
  event: LhbEvent;
  onClose: () => void;
  onHistory: (event: LhbEvent) => void;
}): React.JSX.Element {
  const [selection, setSelection] = useState(event);
  const refresh = useRef(false);
  const detail = useQuery({
    queryKey: ['longhubang', 'detail', event.symbol, event.date],
    queryFn: () => {
      const force = refresh.current;
      refresh.current = false;
      return window.desktop.longhubang.getDetail({ symbol: event.symbol, date: event.date, refresh: force });
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const current =
    detail.data?.events.find((item) => item.id === selection.id) ??
    detail.data?.events.find((item) => item.reasonCode === selection.reasonCode && item.reason === selection.reason) ??
    detail.data?.events[0] ??
    event;
  const seats = detail.data?.seats.filter((seat) => seat.eventId === current.id) ?? [];
  const reload = () => {
    refresh.current = true;
    void detail.refetch();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${event.name} · ${event.symbol}`}
      size={820}
      className="lhb-drawer"
      rootStyle={{ top: 'var(--window-titlebar-height, 0px)' }}
      extra={
        <Button icon={<ReloadOutlined />} onClick={reload} loading={detail.isFetching}>
          刷新
        </Button>
      }
    >
      <div className="lhb-detail-date">
        <strong>{event.date}</strong>
        <Tag>{LHB_EXCHANGE_LABELS[event.exchange]}</Tag>
        <Tag>{LHB_PERIOD_LABELS[current.period]}</Tag>
      </div>
      {detail.isError ? (
        <Alert
          type="error"
          showIcon
          title="席位数据读取失败"
          description={detail.error.message}
          action={<Button onClick={reload}>重试</Button>}
        />
      ) : null}
      {detail.data?.warning ? <Alert type="warning" showIcon title={detail.data.warning} /> : null}
      {detail.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : detail.data ? (
        <>
          <label className="lhb-detail-reason">
            上榜原因
            <Select
              value={current.id}
              onChange={(id) => {
                const next = detail.data?.events.find((item) => item.id === id);
                if (next) setSelection(next);
              }}
              className="lhb-reason-select"
              aria-label="切换上榜原因"
              options={detail.data.events.map((item) => ({ value: item.id, label: item.reason }))}
            />
          </label>
          <div className="lhb-detail-stats">
            <div>
              <span>收盘涨跌幅</span>
              <strong>
                <LhbNumber value={current.changePercent} percent />
              </strong>
            </div>
            <div>
              <span>龙虎榜买入</span>
              <strong>
                <LhbMoney cents={current.buyCents} />
              </strong>
            </div>
            <div>
              <span>龙虎榜卖出</span>
              <strong>
                <LhbMoney cents={current.sellCents} />
              </strong>
            </div>
            <div>
              <span>龙虎榜净买入</span>
              <strong>
                <LhbMoney cents={current.netCents} signed />
              </strong>
            </div>
          </div>
          <p className="lhb-note">金额按当前原因对应的披露周期统计。同一席位可能同时出现在买榜和卖榜，不能将两榜金额直接相加。</p>
          {(['buy', 'sell'] as const).map((side) => (
            <section className="lhb-seat-section" key={side}>
              <h3>
                {side === 'buy' ? '买入榜' : '卖出榜'} <span>按该方向成交额排序</span>
              </h3>
              <Table<LhbSeat>
                rowKey="id"
                size="small"
                columns={seatColumns}
                dataSource={seats.filter((seat) => seat.side === side)}
                pagination={false}
                scroll={{ x: 740 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="数据源未返回该原因的席位记录" /> }}
              />
            </section>
          ))}
          <div className="lhb-detail-footer">
            <span>来源：东方财富 · 更新于 {new Date(detail.data.fetchedAt).toLocaleString('zh-CN')}</span>
            <Button icon={<HistoryOutlined />} onClick={() => onHistory(current)}>
              查看该股历史上榜
            </Button>
          </div>
        </>
      ) : null}
    </Drawer>
  );
}
