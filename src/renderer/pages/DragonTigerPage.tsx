import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Alert, App, Button, DatePicker, Empty, Input, InputNumber, Select, Space, Table, Tag, Segmented } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  LhbEvent,
  LhbExchange,
  LhbPeriod,
  LhbQueryInput,
  LhbSort,
  LhbStockSummary,
  LhbSecurityType,
} from '../../shared/longhubang/types';
import { LHB_EXCHANGE_LABELS, LHB_PERIOD_LABELS } from '../../shared/longhubang/types';
import { lhbQuerySchema } from '../../shared/schemas/requests/longhubang.requests';
import { DragonTigerDetailDrawer } from '../components/longhubang/DragonTigerDetailDrawer';
import { LhbMoney, LhbNumber } from '../components/longhubang/LonghubangValues';
import { LHB_NUMERIC_FILTERS, lhbRangeKeys, type LhbNumericField } from '../../shared/longhubang/filters';
import { lhbCalendarRange, shiftLhbCalendar, type LhbCalendarPeriod } from '../../shared/longhubang/calendar';
import '../styles/longhubang.css';

const sortOptions: Array<{ value: LhbSort; label: string }> = [
  { value: 'date', label: '上榜日期' },
  { value: 'net', label: '净买额' },
  { value: 'buy', label: '买入额' },
  { value: 'sell', label: '卖出额' },
  { value: 'change', label: '涨跌幅' },
  { value: 'turnover', label: '换手率' },
  { value: 'appearances', label: '上榜次数' },
  { value: 'intervalNet', label: '区间净流入（单日榜）' },
  ...LHB_NUMERIC_FILTERS.filter(
    ({ field }) => !['netCents', 'buyCents', 'sellCents', 'changePercent', 'turnoverPercent'].includes(field),
  ).map(({ field, label }) => ({ value: field, label })),
];
type Draft = Partial<LhbQueryInput>;

function RangeFields({
  label,
  min,
  max,
  unit,
  scale = 1,
  onChange,
}: {
  label: string;
  min?: number;
  max?: number;
  unit: string;
  scale?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
}): React.JSX.Element {
  const scaled = (value: number | null) => (value === null ? undefined : scale === 1 ? value : Math.round(value * scale));
  return (
    <div className="lhb-field">
      <span>
        {label}（{unit}）
      </span>
      <div className="lhb-range">
        <InputNumber
          aria-label={`${label}下限`}
          placeholder="不限"
          value={min === undefined ? null : min / scale}
          controls={false}
          onChange={(value) => onChange(scaled(value), max)}
        />
        <span>至</span>
        <InputNumber
          aria-label={`${label}上限`}
          placeholder="不限"
          value={max === undefined ? null : max / scale}
          controls={false}
          onChange={(value) => onChange(min, scaled(value))}
        />
      </div>
    </div>
  );
}

export function DragonTigerPage(): React.JSX.Element {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [calendarPeriod, setCalendarPeriod] = useState<LhbCalendarPeriod | 'custom'>('day');
  const [calendarAnchor, setCalendarAnchor] = useState<string | null>(null);
  const [extraColumns, setExtraColumns] = useState<LhbNumericField[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [submitted, setSubmitted] = useState<LhbQueryInput | null>(null);
  const [selected, setSelected] = useState<LhbEvent | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [latestLoading, setLatestLoading] = useState(false);
  const refresh = useRef(false);
  const status = useQuery({
    queryKey: ['longhubang', 'status'],
    queryFn: () => window.desktop.longhubang.getStatus(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const latestDate = status.data?.latestDate;
  const input = useMemo<LhbQueryInput | null>(
    () =>
      submitted ??
      (latestDate
        ? {
            startDate: latestDate,
            endDate: latestDate,
            sort: 'net',
            order: 'desc',
            page: 1,
            pageSize: 20,
          }
        : null),
    [submitted, latestDate],
  );
  const result = useQuery({
    queryKey: ['longhubang', 'query', input],
    enabled: input !== null,
    queryFn: () => {
      const force = refresh.current;
      refresh.current = false;
      if (!input) throw new Error('请选择查询日期');
      return window.desktop.longhubang.query({ ...input, refresh: force });
    },
    staleTime: 0,
    retry: false,
  });
  const startDate = draft.startDate ?? latestDate ?? '';
  const endDate = draft.endDate ?? latestDate ?? '';
  const patch = (value: Draft) => setDraft((current) => ({ ...current, ...value }));
  const submit = (value: Draft = draft) => {
    const search = value.keyword?.trim() ?? '';
    const parsed = lhbQuerySchema.safeParse({
      ...value,
      includeInstitution: value.includeInstitution || extraColumns.some((field) => field.startsWith('institution')),
      startDate: value.startDate ?? latestDate ?? '',
      endDate: value.endDate ?? latestDate ?? '',
      keyword: /^\d{6}$/u.test(search) ? undefined : search || undefined,
      symbol: /^\d{6}$/u.test(search) ? search : undefined,
      sort: value.sort ?? (value.view === 'stocks' ? 'appearances' : 'net'),
      order: value.order ?? 'desc',
      page: 1,
      pageSize: 20,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? '请检查查询条件');
      return;
    }
    setValidation(null);
    setSelected(null);
    setSubmitted(parsed.data);
  };
  const latest = async () => {
    setLatestLoading(true);
    try {
      const next = await window.desktop.longhubang.getStatus(true);
      client.setQueryData(['longhubang', 'status'], next);
      const value = { startDate: next.latestDate, endDate: next.latestDate };
      setCalendarPeriod('day');
      setCalendarAnchor(next.latestDate);
      setDraft(value);
      submit(value);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '最新日期查询失败');
    } finally {
      setLatestLoading(false);
    }
  };
  const history = (event: LhbEvent) => {
    const value = {
      startDate: '2004-01-01',
      endDate: latestDate ?? event.date,
      keyword: event.symbol,
      securityType: event.securityType === 'bond' ? ('bond' as const) : ('stock' as const),
    };
    setCalendarPeriod('custom');
    setCalendarAnchor(value.startDate);
    setDraft(value);
    submit(value);
    setSelected(null);
  };
  const choosePeriod = (
    period: LhbCalendarPeriod | 'custom',
    anchor = calendarAnchor || latestDate || startDate || dayjs().format('YYYY-MM-DD'),
  ) => {
    setCalendarPeriod(period);
    if (period === 'custom') return;
    setCalendarAnchor(anchor);
    const value: Draft = {
      ...draft,
      ...lhbCalendarRange(anchor, period),
      view: period === 'day' ? 'events' : 'stocks',
      sort: period === 'day' ? 'net' : 'appearances',
    };
    setDraft(value);
    submit(value);
  };
  const countMode = draft.countMode ?? 'days';
  const stocksView = input?.view === 'stocks';
  const rangeField = (field: (typeof LHB_NUMERIC_FILTERS)[number]) => {
    const [min, max] = lhbRangeKeys(field.field);
    return (
      <RangeFields
        key={field.field}
        label={field.label}
        unit={field.unit}
        scale={field.scale}
        min={draft[min]}
        max={draft[max]}
        onChange={(low, high) => patch({ [min]: low, [max]: high })}
      />
    );
  };
  const displayMetric = (event: LhbEvent, field: LhbNumericField) => {
    const value = event[field];
    if (field.endsWith('Cents')) return <LhbMoney cents={value} signed={field.toLowerCase().includes('net')} />;
    if (field.endsWith('Percent')) return <LhbNumber value={value} percent />;
    return value == null ? '—' : field === 'close' ? value.toFixed(2) : value;
  };
  const columns: ColumnsType<LhbEvent> = [
    { title: '上榜日期', dataIndex: 'date', width: 112, fixed: 'left' },
    {
      title: '标的',
      dataIndex: 'name',
      width: 138,
      fixed: 'left',
      render: (_: string, event) => (
        <button className="lhb-stock-link" onClick={() => setSelected(event)}>
          <strong>{event.name}</strong>
          <span>
            {event.symbol} · {LHB_EXCHANGE_LABELS[event.exchange]}
          </span>
        </button>
      ),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 96,
      align: 'right',
      render: (value: number | null) => <LhbNumber value={value} percent />,
    },
    {
      title: '买入额',
      dataIndex: 'buyCents',
      width: 112,
      align: 'right',
      render: (value: number | null) => <LhbMoney cents={value} />,
    },
    {
      title: '卖出额',
      dataIndex: 'sellCents',
      width: 112,
      align: 'right',
      render: (value: number | null) => <LhbMoney cents={value} />,
    },
    {
      title: '净买额',
      dataIndex: 'netCents',
      width: 120,
      align: 'right',
      render: (value: number | null) => <LhbMoney cents={value} signed />,
    },
    {
      title: '换手率',
      dataIndex: 'turnoverPercent',
      width: 88,
      align: 'right',
      render: (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`),
    },
    {
      title: '上榜原因',
      dataIndex: 'reason',
      width: 300,
      render: (value: string, event) => (
        <div className="lhb-reason-cell">
          <Tag>{LHB_PERIOD_LABELS[event.period]}</Tag>
          <span>{value}</span>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, event) => (
        <Button size="small" onClick={() => setSelected(event)}>
          席位
        </Button>
      ),
    },
  ];
  const optionalColumns: ColumnsType<LhbEvent> = extraColumns.map((field) => ({
    title: LHB_NUMERIC_FILTERS.find((item) => item.field === field)?.label,
    key: field,
    width: 140,
    align: 'right',
    render: (_, event) => displayMetric(event, field),
  }));
  columns.splice(columns.length - 1, 0, ...optionalColumns);
  const stockColumns: ColumnsType<LhbStockSummary> = [
    {
      title: '标的',
      key: 'stock',
      fixed: 'left',
      width: 150,
      render: (_, row) => (
        <button className="lhb-stock-link" onClick={() => setSelected(row.latestEvent)}>
          <strong>{row.latestEvent.name}</strong>
          <span>
            {row.latestEvent.symbol} · {LHB_EXCHANGE_LABELS[row.latestEvent.exchange]}
          </span>
        </button>
      ),
    },
    { title: '上榜次数', dataIndex: 'appearances', width: 100, align: 'right' },
    { title: '上榜日数', dataIndex: 'tradingDays', width: 100, align: 'right' },
    { title: '上榜记录数', dataIndex: 'eventCount', width: 110, align: 'right' },
    { title: '首次上榜', dataIndex: 'firstDate', width: 120 },
    { title: '最近上榜', dataIndex: 'lastDate', width: 120 },
    {
      title: (
        <span title="所选区间全部单日榜净买额，同日金额一致的多个原因仅计一次；不含多日榜，不等于全市场资金净流入。">
          区间净流入（单日榜）
        </span>
      ),
      key: 'intervalNet',
      width: 185,
      align: 'right',
      render: (_, row) => (
        <span
          title={`区间单日榜累计，与金额、原因等筛选及计次方式无关。可累计 ${row.intervalNetDays} 天；未计入 ${row.intervalNetExcludedRecords} 条多日或其他榜。${row.intervalNetUnresolvedDays > 0 ? `${row.intervalNetUnresolvedDays} 天金额缺失或同日金额不一致，暂不显示合计。` : row.intervalNetDays === 0 ? '没有可累计的单日榜记录。' : ''}`}
        >
          <LhbMoney cents={row.intervalNetCents} signed />
        </span>
      ),
    },
    {
      title: '最近净买额',
      key: 'net',
      width: 130,
      align: 'right',
      render: (_, row) => <LhbMoney cents={row.latestEvent.netCents} signed />,
    },
    ...extraColumns.map((field) => ({
      title: `最近${LHB_NUMERIC_FILTERS.find((item) => item.field === field)?.label ?? ''}`,
      key: field,
      width: 150,
      align: 'right' as const,
      render: (_: unknown, row: LhbStockSummary) => displayMetric(row.latestEvent, field),
    })),
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              const value = {
                ...input,
                startDate: input!.startDate,
                endDate: input!.endDate,
                keyword: row.latestEvent.symbol,
                view: 'events' as const,
                sort: 'date' as const,
              };
              setDraft(value);
              submit(value);
            }}
          >
            上榜明细
          </Button>
          <Button size="small" onClick={() => setSelected(row.latestEvent)}>
            席位
          </Button>
        </Space>
      ),
    },
  ];
  const pagination = {
    current: result.data?.page ?? input?.page ?? 1,
    pageSize: input?.pageSize ?? 20,
    total: result.data?.total ?? 0,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100],
    onChange: (page: number, pageSize: number) => {
      if (input) setSubmitted({ ...input, page, pageSize });
    },
  };
  const empty = (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        result.isError ? '数据读取失败，请重试' : !input ? '选择日期后查询' : '当前条件下没有上榜记录；当日数据可能尚未披露'
      }
    />
  );
  return (
    <main className="workspace-page lhb-page">
      <header className="page-header">
        <div>
          <h1>龙虎榜</h1>
          <p className="page-intro">从上榜原因到买卖席位，回看每一次异动。</p>
        </div>
        <Space>
          <Tag>东方财富</Tag>
          <Button
            icon={<ReloadOutlined />}
            disabled={!input}
            loading={result.isFetching}
            onClick={() => {
              refresh.current = true;
              void result.refetch();
            }}
          >
            刷新数据
          </Button>
        </Space>
      </header>
      <section className="lhb-filter-panel" aria-label="龙虎榜查询条件">
        <div className="lhb-filter-heading">
          <h2>查询榜单</h2>
          <span>最新已披露：{latestDate ?? (status.isPending ? '查询中…' : '暂未获取')}</span>
        </div>
        {status.isError ? (
          <Alert
            type="warning"
            showIcon
            title="最新披露日期获取失败，可重试或手动选择历史日期"
            action={<Button onClick={() => void status.refetch()}>重试</Button>}
          />
        ) : null}
        {status.data?.warning ? <Alert type="warning" title={status.data.warning} showIcon /> : null}
        <div className="lhb-period-toolbar">
          <Segmented
            aria-label="查询周期"
            value={calendarPeriod}
            options={[
              { label: '按日', value: 'day' },
              { label: '按周', value: 'week' },
              { label: '按月', value: 'month' },
              { label: '按季度', value: 'quarter' },
              { label: '自定义', value: 'custom' },
            ]}
            onChange={(value) => choosePeriod(value as LhbCalendarPeriod | 'custom')}
          />
          {calendarPeriod !== 'custom' ? (
            <Space>
              <Button
                onClick={() => choosePeriod(calendarPeriod, shiftLhbCalendar(startDate, calendarPeriod, -1))}
                disabled={!startDate}
              >
                前一{{ day: '天', week: '周', month: '月', quarter: '季度' }[calendarPeriod]}
              </Button>
              <Button
                onClick={() => choosePeriod(calendarPeriod, shiftLhbCalendar(startDate, calendarPeriod, 1))}
                disabled={!startDate || (!!latestDate && shiftLhbCalendar(startDate, calendarPeriod, 1) > latestDate)}
              >
                后一{{ day: '天', week: '周', month: '月', quarter: '季度' }[calendarPeriod]}
              </Button>
            </Space>
          ) : null}
        </div>
        <div className="lhb-primary-filters">
          <label className="lhb-field">
            <span>上榜日期</span>
            {calendarPeriod === 'custom' ? (
              <DatePicker.RangePicker
                aria-label="上榜日期区间"
                allowClear={false}
                value={[startDate ? dayjs(startDate) : null, endDate ? dayjs(endDate) : null]}
                onChange={(dates) => {
                  if (dates?.[0] && dates[1]) {
                    setCalendarAnchor(dates[0].format('YYYY-MM-DD'));
                    patch({ startDate: dates[0].format('YYYY-MM-DD'), endDate: dates[1].format('YYYY-MM-DD') });
                  }
                }}
              />
            ) : (
              <DatePicker
                aria-label="上榜日期"
                allowClear={false}
                picker={calendarPeriod === 'day' ? 'date' : calendarPeriod}
                value={startDate ? dayjs(startDate) : null}
                onChange={(date) => {
                  if (date) {
                    setCalendarAnchor(date.format('YYYY-MM-DD'));
                    patch(lhbCalendarRange(date.format('YYYY-MM-DD'), calendarPeriod));
                  }
                }}
              />
            )}
          </label>
          <label className="lhb-field">
            <span>标的代码 / 名称</span>
            <Input
              allowClear
              placeholder="六位代码可查询跨年历史"
              value={draft.keyword ?? ''}
              onChange={(event) => patch({ keyword: event.target.value })}
              onPressEnter={() => submit()}
            />
          </label>
          <label className="lhb-field">
            <span>市场</span>
            <Select<LhbExchange | 'all'>
              aria-label="市场"
              value={draft.exchange ?? 'all'}
              onChange={(value) => patch({ exchange: value === 'all' ? undefined : value })}
              options={[
                { value: 'all', label: '全部市场' },
                ...(['SH', 'SZ', 'BJ'] as const).map((value) => ({ value, label: LHB_EXCHANGE_LABELS[value] })),
              ]}
            />
          </label>
          <RangeFields
            label="净买额"
            unit="万元"
            min={draft.minNetCents}
            max={draft.maxNetCents}
            scale={1_000_000}
            onChange={(minNetCents, maxNetCents) => patch({ minNetCents, maxNetCents })}
          />
        </div>
        <details className="lhb-more">
          <summary>更多条件</summary>
          <div className="lhb-more-grid">
            <label className="lhb-field">
              <span>证券类型</span>
              <Select<LhbSecurityType>
                aria-label="证券类型"
                value={draft.securityType ?? 'stock'}
                options={[
                  { value: 'stock', label: 'A 股' },
                  { value: 'bond', label: '可转债' },
                  { value: 'all', label: 'A 股与可转债' },
                ]}
                onChange={(securityType) => patch({ securityType, board: undefined })}
              />
            </label>
            <label className="lhb-field">
              <span>交易板块</span>
              <Select
                aria-label="交易板块"
                allowClear
                placeholder="全部板块"
                value={draft.board}
                onChange={(board) => patch({ board })}
                options={[
                  ...new Set([
                    '上交所主板',
                    '上交所科创板',
                    '深交所主板',
                    '深交所创业板',
                    '北京证券交易所',
                    ...(result.data?.facets.boards ?? []),
                  ]),
                ].map((value) => ({ value, label: value }))}
              />
            </label>
            <label className="lhb-field">
              <span>榜单周期</span>
              <Select<LhbPeriod | 'all'>
                aria-label="榜单周期"
                value={draft.period ?? 'all'}
                options={[
                  { value: 'all', label: '全部周期' },
                  ...(['daily', 'multi', 'other'] as const).map((value) => ({ value, label: LHB_PERIOD_LABELS[value] })),
                ]}
                onChange={(value) => patch({ period: value === 'all' ? undefined : value })}
              />
            </label>
            <label className="lhb-field">
              <span>指定上榜原因</span>
              <Select
                aria-label="指定上榜原因"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="当前范围的全部原因"
                value={draft.reasonCode}
                onChange={(reasonCode) => patch({ reasonCode })}
                options={(result.data?.facets.reasons ?? [])
                  .filter((row) => row.code)
                  .map((row) => ({ value: row.code, label: row.text }))}
              />
            </label>
            <label className="lhb-field">
              <span>上榜原因包含</span>
              <Input
                allowClear
                placeholder="例如：换手率、涨幅偏离"
                value={draft.reason ?? ''}
                onChange={(event) => patch({ reason: event.target.value })}
              />
            </label>
            <label className="lhb-field">
              <span>数据源解读包含</span>
              <Input
                allowClear
                placeholder="例如：机构买入"
                value={draft.interpretation ?? ''}
                onChange={(event) => patch({ interpretation: event.target.value })}
              />
            </label>
          </div>
          {(['行情', '资金', '机构', '历史表现'] as const).map((group) => (
            <section className="lhb-filter-group" key={group}>
              <h3>{group}</h3>
              {group === '机构' ? (
                <div className="lhb-institution-controls">
                  <Select
                    aria-label="机构参与"
                    value={draft.hasInstitution === undefined ? 'all' : draft.hasInstitution ? 'yes' : 'no'}
                    options={[
                      { value: 'all', label: '不限机构参与' },
                      { value: 'yes', label: '有机构统计' },
                      { value: 'no', label: '无机构统计记录' },
                    ]}
                    onChange={(value) => patch({ hasInstitution: value === 'all' ? undefined : value === 'yes' })}
                  />
                </div>
              ) : null}
              {group === '历史表现' ? (
                <p className="lhb-note">上榜后实际涨跌幅用于历史复盘；尚未到期或缺失的数据不参与数值筛选。</p>
              ) : null}
              <div className="lhb-more-grid">
                {LHB_NUMERIC_FILTERS.filter((field) => field.group === group && field.field !== 'netCents').map(rangeField)}
              </div>
            </section>
          ))}
        </details>
        <div className="lhb-count-controls">
          <label className="lhb-field">
            <span>结果视图</span>
            <Select
              aria-label="结果视图"
              value={draft.view ?? 'events'}
              options={[
                { value: 'events', label: '上榜明细' },
                { value: 'stocks', label: '标的次数统计' },
              ]}
              onChange={(view: 'events' | 'stocks') => patch({ view, sort: view === 'stocks' ? 'appearances' : 'date' })}
            />
          </label>
          <label className="lhb-field">
            <span>计次口径</span>
            <Select
              aria-label="计次口径"
              value={countMode}
              options={[
                { value: 'days', label: '同标的同日计一次' },
                { value: 'events', label: '每条上榜原因计一次' },
              ]}
              onChange={(countMode: 'days' | 'events') => patch({ countMode })}
            />
          </label>
          <RangeFields
            label="上榜次数"
            unit="次"
            min={draft.minAppearances}
            max={draft.maxAppearances}
            onChange={(minAppearances, maxAppearances) => patch({ minAppearances, maxAppearances })}
          />
        </div>
        <div className="lhb-filter-actions">
          <Space wrap>
            <Button size="small" onClick={() => void latest()} loading={latestLoading}>
              最新榜单
            </Button>
            {[7, 30].map((days) => (
              <Button
                size="small"
                key={days}
                disabled={!latestDate}
                onClick={() => {
                  const value = {
                    ...draft,
                    startDate: dayjs(latestDate)
                      .subtract(days - 1, 'day')
                      .format('YYYY-MM-DD'),
                    endDate: latestDate,
                  };
                  setCalendarPeriod('custom');
                  setCalendarAnchor(latestDate ?? null);
                  setDraft(value);
                  submit(value);
                }}
              >
                近 {days} 天
              </Button>
            ))}
            <Button
              size="small"
              onClick={() => {
                const value = { ...draft, minNetCents: 5_000_000_000, maxNetCents: undefined };
                setDraft(value);
                submit(value);
              }}
            >
              净买入 ≥ 5000 万
            </Button>
          </Space>
          <Space>
            <Button
              onClick={() => {
                setCalendarPeriod('day');
                setCalendarAnchor(null);
                setExtraColumns([]);
                setDraft({});
                setSubmitted(null);
                setValidation(null);
                setSelected(null);
              }}
            >
              重置
            </Button>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => submit()}>
              查询
            </Button>
          </Space>
        </div>
        <p className="lhb-note">
          按自然日逐日查看（休市日可为空）；周按周一至周日，月及季度按自然周期。全市场支持 92 天，指定六位代码可跨年。
        </p>
        {validation ? <Alert type="error" showIcon title={validation} /> : null}
      </section>
      <section className="lhb-results" aria-label="龙虎榜查询结果">
        <div className="lhb-results-heading">
          <div>
            <h2>{stocksView ? '上榜次数统计' : '上榜明细'}</h2>
            <p>{input ? `${input.startDate} 至 ${input.endDate}` : '等待选择查询日期'}</p>
          </div>
          <div className="lhb-result-counts">
            <span>
              <strong>{result.data?.total ?? '—'}</strong> {stocksView ? '个标的' : '条记录'}
            </span>
            {!stocksView ? (
              <span>
                <strong>{result.data?.summary.securities ?? '—'}</strong> 个标的
              </span>
            ) : null}
            <span>
              <strong>{result.data?.summary.tradingDays ?? '—'}</strong> 个上榜日
            </span>
          </div>
        </div>
        <div className="lhb-results-toolbar">
          <span>
            次数统计在全部筛选条件之后进行；{input?.countMode === 'events' ? '每条上榜原因计一次' : '同一标的同日计一次'}。
            {stocksView ? '区间净流入累计全部单日榜，同日去重、不含多日榜；其余金额为最近一条匹配记录。' : '同日多原因分别列出。'}
          </span>
          <Space>
            <span>排序</span>
            <Select
              aria-label="排序字段"
              value={input?.sort ?? 'net'}
              options={sortOptions}
              disabled={!input}
              onChange={(sort) => {
                if (input) setSubmitted({ ...input, sort, page: 1 });
              }}
            />
            <Select
              aria-label="排序方向"
              value={input?.order ?? 'desc'}
              options={[
                { value: 'desc', label: '降序' },
                { value: 'asc', label: '升序' },
              ]}
              disabled={!input}
              onChange={(order) => {
                if (input) setSubmitted({ ...input, order, page: 1 });
              }}
            />
          </Space>
        </div>
        {result.isError ? (
          <Alert
            type="error"
            showIcon
            title="龙虎榜查询失败"
            description={result.error.message}
            action={<Button onClick={() => void result.refetch()}>重试</Button>}
          />
        ) : null}
        {result.data?.warning ? <Alert type="warning" showIcon title={result.data.warning} /> : null}
        <div className="lhb-column-controls">
          <span>补充显示</span>
          <Select<LhbNumericField[]>
            aria-label="补充显示字段"
            mode="multiple"
            allowClear
            maxTagCount={3}
            placeholder="选择收盘价、成交占比、机构、历史表现等字段"
            value={extraColumns}
            options={LHB_NUMERIC_FILTERS.filter(
              ({ field }) => !['netCents', 'buyCents', 'sellCents', 'changePercent', 'turnoverPercent'].includes(field),
            ).map(({ field, label }) => ({ value: field, label }))}
            onChange={(values) => {
              setExtraColumns(values);
              const includeInstitution = values.some((value) => value.startsWith('institution'));
              if (input) setSubmitted({ ...input, includeInstitution });
              patch({ includeInstitution });
            }}
          />
        </div>
        {stocksView ? (
          <Table<LhbStockSummary>
            rowKey="key"
            columns={stockColumns}
            dataSource={result.data?.stocks ?? []}
            size="small"
            loading={result.isFetching || status.isPending}
            scroll={{ x: 1285 + extraColumns.length * 150 }}
            pagination={pagination}
            locale={{ emptyText: empty }}
          />
        ) : (
          <Table<LhbEvent>
            rowKey="id"
            columns={columns}
            dataSource={result.data?.items ?? []}
            size="small"
            loading={result.isFetching || status.isPending}
            scroll={{ x: 1260 + extraColumns.length * 140 }}
            pagination={pagination}
            locale={{ emptyText: empty }}
          />
        )}
        <div className="lhb-results-footer">
          <span>数据来源：东方财富</span>
          <span>
            {result.data
              ? `${result.data.stale ? '缓存' : '更新'}时间：${new Date(result.data.fetchedAt).toLocaleString('zh-CN')}`
              : '完整查询后显示统计'}
          </span>
        </div>
      </section>
      {selected ? (
        <DragonTigerDetailDrawer
          key={`${selected.symbol}:${selected.date}:${selected.id}`}
          event={selected}
          onClose={() => setSelected(null)}
          onHistory={history}
        />
      ) : null}
    </main>
  );
}
