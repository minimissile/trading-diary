import { useState } from 'react';
import { Alert, Empty, Input, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router';
import { QUANT_DIRECTION_LABELS, QUANT_RULES } from '../../../shared/quant-research/catalog';
import type { QuantRun, QuantSignal } from '../../../shared/quant-research/types';
import { buildPositionChartPath } from '../../router/paths';

export function QuantSignals({ run }: { run: QuantRun }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [rule, setRule] = useState('all');
  const query = search.trim().toLowerCase();
  const signals = run.signals.filter(
    (item) => (rule === 'all' || item.ruleId === rule) && (!query || `${item.symbol} ${item.name}`.toLowerCase().includes(query)),
  );
  const columns: ColumnsType<QuantSignal> = [
    { title: '信号日期', dataIndex: 'date', width: 112, sorter: (a, b) => a.date.localeCompare(b.date) },
    {
      title: '标的',
      key: 'symbol',
      width: 150,
      render: (_, item) => (
        <span className="quant-research-stock">
          <Link to={buildPositionChartPath(item.symbol)}>{item.name}</Link>
          <small>{item.symbol}</small>
        </span>
      ),
    },
    {
      title: '命中规则',
      dataIndex: 'ruleId',
      width: 120,
      render: (id: string) => QUANT_RULES.find((item) => item.id === id)?.name,
    },
    {
      title: '特征',
      dataIndex: 'direction',
      width: 112,
      render: (direction: QuantSignal['direction']) => (
        <Tag color={direction === 'weakness' ? 'warning' : direction === 'activity' ? 'default' : 'processing'}>
          {QUANT_DIRECTION_LABELS[direction]}
        </Tag>
      ),
    },
    { title: '前复权收盘', dataIndex: 'adjustedClose', align: 'right', width: 125, render: (price: number) => price.toFixed(3) },
    {
      title: '20 日量比',
      dataIndex: 'volumeRatio',
      align: 'right',
      width: 105,
      render: (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}×`),
    },
    { title: '命中依据', dataIndex: 'description', width: 330 },
  ];
  return (
    <>
      <div className="quant-research-metrics">
        <Metric label="有效扫描 / 股票池" value={`${run.scannedCount} / ${run.universe.length}`} />
        <Metric label="命中股票" value={`${run.matchedCount} 只`} />
        <Metric label="信号总数" value={`${run.signalCount} 条`} />
        <Metric label="排除标的" value={`${run.excludedCount} 只`} />
      </div>
      <div className="quant-research-result-context">
        <Tag color="processing">
          {run.startDate} — {run.endDate}
        </Tag>
        <span>腾讯日线 · 前复权 · 扫描于 {new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
      </div>
      <p className="quant-research-caption">
        本次条件：区间 {run.settings.lookback} 日 · 均线 {run.settings.maPeriod} 日 · 放量 {run.settings.volumeMultiple} 倍 ·{' '}
        {run.settings.rules.map((id) => QUANT_RULES.find((item) => item.id === id)?.name).join('、')}
      </p>
      {run.excludedCount > 0 ? (
        <Alert type="warning" showIcon title={`${run.excludedCount} 只股票未计入完整扫描，请查看下方排除明细。`} />
      ) : null}
      <div className="quant-research-filters">
        <Input.Search
          aria-label="搜索信号标的"
          placeholder="搜索名称或代码"
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          aria-label="筛选信号规则"
          value={rule}
          onChange={setRule}
          options={[
            { label: '全部规则', value: 'all' },
            ...QUANT_RULES.filter((item) => run.settings.rules.includes(item.id)).map((item) => ({
              label: item.name,
              value: item.id,
            })),
          ]}
        />
        <span>{signals.length} 条结果</span>
      </div>
      <Table
        rowKey="id"
        dataSource={signals}
        columns={columns}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 1100 }}
        locale={{
          emptyText: <Empty description={run.signalCount ? '当前筛选条件下没有信号' : '扫描已完成，窗口内没有命中所选规则'} />,
        }}
      />
      <details className="quant-research-details">
        <summary>数据口径、股票池与排除明细</summary>
        <p>
          只使用已完成交易日。区间极值和均量不含信号当日，均线包含当日收盘。扫描窗口按沪深 300
          日线确定，窗口缺失或历史不足的股票单独列出。
        </p>
        <p>
          价格为数据源当前前复权口径，不是当时可下单价格；复权数据可能在分红后修订。固定股票池和当前 ST /
          退市名称筛选不能还原历史成分，不用于计算策略收益。
        </p>
        <p>股票池：{run.universe.map((item) => `${item.name} ${item.symbol}`).join('、')}</p>
        {run.exclusions.map((item) => (
          <p key={item.symbol}>
            {item.name} {item.symbol}：{item.reason}
          </p>
        ))}
      </details>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
