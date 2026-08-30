import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { App, Button, Checkbox, Input, Modal, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LedgerAiExtractedRecord,
  LedgerAiRecognizeResult,
  LedgerImportCommitResult,
  LedgerImportPreviewRow,
  LedgerImportPreviewResult,
} from '../../../shared/portfolio/ledger-import-types';
import { AccountSelect } from './AccountSelect';
import { ValueDisplay } from '../../lib/trading-format';

type ImportStep = 0 | 1;
const MAX_SCREENSHOTS = 20;

interface ScreenshotEntry {
  sourcePath: string;
  fileName: string;
  previewUrl: string;
}

function formatTradeAtForInput(value: string | null | undefined): string {
  if (!value) return '';
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(day) ? day : value;
}

function renderPreviewStatus(status: LedgerImportPreviewRow['status']): React.ReactNode {
  switch (status) {
    case 'ready':
      return (
        <Tag bordered={false} icon={<CheckCircleOutlined />} color="success">
          可导入
        </Tag>
      );
    case 'duplicate':
      return (
        <Tag bordered={false} color="gold">
          重复
        </Tag>
      );
    case 'incomplete':
      return (
        <Tag bordered={false} icon={<EditOutlined />} color="processing">
          待补全
        </Tag>
      );
    case 'skipped':
      return <Tag bordered={false}>跳过</Tag>;
    default:
      return (
        <Tag bordered={false} icon={<CloseCircleOutlined />} color="error">
          错误
        </Tag>
      );
  }
}

function extractClipboardImageFiles(event: ClipboardEvent): File[] {
  const files: File[] = [];
  const items = event.clipboardData?.items;
  if (!items) return files;

  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

async function filesToPastePayload(files: File[]): Promise<Array<{ data: string; mimeType: string }>> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const comma = result.indexOf(',');
            resolve({
              data: comma >= 0 ? result.slice(comma + 1) : result,
              mimeType: file.type || 'image/png',
            });
          };
          reader.onerror = () => reject(reader.error ?? new Error('读取粘贴图片失败'));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

interface LedgerAiImportModalProps {
  open: boolean;
  defaultAccountId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 持仓 AI 识图导入弹窗，支持多图识别股票/基金买卖与定投扣款。
 */
export function LedgerAiImportModal({
  open,
  defaultAccountId,
  onClose,
  onSaved,
}: LedgerAiImportModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [step, setStep] = useState<ImportStep>(0);
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [recognized, setRecognized] = useState<LedgerAiRecognizeResult | null>(null);
  const [records, setRecords] = useState<LedgerAiExtractedRecord[]>([]);
  const [preview, setPreview] = useState<LedgerImportPreviewResult | null>(null);
  const [enrichments, setEnrichments] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(defaultAccountId);
  const [importSipDeductions, setImportSipDeductions] = useState(true);
  const [busy, setBusy] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAccountId(defaultAccountId);
    }
    wasOpenRef.current = open;
  }, [defaultAccountId, open]);

  const sipDeductionCount = useMemo(
    () => records.filter((record) => record.recordKind === 'sip_deduction').length,
    [records],
  );

  const canRecognize = Boolean(accountId && screenshots.length > 0);

  const reset = (): void => {
    setStep(0);
    setScreenshots([]);
    setRecognized(null);
    setRecords([]);
    setPreview(null);
    setEnrichments([]);
    setImportSipDeductions(true);
  };

  const appendScreenshotEntries = useCallback((entries: ScreenshotEntry[]): void => {
    setScreenshots((current) => [...current, ...entries].slice(0, MAX_SCREENSHOTS));
    setRecognized(null);
    setRecords([]);
    setPreview(null);
  }, []);

  const removeScreenshot = useCallback((sourcePath: string): void => {
    setScreenshots((current) => current.filter((entry) => entry.sourcePath !== sourcePath));
    setRecognized(null);
    setRecords([]);
    setPreview(null);
  }, []);

  const handlePasteImages = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) return;

      const remaining = MAX_SCREENSHOTS - screenshots.length;
      if (remaining <= 0) {
        void message.warning(`最多 ${MAX_SCREENSHOTS} 张截图`);
        return;
      }

      const batch = files.slice(0, remaining);
      setBusy(true);
      try {
        const images = await filesToPastePayload(batch);
        const saved = await window.desktop.portfolio.saveLedgerImportPasteImages(images);
        const previews = await window.desktop.portfolio.readLedgerImportImagePreviews(saved.sourcePaths);
        appendScreenshotEntries(
          saved.sourcePaths.map((sourcePath, index) => ({
            sourcePath,
            fileName: saved.fileNames[index] ?? `paste-${index + 1}.png`,
            previewUrl: previews[index] ?? '',
          })),
        );
        if (files.length > batch.length) {
          void message.warning(`最多 ${MAX_SCREENSHOTS} 张，已粘贴 ${saved.fileNames.length} 张`);
        } else {
          void message.success(`已粘贴 ${saved.fileNames.length} 张截图`);
        }
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '粘贴失败');
      } finally {
        setBusy(false);
      }
    },
    [appendScreenshotEntries, message, screenshots.length],
  );

  useEffect(() => {
    if (!open || step !== 0) return;

    const onPaste = (event: ClipboardEvent): void => {
      const files = extractClipboardImageFiles(event);
      if (files.length === 0) return;
      event.preventDefault();
      void handlePasteImages(files);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePasteImages, open, step]);

  const selectScreenshots = async (): Promise<void> => {
    setBusy(true);
    try {
      const picked = await window.desktop.portfolio.selectLedgerImportScreenshots();
      if (!picked) return;

      const remaining = MAX_SCREENSHOTS - screenshots.length;
      const sourcePaths = picked.sourcePaths.slice(0, remaining);
      const fileNames = picked.fileNames.slice(0, remaining);
      if (sourcePaths.length === 0) {
        void message.warning(`最多 ${MAX_SCREENSHOTS} 张截图`);
        return;
      }

      const previews = await window.desktop.portfolio.readLedgerImportImagePreviews(sourcePaths);
      appendScreenshotEntries(
        sourcePaths.map((sourcePath, index) => ({
          sourcePath,
          fileName: fileNames[index] ?? `screenshot-${index + 1}.png`,
          previewUrl: previews[index] ?? '',
        })),
      );
      if (picked.sourcePaths.length > sourcePaths.length) {
        void message.warning(`最多 ${MAX_SCREENSHOTS} 张，已添加 ${sourcePaths.length} 张`);
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '截图选择失败');
    } finally {
      setBusy(false);
    }
  };

  const recognize = async (): Promise<void> => {
    if (screenshots.length === 0) {
      void message.warning('请先选择截图');
      return;
    }
    if (!accountId) {
      void message.warning('请选择账户');
      return;
    }
    setBusy(true);
    try {
      const result = await window.desktop.portfolio.recognizeLedgerImportScreenshots(
        screenshots.map((entry) => entry.sourcePath),
      );
      setRecognized(result);
      const aiPreview = await window.desktop.portfolio.previewLedgerAiImport({
        accountId,
        records: result.records,
        importSipDeductions,
      });
      setPreview(aiPreview.preview);
      setRecords(aiPreview.records);
      setEnrichments([...result.enrichments, ...aiPreview.enrichments]);
      if (aiPreview.preview.sipReadyCount > 0) setImportSipDeductions(true);
      setStep(1);
      void message.success(
        `已识别 ${result.records.length} 条记录（${aiPreview.preview.tradeReadyCount} 条买卖可导入）`,
      );
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : 'AI 识别失败');
    } finally {
      setBusy(false);
    }
  };

  const updateRecord = (rowIndex: number, patch: Partial<LedgerAiExtractedRecord>): void => {
    setRecords((items) => items.map((record) => (record.rowIndex === rowIndex ? { ...record, ...patch } : record)));
  };

  const refreshPreview = async (): Promise<void> => {
    if (!accountId || records.length === 0) {
      void message.warning('没有可预览的记录');
      return;
    }
    setBusy(true);
    try {
      const aiPreview = await window.desktop.portfolio.previewLedgerAiImport({
        accountId,
        records,
        importSipDeductions,
      });
      setPreview(aiPreview.preview);
      setRecords(aiPreview.records);
      setEnrichments(aiPreview.enrichments);
      void message.success('已更新预览');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '预览失败');
    } finally {
      setBusy(false);
    }
  };

  const parseOptionalNumber = (raw: string): number | null => {
    const cleaned = raw.replace(/[,，\s￥¥元]/gu, '').trim();
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  };

  const formatCommitSummary = (result: LedgerImportCommitResult): string => {
    const parts: string[] = [];
    if (result.imported > 0) parts.push(`导入流水 ${result.imported} 笔`);
    if (result.sipImported > 0) parts.push(`导入定投 ${result.sipImported} 笔`);
    if (result.sipPlansCreated > 0) parts.push(`新建定投计划 ${result.sipPlansCreated} 个`);
    if (result.skippedDuplicate > 0) parts.push(`跳过重复 ${result.skippedDuplicate} 笔`);
    if (result.failed > 0) parts.push(`失败 ${result.failed} 笔`);
    return parts.join('，');
  };

  const commit = async (): Promise<void> => {
    if (!accountId || !preview) {
      void message.warning('请先完成识别与预览');
      return;
    }
    const readyCount = preview.readyCount + (importSipDeductions ? preview.sipReadyCount : 0);
    if (readyCount === 0) {
      void message.warning('没有可导入的记录');
      return;
    }

    setBusy(true);
    try {
      const aiPreview = await window.desktop.portfolio.previewLedgerAiImport({
        accountId,
        records,
        importSipDeductions,
      });
      setPreview(aiPreview.preview);
      setRecords(aiPreview.records);
      setEnrichments(aiPreview.enrichments);

      const readyTradeRows = new Set(
        aiPreview.preview.rows.filter((row) => row.status === 'ready' && row.recordKind === 'trade').map((row) => row.rowIndex),
      );
      const sipRows = importSipDeductions
        ? new Set(
            aiPreview.preview.rows
              .filter((row) => row.recordKind === 'sip_deduction' && row.status !== 'error')
              .map((row) => row.rowIndex),
          )
        : new Set<number>();

      const recordsToCommit = aiPreview.records.filter(
        (record) => readyTradeRows.has(record.rowIndex) || sipRows.has(record.rowIndex),
      );

      const result = await window.desktop.portfolio.commitLedgerAiImport({
        accountId,
        records: recordsToCommit,
        importSipDeductions,
        sipPlanHints: recognized?.sipPlanHints ?? null,
        sipPlanMode: recognized?.sipPlanMode,
        sipPlanModeLabel: recognized?.sipPlanModeLabel,
      });

      if (result.imported <= 0 && result.sipImported <= 0) {
        if (result.errors.length > 0) {
          const detail = result.errors
            .slice(0, 3)
            .map((item) => `第 ${item.rowIndex} 行：${item.message}`)
            .join('；');
          void message.error(`未能导入记录。${detail}`);
        } else {
          void message.warning('未导入任何新记录');
        }
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

  const previewColumns = useMemo<ColumnsType<LedgerImportPreviewRow>>(() => {
    const showMessageColumn = preview?.rows.some((row) => row.message) ?? false;
    const showKindColumn = preview?.rows.some((row) => row.recordKind !== 'trade') ?? false;

    const columns: ColumnsType<LedgerImportPreviewRow> = [
      { title: '#', dataIndex: 'rowIndex', width: 40, align: 'center' },
      {
        title: '状态',
        dataIndex: 'status',
        width: 78,
        render: (status: LedgerImportPreviewRow['status']) => renderPreviewStatus(status),
      },
    ];

    if (showKindColumn) {
      columns.push({
        title: '类型',
        dataIndex: 'recordKind',
        width: 64,
        render: (kind: LedgerImportPreviewRow['recordKind']) =>
          kind === 'sip_deduction' ? (
            <Tag bordered={false} color="blue">
              定投
            </Tag>
          ) : kind === 'dividend' ? (
            <Tag bordered={false} color="orange">
              分红
            </Tag>
          ) : (
            <Tag bordered={false}>买卖</Tag>
          ),
      });
    }

    columns.push(
      {
        title: '标的',
        dataIndex: 'symbol',
        width: 88,
        render: (_value: string | null, row) => {
          const record = records.find((item) => item.rowIndex === row.rowIndex);
          return (
            <Input
              size="small"
              variant="borderless"
              className="ledger-ai-import-cell-input"
              placeholder="代码"
              value={record?.symbol ?? ''}
              onChange={(event) => updateRecord(row.rowIndex, { symbol: event.target.value || null })}
            />
          );
        },
      },
      {
        title: '名称',
        dataIndex: 'instrumentName',
        width: 92,
        ellipsis: true,
      },
      {
        title: '方向',
        dataIndex: 'side',
        width: 52,
        align: 'center',
        render: (side: LedgerImportPreviewRow['side']) =>
          side === 'buy' ? '买入' : side === 'sell' ? '卖出' : '—',
      },
      {
        title: '日期',
        dataIndex: 'tradeAt',
        width: 108,
        render: (_value: string | null, row) => {
          const record = records.find((item) => item.rowIndex === row.rowIndex);
          return (
            <Input
              size="small"
              variant="borderless"
              className="ledger-ai-import-cell-input"
              placeholder="YYYY-MM-DD"
              value={formatTradeAtForInput(record?.tradeAt)}
              onChange={(event) => updateRecord(row.rowIndex, { tradeAt: event.target.value || null })}
            />
          );
        },
      },
      {
        title: '价格',
        dataIndex: 'price',
        width: 76,
        align: 'right',
        render: (value: number | null, row) => {
          const record = records.find((item) => item.rowIndex === row.rowIndex);
          if (row.status === 'ready' || row.status === 'duplicate') {
            return value === null ? '—' : <ValueDisplay kind="price" value={value} />;
          }
          return (
            <Input
              size="small"
              variant="borderless"
              className="ledger-ai-import-cell-input ledger-ai-import-cell-input--numeric"
              placeholder="价格"
              value={record?.price === null || record?.price === undefined ? '' : String(record.price)}
              onChange={(event) => updateRecord(row.rowIndex, { price: parseOptionalNumber(event.target.value) })}
            />
          );
        },
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: 72,
        align: 'right',
        render: (value: number | null, row) => {
          const record = records.find((item) => item.rowIndex === row.rowIndex);
          if (row.status === 'ready' || row.status === 'duplicate') {
            return value === null ? '—' : <ValueDisplay kind="quantity" value={value} />;
          }
          return (
            <Input
              size="small"
              variant="borderless"
              className="ledger-ai-import-cell-input ledger-ai-import-cell-input--numeric"
              placeholder="数量"
              value={record?.quantity === null || record?.quantity === undefined ? '' : String(record.quantity)}
              onChange={(event) => updateRecord(row.rowIndex, { quantity: parseOptionalNumber(event.target.value) })}
            />
          );
        },
      },
      {
        title: '手续费',
        dataIndex: 'fees',
        width: 76,
        align: 'right',
        render: (value: number | null, row) => {
          const record = records.find((item) => item.rowIndex === row.rowIndex);
          if (row.status === 'ready' || row.status === 'duplicate') {
            if (value === null) return '—';
            return <ValueDisplay kind="currency" value={value} />;
          }
          return (
            <Input
              size="small"
              variant="borderless"
              className="ledger-ai-import-cell-input ledger-ai-import-cell-input--numeric"
              placeholder="0"
              value={record?.fees === null || record?.fees === undefined ? '' : String(record.fees)}
              onChange={(event) => updateRecord(row.rowIndex, { fees: parseOptionalNumber(event.target.value) })}
            />
          );
        },
      },
    );

    if (showMessageColumn) {
      columns.push({
        title: '说明',
        dataIndex: 'message',
        width: 120,
        ellipsis: true,
        render: (message: string | null) => message ?? '—',
      });
    }

    return columns;
  }, [preview?.rows, records]);

  const handleClose = (): void => {
    reset();
    onClose();
  };

  return (
    <Modal
      className="ledger-ai-import-modal"
      title={
        <div className="ledger-ai-import-modal__title">
          <span>AI 识图导入持仓</span>
          <small>从 App 成交截图自动识别买卖与基金流水</small>
        </div>
      }
      open={open}
      width={step === 1 ? 1000 : 920}
      onCancel={handleClose}
      footer={
        <div className="ledger-ai-import-modal__footer">
          {step === 0 ? (
            <>
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" loading={busy} disabled={!canRecognize} onClick={() => void recognize()}>
                开始 AI 识别
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => {
                  setStep(0);
                  setPreview(null);
                  setRecognized(null);
                }}
              >
                重新选择
              </Button>
              <Button loading={busy} onClick={() => void refreshPreview()}>
                重新预览
              </Button>
              <Button
                type="primary"
                loading={busy}
                disabled={!preview || preview.readyCount + (importSipDeductions ? preview.sipReadyCount : 0) === 0}
                onClick={() => void commit()}
              >
                确认导入
              </Button>
            </>
          )}
        </div>
      }
      destroyOnClose
    >
      <div className="ledger-ai-import-modal__steps">
        <div className={`ledger-ai-import-step ${step >= 0 ? 'is-active' : ''} ${step > 0 ? 'is-done' : ''}`}>
          <span className="ledger-ai-import-step__index">1</span>
          <span className="ledger-ai-import-step__label">选择截图</span>
        </div>
        <div className="ledger-ai-import-step__line" />
        <div className={`ledger-ai-import-step ${step >= 1 ? 'is-active' : ''}`}>
          <span className="ledger-ai-import-step__index">2</span>
          <span className="ledger-ai-import-step__label">核对导入</span>
        </div>
      </div>

      {step === 0 ? (
        <section className="import-panel ledger-ai-import-panel">
          <p className="ledger-ai-import-hint">
            支持同花顺、东方财富、券商 App、蚂蚁财富等平台的<strong>成交记录 / 交易明细</strong>
            截图。请截取包含成交时间、价格或净值、数量或份额的列表页，不要只截持仓汇总。
          </p>

          <label className="import-form-row">
            <span>导入账户</span>
            <AccountSelect value={accountId} onChange={setAccountId} placeholder="选择要写入流水的账户" />
          </label>

          <button
            type="button"
            className={`ledger-ai-import-upload ${screenshots.length > 0 ? 'has-files' : ''}`}
            disabled={busy}
            tabIndex={0}
            onClick={() => void selectScreenshots()}
            onPaste={(event) => {
              const files = extractClipboardImageFiles(event.nativeEvent);
              if (files.length === 0) return;
              event.preventDefault();
              void handlePasteImages(files);
            }}
          >
            <PictureOutlined className="ledger-ai-import-upload__icon" />
            <strong>{screenshots.length > 0 ? '继续添加截图' : '选择或粘贴截图'}</strong>
            <span>点击选择文件，或在弹窗内按 Ctrl+V / ⌘V 直接粘贴（PNG / JPG / WebP，最多 {MAX_SCREENSHOTS} 张）</span>
          </button>

          {screenshots.length > 0 ? (
            <div className="ledger-ai-import-previews">
              <div className="ledger-ai-import-previews__header">
                <strong>已添加 {screenshots.length} 张</strong>
                <span>点击右上角可移除</span>
              </div>
              <ul className="ledger-ai-import-previews__grid">
                {screenshots.map((entry) => (
                  <li key={entry.sourcePath} className="ledger-ai-import-preview-card">
                    <button
                      type="button"
                      className="ledger-ai-import-preview-card__remove"
                      aria-label={`移除 ${entry.fileName}`}
                      onClick={() => removeScreenshot(entry.sourcePath)}
                    >
                      <CloseCircleOutlined />
                    </button>
                    <img src={entry.previewUrl} alt={entry.fileName} loading="lazy" />
                    <span title={entry.fileName}>{entry.fileName}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="ledger-ai-import-note">
            识别过程需联网调用 AI，请确保已配置 LLM 并激活 <code>ai_review</code> 功能。
          </p>
        </section>
      ) : null}

      {step === 1 && preview ? (
        <section className="import-panel ledger-ai-import-panel ledger-ai-import-panel--preview">
          {busy ? (
            <div className="ledger-ai-import-loading">
              <Spin />
              <span>正在识别截图…</span>
            </div>
          ) : null}

          {(enrichments.length > 0 || (recognized?.warnings.length ?? 0) > 0) && (
            <div className="ledger-ai-import-notices">
              {enrichments.length > 0 ? (
                <p>
                  <strong>自动补全</strong>
                  {enrichments.join('；')}
                </p>
              ) : null}
              {recognized?.warnings.length ? (
                <p className="ledger-ai-import-notices__warn">
                  <strong>识别提示</strong>
                  {recognized.warnings.join('；')}
                </p>
              ) : null}
            </div>
          )}

          <div className="import-summary-tags">
            <Tag color="success">可导入 {preview.readyCount}</Tag>
            {preview.sipReadyCount > 0 ? <Tag color="blue">定投 {preview.sipReadyCount}</Tag> : null}
            {preview.duplicateCount > 0 ? <Tag color="gold">重复 {preview.duplicateCount}</Tag> : null}
            {preview.incompleteCount > 0 ? <Tag color="processing">待补全 {preview.incompleteCount}</Tag> : null}
            {preview.errorCount > 0 ? <Tag color="error">错误 {preview.errorCount}</Tag> : null}
            {preview.skippedCount > 0 ? <Tag>跳过 {preview.skippedCount}</Tag> : null}
          </div>

          {sipDeductionCount > 0 ? (
            <label className="ledger-ai-import-sip-option">
              <Checkbox checked={importSipDeductions} onChange={(event) => setImportSipDeductions(event.target.checked)}>
                同时导入 {sipDeductionCount} 条基金定投扣款（将自动创建定投计划）
              </Checkbox>
            </label>
          ) : null}

          <div className="ledger-ai-import-table-wrap">
            <Table
              className="watchlist-table ledger-ai-import-table"
              size="small"
              rowKey="rowIndex"
              pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
              dataSource={preview.rows}
              columns={previewColumns}
              scroll={{ x: 'max-content' }}
            />
          </div>
        </section>
      ) : null}
    </Modal>
  );
}
