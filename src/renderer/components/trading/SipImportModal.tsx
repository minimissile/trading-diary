import { CheckCircleOutlined, CloseCircleOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Modal, Segmented, Select, Space, Steps, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import type { FundSipPlanView } from '../../../shared/sip/types';
import type {
  SipAiExtractedRecord,
  SipAiRecognizeResult,
  SipColumnMapping,
  SipCsvField,
  SipImportInput,
  SipImportPreviewResult,
  SipImportPreviewRow,
  SipCsvParseResult,
} from '../../../shared/sip/import-types';
import { AccountSelect } from './AccountSelect';
import { formatDateTime, ValueDisplay } from '../../lib/trading-format';

const FIELD_LABELS: Record<SipCsvField, string> = {
  symbol: '标的代码',
  tradeAt: '扣款日期',
  nav: '净值',
  amount: '扣款金额',
  quantity: '确认份额（可选）',
  fees: '手续费（可选）',
};

const REQUIRED_FIELDS = new Set<SipCsvField>(['symbol', 'tradeAt', 'nav', 'amount']);

type ImportMode = 'csv' | 'ai';
type ImportStep = 0 | 1 | 2;

interface SipImportModalProps {
  open: boolean;
  defaultAccountId?: string;
  plans: FundSipPlanView[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 定投历史导入弹窗，支持 CSV 与 AI 截图识别。
 */
export function SipImportModal({
  open,
  defaultAccountId,
  plans,
  onClose,
  onSaved,
}: SipImportModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [mode, setMode] = useState<ImportMode>('csv');
  const [step, setStep] = useState<ImportStep>(0);
  const [csv, setCsv] = useState<SipCsvParseResult | null>(null);
  const [mapping, setMapping] = useState<SipColumnMapping | null>(null);
  const [preview, setPreview] = useState<SipImportPreviewResult | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>(defaultAccountId);
  const [planId, setPlanId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [aiScreenshot, setAiScreenshot] = useState<{ sourcePath: string; fileName: string } | null>(null);
  const [aiRecognize, setAiRecognize] = useState<SipAiRecognizeResult | null>(null);
  const [aiRecords, setAiRecords] = useState<SipAiExtractedRecord[]>([]);

  useEffect(() => {
    if (open) setAccountId(defaultAccountId);
  }, [defaultAccountId, open]);

  const headerOptions = useMemo(
    () =>
      csv?.headers.map((header, index) => ({
        label: `${index + 1}. ${header}`,
        value: index,
      })) ?? [],
    [csv],
  );

  const reset = (): void => {
    setMode('csv');
    setStep(0);
    setCsv(null);
    setMapping(null);
    setPreview(null);
    setPlanId(undefined);
    setAiScreenshot(null);
    setAiRecognize(null);
    setAiRecords([]);
  };

  const switchMode = (nextMode: ImportMode): void => {
    setMode(nextMode);
    setStep(0);
    setPreview(null);
    if (nextMode === 'csv') {
      setAiScreenshot(null);
      setAiRecognize(null);
      setAiRecords([]);
    } else {
      setCsv(null);
      setMapping(null);
    }
  };

  const selectFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const picked = await window.desktop.import.selectCsvFile();
      if (!picked) return;
      const parsed = await window.desktop.sip.parseImportCsv(picked.sourcePath);
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

  const selectScreenshot = async (): Promise<void> => {
    setBusy(true);
    try {
      const picked = await window.desktop.sip.selectImportScreenshot();
      if (!picked) return;
      setAiScreenshot(picked);
      setAiRecognize(null);
      setAiRecords([]);
      setPreview(null);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '截图选择失败');
    } finally {
      setBusy(false);
    }
  };

  const recognizeScreenshot = async (): Promise<void> => {
    if (!aiScreenshot) {
      void message.warning('请先选择截图');
      return;
    }
    if (!accountId) {
      void message.warning('请选择账户');
      return;
    }
    setBusy(true);
    try {
      const recognized = await window.desktop.sip.recognizeImportScreenshot(aiScreenshot.sourcePath);
      setAiRecognize(recognized);
      setAiRecords(recognized.records);
      const nextPreview = await window.desktop.sip.previewAiImport({
        accountId,
        planId,
        records: recognized.records,
      });
      setPreview(nextPreview);
      setStep(2);
      void message.success(`已识别 ${recognized.records.length} 条记录，请核对后确认导入`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : 'AI 识别失败');
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
      const input: SipImportInput = { sourcePath: csv.sourcePath, accountId, planId, mapping };
      setPreview(await window.desktop.sip.previewImport(input));
      setStep(2);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '预览失败');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (): Promise<void> => {
    if (!accountId || !preview || preview.readyCount === 0) return;
    setBusy(true);
    try {
      const result =
        mode === 'ai'
          ? await window.desktop.sip.commitAiImport({ accountId, planId, records: aiRecords })
          : await window.desktop.sip.commitImport({
              sourcePath: csv!.sourcePath,
              accountId,
              planId,
              mapping: mapping!,
            });
      void message.success(
        `导入 ${result.imported} 笔，关联计划 ${result.linkedToPlan} 笔，仅流水 ${result.ledgerOnly} 笔`,
      );
      reset();
      onSaved();
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const previewColumns: ColumnsType<SipImportPreviewRow> = [
    { title: '行', dataIndex: 'rowIndex', width: 56 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 88,
      render: (status: SipImportPreviewRow['status']) =>
        status === 'ready' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            可导入
          </Tag>
        ) : status === 'duplicate' ? (
          <Tag color="gold">重复</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            错误
          </Tag>
        ),
    },
    { title: '标的', dataIndex: 'symbol', width: 88 },
    {
      title: '扣款日',
      dataIndex: 'tradeAt',
      width: 148,
      render: (value: string | null) => (value ? formatDateTime(value) : '—'),
    },
    {
      title: '净值',
      dataIndex: 'nav',
      width: 88,
      align: 'right',
      render: (value: number | null) => (value === null ? '—' : <ValueDisplay kind="price" value={value} />),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 96,
      align: 'right',
      render: (value: number | null) =>
        value === null ? '—' : <ValueDisplay kind="currency" value={value} />,
    },
    {
      title: '匹配计划',
      dataIndex: 'matchedPlanName',
      render: (value: string | null, row) => value ?? row.message ?? '—',
    },
  ];

  const stepItems =
    mode === 'csv'
      ? [{ title: '选择文件' }, { title: '列映射' }, { title: '预览确认' }]
      : [{ title: '选择截图' }, { title: 'AI 识别' }, { title: '预览确认' }];

  return (
    <Modal
      title="导入历史定投"
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      width={920}
      footer={null}
      destroyOnHidden
    >
      <Segmented<ImportMode>
        options={[
          { label: 'CSV 文件', value: 'csv' },
          { label: 'AI 截图识别', value: 'ai' },
        ]}
        value={mode}
        onChange={switchMode}
        style={{ marginBottom: 16 }}
      />

      <Steps current={step} size="small" items={stepItems} style={{ marginBottom: 20 }} />

      {mode === 'csv' && step === 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <p className="sip-import-hint">
            支持从券商/基金平台导出的扣款记录 CSV。必填：标的代码、扣款日期、净值、扣款金额。
          </p>
          <Button type="primary" icon={<UploadOutlined />} loading={busy} onClick={() => void selectFile()}>
            选择 CSV 文件
          </Button>
        </Space>
      ) : null}

      {mode === 'ai' && step === 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <p className="sip-import-hint">
            上传基金 App 扣款记录截图，AI 将自动识别标的、日期、净值与金额。识别结果仅供核对，确认无误后再写入。
          </p>
          <AccountSelect value={accountId} onChange={setAccountId} />
          <Select
            allowClear
            placeholder="限定关联计划（可选，留空则按标的自动匹配）"
            value={planId}
            onChange={setPlanId}
            options={plans.map((plan) => ({ label: `${plan.name} · ${plan.symbol}`, value: plan.id }))}
            style={{ width: '100%' }}
          />
          <Space wrap>
            <Button icon={<PictureOutlined />} loading={busy} onClick={() => void selectScreenshot()}>
              选择截图
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!aiScreenshot || !accountId}
              onClick={() => void recognizeScreenshot()}
            >
              开始 AI 识别
            </Button>
          </Space>
          {aiScreenshot ? (
            <p>
              已选截图：<strong>{aiScreenshot.fileName}</strong>
            </p>
          ) : null}
        </Space>
      ) : null}

      {mode === 'csv' && step === 1 && csv && mapping ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <p>
            文件：<strong>{csv.fileName}</strong>（{csv.rowCount} 行）
          </p>
          <AccountSelect value={accountId} onChange={setAccountId} />
          <Select
            allowClear
            placeholder="限定关联计划（可选，留空则按标的自动匹配）"
            value={planId}
            onChange={setPlanId}
            options={plans.map((plan) => ({ label: `${plan.name} · ${plan.symbol}`, value: plan.id }))}
            style={{ width: '100%' }}
          />
          <div className="import-mapping-grid">
            {(Object.keys(FIELD_LABELS) as SipCsvField[]).map((field) => (
              <label key={field}>
                <span>
                  {FIELD_LABELS[field]}
                  {REQUIRED_FIELDS.has(field) ? ' *' : ''}
                </span>
                <Select
                  allowClear
                  placeholder="不映射"
                  value={mapping[field] >= 0 ? mapping[field] : undefined}
                  options={headerOptions}
                  onChange={(value) => setMapping({ ...mapping, [field]: value ?? -1 })}
                  style={{ width: '100%' }}
                />
              </label>
            ))}
          </div>
          <Space>
            <Button onClick={() => setStep(0)}>上一步</Button>
            <Button type="primary" loading={busy} onClick={() => void runPreview()}>
              预览
            </Button>
          </Space>
        </Space>
      ) : null}

      {step === 2 && preview ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {mode === 'ai' && aiRecognize ? (
            <>
              <Alert
                type="info"
                showIcon
                title={`AI 已从截图识别 ${aiRecognize.records.length} 条记录`}
                description={
                  <>
                    模型 {aiRecognize.model} · 文件 {aiRecognize.fileName}
                    {aiRecognize.warnings.length > 0 ? (
                      <ul className="sip-import-ai-warnings">
                        {aiRecognize.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                }
              />
              <p className="sip-import-hint">请逐条核对识别结果，确认无误后再导入。错误行不会写入。</p>
            </>
          ) : null}
          <p>
            可导入 <strong>{preview.readyCount}</strong> 笔，重复 {preview.duplicateCount} 笔，错误{' '}
            {preview.errorCount} 笔
          </p>
          <Table
            className="watchlist-table"
            rowKey="rowIndex"
            size="small"
            pagination={{ pageSize: 8 }}
            columns={previewColumns}
            dataSource={preview.rows}
            scroll={{ x: 900, y: 280 }}
          />
          <Space>
            <Button onClick={() => setStep(mode === 'ai' ? 0 : 1)}>上一步</Button>
            <Button type="primary" loading={busy} disabled={preview.readyCount === 0} onClick={() => void commit()}>
              确认导入
            </Button>
          </Space>
        </Space>
      ) : null}
    </Modal>
  );
}
