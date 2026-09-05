import { CheckCircleOutlined, CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Select, Space, Steps, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  CsvParseResult,
  ExecutionColumnMapping,
  ExecutionCsvField,
  ExecutionImportPreviewRow,
  ExecutionImportPreviewResult,
} from '../../shared/api.types';
import { AccountSelect } from '../components/trading/AccountSelect';
import { useTradingAccountId } from '../hooks/useTradingAccountId';
import { formatDateTime, formatPrice } from '../lib/trading-format';
import { routePaths } from '../router/paths';

const FIELD_LABELS: Record<ExecutionCsvField, string> = {
  symbol: '标的代码',
  side: '买卖方向',
  quantity: '成交数量',
  price: '成交价格',
  fees: '手续费（可选）',
  tradeAt: '成交时间',
};

const REQUIRED_FIELDS = new Set<ExecutionCsvField>(['symbol', 'side', 'quantity', 'price', 'tradeAt']);

type ImportStep = 0 | 1 | 2 | 3;

export function ImportPage(): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useTradingAccountId();
  const [step, setStep] = useState<ImportStep>(0);
  const [csv, setCsv] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ExecutionColumnMapping | null>(null);
  const [preview, setPreview] = useState<ExecutionImportPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);

  const headerOptions = useMemo(
    () =>
      csv?.headers.map((header, index) => ({
        label: `${index + 1}. ${header}`,
        value: index,
      })) ?? [],
    [csv],
  );

  const selectFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const parsed = await window.desktop.import.selectCsvFile();
      if (!parsed) return;
      setCsv(parsed);
      setMapping(parsed.suggestedMapping);
      setPreview(null);
      setStep(1);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : 'CSV 读取失败');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (): Promise<void> => {
    if (!csv || !mapping || !accountId) {
      void message.warning('请选择账户并完成列映射');
      return;
    }
    setBusy(true);
    try {
      const result = await window.desktop.import.previewExecutions({
        sourcePath: csv.sourcePath,
        accountId,
        mapping,
      });
      setPreview(result);
      setStep(2);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '预览失败');
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async (): Promise<void> => {
    if (!csv || !mapping || !accountId) return;
    setBusy(true);
    try {
      const result = await window.desktop.import.commitExecutions({
        sourcePath: csv.sourcePath,
        accountId,
        mapping,
      });
      window.dispatchEvent(new Event('workspace-changed'));
      void message.success(`已导入 ${result.imported} 笔，跳过重复 ${result.skippedDuplicate} 笔`);
      setStep(3);
      if (result.closedEpisodes > 0) {
        void navigate(routePaths.journal);
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const previewColumns: ColumnsType<ExecutionImportPreviewRow> = [
    { title: '行号', dataIndex: 'rowIndex', width: 72 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (status: ExecutionImportPreviewRow['status']) =>
        status === 'ready' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            可导入
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            异常
          </Tag>
        ),
    },
    { title: '标的', dataIndex: 'symbol', width: 96 },
    {
      title: '方向',
      dataIndex: 'side',
      width: 72,
      render: (side: ExecutionImportPreviewRow['side']) => (side === 'buy' ? '买入' : side === 'sell' ? '卖出' : '—'),
    },
    {
      title: '数量 / 价格',
      render: (_, row) => (row.quantity === null || row.price === null ? '—' : `${row.quantity} @ ${formatPrice(row.price)}`),
    },
    {
      title: '时间',
      dataIndex: 'tradeAt',
      render: (value: string | null) => (value ? formatDateTime(value) : '—'),
    },
    { title: '说明', dataIndex: 'message', ellipsis: true },
  ];

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">CSV IMPORT</p>
          <h1>成交导入</h1>
          <p className="page-intro">从券商导出 CSV，映射列名后批量写入交易回合；重复成交会自动跳过。</p>
        </div>
      </header>

      <Steps
        current={step}
        items={[{ title: '选择文件' }, { title: '映射列' }, { title: '预览确认' }, { title: '完成' }]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 ? (
        <section className="import-panel">
          <p>支持常见券商导出的 CSV / TSV，表头含「代码、方向、数量、价格、时间」等字段时可自动识别。</p>
          <Button type="primary" size="large" icon={<UploadOutlined />} loading={busy} onClick={() => void selectFile()}>
            选择 CSV 文件
          </Button>
        </section>
      ) : null}

      {step >= 1 && csv && mapping ? (
        <section className="import-panel">
          <div className="import-file-meta">
            <strong>{csv.fileName}</strong>
            <span>{csv.rowCount} 行数据</span>
          </div>

          <FormRow label="导入账户">
            <AccountSelect value={accountId} onChange={setAccountId} />
          </FormRow>

          <div className="import-mapping-grid">
            {(Object.keys(FIELD_LABELS) as ExecutionCsvField[]).map((field) => (
              <FormRow key={field} label={FIELD_LABELS[field]} required={REQUIRED_FIELDS.has(field)}>
                <Select
                  allowClear
                  placeholder="选择列"
                  value={mapping[field] >= 0 ? mapping[field] : undefined}
                  options={headerOptions}
                  onChange={(value) =>
                    setMapping((current) => (current ? { ...current, [field]: typeof value === 'number' ? value : -1 } : current))
                  }
                />
              </FormRow>
            ))}
          </div>

          {csv.previewRows.length > 0 ? (
            <div className="import-sample-table">
              <small>原始预览（前 {csv.previewRows.length} 行）</small>
              <Table
                size="small"
                pagination={false}
                rowKey={(_, index) => String(index)}
                dataSource={csv.previewRows.map((row, index) => ({ key: index, cells: row }))}
                columns={csv.headers.map((header, index) => ({
                  title: header,
                  render: (_: unknown, record: { cells: string[] }) => record.cells[index] ?? '',
                }))}
              />
            </div>
          ) : null}

          <Space>
            <Button onClick={() => setStep(0)}>重新选择</Button>
            <Button type="primary" loading={busy} onClick={() => void runPreview()}>
              预览导入
            </Button>
          </Space>
        </section>
      ) : null}

      {step >= 2 && preview ? (
        <section className="import-panel">
          <div className="import-summary-tags">
            <Tag color="success">可导入 {preview.readyCount}</Tag>
            <Tag color="error">异常 {preview.errorCount}</Tag>
          </div>
          <Table
            size="small"
            columns={previewColumns}
            dataSource={preview.rows}
            rowKey="rowIndex"
            pagination={{ pageSize: 12 }}
          />
          <Space>
            <Button onClick={() => setStep(1)}>返回映射</Button>
            <Button type="primary" loading={busy} disabled={preview.readyCount === 0} onClick={() => void commitImport()}>
              确认导入 {preview.readyCount} 笔
            </Button>
          </Space>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="import-panel import-panel--done">
          <CheckCircleOutlined style={{ fontSize: 40, color: '#39d3c3' }} />
          <h2>导入完成</h2>
          <p>成交已写入交易回合，可在交易日记查看待复盘项目。</p>
          <Space>
            <Button onClick={() => void navigate(routePaths.journal)}>前往交易日记</Button>
            <Button
              type="primary"
              onClick={() => {
                setStep(0);
                setCsv(null);
                setPreview(null);
              }}
            >
              继续导入
            </Button>
          </Space>
        </section>
      ) : null}
    </main>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="import-form-row">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}
