/** AI 从截图推断的定投方式。 */
export type SipRecognizedPlanMode = 'fixed' | 'smart' | 'unknown';

/** 根据识别结果与预览统计生成面向用户的提示。 */
export function buildSipAiImportHints(options: {
  planMode: SipRecognizedPlanMode;
  planModeLabel?: string | null;
  readyCount?: number;
  ledgerOnlyCount?: number;
  unmatchedPlanCount?: number;
}): string[] {
  const hints: string[] = [];
  const { planMode, planModeLabel, readyCount = 0, ledgerOnlyCount = 0, unmatchedPlanCount = 0 } = options;

  if (planMode === 'smart') {
    if (planModeLabel) hints.push(`截图显示为「${planModeLabel}」：每期扣款金额可能随策略变化。`);
    else hints.push('截图显示为智能定投：每期扣款金额可能随策略变化。');
    hints.push('本应用定投计划仅支持普通定投（固定金额 + 固定周期），不会自动复制 App 内的智能策略。');
    hints.push('历史扣款仍可正常导入；导入后请到「新建定投」手动设置参考每期金额，或仅保留持仓流水。');
  } else if (planMode === 'fixed') {
    hints.push('识别为普通定投；若已有对应计划，导入后将自动关联期次。');
  } else {
    hints.push('未能从截图判断定投方式；历史扣款可先导入，计划请手动核对后创建或调整。');
  }

  if (readyCount > 0) {
    hints.push(`共 ${readyCount} 笔扣款可写入，确认后不会丢失已发生的定投数据。`);
  }

  if (unmatchedPlanCount > 0) {
    hints.push(`${unmatchedPlanCount} 笔未匹配已有计划，导入时将自动创建定投计划并关联期次。`);
  }
  if (ledgerOnlyCount > 0) {
    hints.push(`${ledgerOnlyCount} 笔将仅写入持仓流水（无法创建或关联计划）。`);
  }

  return hints;
}

/** 统计预览中未匹配计划的 ready 行数。 */
export function countUnmatchedReadyRows(
  rows: Array<{ status: string; matchedPlanName: string | null; message: string | null }>,
): number {
  return rows.filter(
    (row) => row.status === 'ready' && row.matchedPlanName === null && !row.message?.includes('自动创建'),
  ).length;
}
