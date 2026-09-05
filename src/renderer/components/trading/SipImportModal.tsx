import { CheckCircleOutlined, CloseCircleOutlined, EditOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Modal, Segmented, Select, Space, Steps, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  SipAiExtractedRecord,
  SipAiRecognizeResult,
  SipColumnMapping,
  SipCsvField,
  SipCsvParseResult,
  SipImportCommitResult,
  SipImportInput,
  SipImportPreviewResult,
  SipImportPreviewRow,
} from '../../../shared/sip/import-types';
import type { FundSipPlanView } from '../../../shared/sip/types';
import { ValueDisplay, formatDateTime } from '../../lib/trading-format';
import { AccountSelect } from './AccountSelect';
import { EditableDecimalInput } from './EditableDecimalInput';

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
export function SipImportModal({ open, defaultAccountId, plans, onClose, onSaved }: SipImportModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [mode, setMode] = useState<ImportMode>('ai');
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
  const [aiEnrichments, setAiEnrichments] = useState<string[]>([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAccountId(defaultAccountId);
    }
    wasOpenRef.current = open;
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
    setMode('ai');
    setStep(0);
    setCsv(null);
    setMapping(null);
    setPreview(null);
    setPlanId(undefined);
    setAiScreenshot(null);
    setAiRecognize(null);
    setAiRecords([]);
    setAiEnrichments([]);
  };

  const switchMode = (nextMode: ImportMode): void => {
    setMode(nextMode);
    setStep(0);
    setPreview(null);
    if (nextMode === 'csv') {
      setAiScreenshot(null);
      setAiRecognize(null);
      setAiRecords([]);
      setAiEnrichments([]);
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
      const aiPreview = await window.desktop.sip.previewAiImport({
        accountId,
        planId,
        records: recognized.records,
      });
      setPreview(aiPreview.preview);
      setAiRecords(aiPreview.records);
      setAiEnrichments([...recognized.enrichments, ...aiPreview.enrichments]);
      setStep(2);
      const summary =
        aiPreview.preview.incompleteCount > 0
          ? `已识别 ${recognized.records.length} 条，其中 ${aiPreview.preview.incompleteCount} 条待补全`
          : aiPreview.preview.readyCount > 0
            ? `已识别 ${aiPreview.preview.readyCount} 条可导入记录`
            : `已识别 ${recognized.records.length} 条记录，请核对后确认导入`;
      void message.success(summary);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : 'AI 识别失败');
    } finally {
      setBusy(false);
    }
  };

  const updateAiRecord = (rowIndex: number, patch: Partial<SipAiExtractedRecord>): void => {
    setAiRecords((records) => records.map((record) => (record.rowIndex === rowIndex ? { ...record, ...patch } : record)));
  };

  const refreshAiPreview = async (): Promise<void> => {
    if (!accountId || aiRecords.length === 0) {
      void message.warning('没有可预览的记录');
      return;
    }
    setBusy(true);
    try {
      const aiPreview = await window.desktop.sip.previewAiImport({ accountId, planId, records: aiRecords });
      setPreview(aiPreview.preview);
      setAiRecords(aiPreview.records);
      setAiEnrichments(aiPreview.enrichments);
      void message.success('已更新预览');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '预览失败');
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

  const formatCommitSummary = (result: SipImportCommitResult): string => {
    const parts = [`导入 ${result.imported} 笔`];
    if (result.plansCreated > 0) parts.push(`新建计划 ${result.plansCreated} 个`);
    if (result.linkedToPlan > 0) parts.push(`关联计划 ${result.linkedToPlan} 笔`);
    if (result.ledgerOnly > 0) parts.push(`仅流水 ${result.ledgerOnly} 笔`);
    if (result.skippedDuplicate > 0) parts.push(`跳过重复 ${result.skippedDuplicate} 笔`);
    if (result.failed > 0) parts.push(`失败 ${result.failed} 笔`);
    return parts.join('，');
  };

  const showCommitFailure = (result: SipImportCommitResult): void => {
    if (result.errors.length > 0) {
      const detail = result.errors
        .slice(0, 3)
        .map((item) => `第 ${item.rowIndex} 行：${item.message}`)
        .join('；');
      void message.error(`未能导入记录。${detail}`);
      return;
    }
    if (result.skippedDuplicate > 0) {
      void message.warning(`未导入新记录，${result.skippedDuplicate} 笔与已有流水重复`);
      return;
    }
    void message.warning('未导入任何记录，请检查预览中的错误提示后重试');
  };

  const commit = async (): Promise<void> => {
    if (!accountId || !preview || preview.readyCount === 0) {
      void message.warning('没有可导入的记录');
      return;
    }
    setBusy(true);
    try {
      let result: SipImportCommitResult;
      if (mode === 'ai') {
        const aiPreview = await window.desktop.sip.previewAiImport({ accountId, planId, records: aiRecords });
        setPreview(aiPreview.preview);
        setAiRecords(aiPreview.records);
        setAiEnrichments(aiPreview.enrichments);

        if (aiPreview.preview.readyCount === 0) {
          void message.warning('没有可导入的记录，请补全标的信息后点击「重新预览」');
          return;
        }

        const readyRowIndexes = new Set(
          aiPreview.preview.rows.filter((row) => row.status === 'ready').map((row) => row.rowIndex),
        );
        const recordsToCommit = aiPreview.records.filter((record) => readyRowIndexes.has(record.rowIndex));
        result = await window.desktop.sip.commitAiImport({
          accountId,
          planId,
          records: recordsToCommit,
          planHints: aiRecognize?.planHints ?? null,
        });
      } else {
        result = await window.desktop.sip.commitImport({
          sourcePath: csv!.sourcePath,
          accountId,
          planId,
          mapping: mapping!,
        });
      }

      if (result.imported <= 0) {
        showCommitFailure(result);
        return;
      }

      void message.success(formatCommitSummary(result));
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
        ) : status === 'incomplete' ? (
          <Tag icon={<EditOutlined />} color="processing">
            待补全
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            错误
          </Tag>
        ),
    },
    {
      title: '标的',
      dataIndex: 'symbol',
      width: 108,
      render: (value: string | null, row) => {
        if (mode !== 'ai') return value ?? '—';
        const record = aiRecords.find((item) => item.rowIndex === row.rowIndex);
        return (
          <Input
            size="small"
            placeholder="6 位代码"
            value={record?.symbol ?? ''}
            onChange={(event) => updateAiRecord(row.rowIndex, { symbol: event.target.value || null })}
          />
        );
      },
    },
    {
      title: '扣款日',
      dataIndex: 'tradeAt',
      width: mode === 'ai' ? 132 : 148,
      render: (value: string | null, row) => {
        if (mode !== 'ai') return value ? formatDateTime(value) : '—';
        const record = aiRecords.find((item) => item.rowIndex === row.rowIndex);
        return (
          <Input
            size="small"
            placeholder="YYYY-MM-DD"
            value={record?.tradeAt ?? ''}
            onChange={(event) => updateAiRecord(row.rowIndex, { tradeAt: event.target.value || null })}
          />
        );
      },
    },
    {
      title: '净值',
      dataIndex: 'nav',
      width: 96,
      align: 'right',
      render: (value: number | null, row) => {
        if (mode !== 'ai') return value === null ? '—' : <ValueDisplay kind="price" value={value} />;
        const record = aiRecords.find((item) => item.rowIndex === row.rowIndex);
        return (
          <EditableDecimalInput
            size="small"
            placeholder="净值"
            value={record?.nav}
            onValueChange={(nav) => updateAiRecord(row.rowIndex, { nav })}
          />
        );
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 108,
      align: 'right',
      render: (value: number | null, row) => {
        if (mode !== 'ai') return value === null ? '—' : <ValueDisplay kind="currency" value={value} />;
        const record = aiRecords.find((item) => item.rowIndex === row.rowIndex);
        return (
          <EditableDecimalInput
            size="small"
            placeholder="金额"
            value={record?.amount}
            onValueChange={(amount) => updateAiRecord(row.rowIndex, { amount })}
          />
        );
      },
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
          { label: 'AI 截图识别', value: 'ai' },
          { label: 'CSV 文件', value: 'csv' },
        ]}
        value={mode}
        onChange={switchMode}
        style={{ marginBottom: 16 }}
      />

      <Steps current={step} size="small" items={stepItems} style={{ marginBottom: 20 }} />

      {mode === 'csv' && step === 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <p className="sip-import-hint">支持从券商/基金平台导出的扣款记录 CSV。必填：标的代码、扣款日期、净值、扣款金额。</p>
          <Button type="primary" icon={<UploadOutlined />} loading={busy} onClick={() => void selectFile()}>
            选择 CSV 文件
          </Button>
        </Space>
      ) : null}

      {mode === 'ai' && step === 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <p className="sip-import-hint">
            请截取 App 内「扣款记录 / 定投记录 /
            交易明细」列表（需能看到扣款日期与金额或份额）。若只截计划设置页，将无法识别历史扣款；智能定投历史仍可导入，但不会自动复制策略。
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
          {mode === 'ai' && aiRecognize?.planMode === 'smart' ? (
            <Alert type="warning" showIcon title="识别为智能定投：历史扣款可导入，本应用不支持复制智能策略" />
          ) : null}
          {mode === 'ai' && aiEnrichments.length > 0 ? (
            <details className="ui-import-notes">
              <summary>识别与补全说明（{aiEnrichments.length}）</summary>
              <ul>
                {aiEnrichments.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p>
            可导入 <strong>{preview.readyCount}</strong> 笔
            {preview.incompleteCount > 0 ? (
              <>
                ，待补全 <strong>{preview.incompleteCount}</strong> 笔
              </>
            ) : null}
            ，重复 {preview.duplicateCount} 笔，错误 {preview.errorCount} 笔
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
            {mode === 'ai' ? (
              <Button loading={busy} onClick={() => void refreshAiPreview()}>
                重新预览
              </Button>
            ) : null}
            <Button type="primary" loading={busy} disabled={preview.readyCount === 0} onClick={() => void commit()}>
              确认导入
            </Button>
          </Space>
        </Space>
      ) : null}
    </Modal>
  );
}
