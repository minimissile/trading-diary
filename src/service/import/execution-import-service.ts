import type { EpisodeDatabase } from '../episodes/episode-database';
import type {
  CsvParseResult,
  ExecutionImportCommitResult,
  ExecutionImportInput,
  ExecutionImportPreviewResult,
  ExecutionImportPreviewRow,
} from '../../shared/import/types';
import { assertRequiredMapping, guessExecutionColumnMapping } from './column-guess';
import { csvBasename, parseCsvFile } from './csv-parser';
import { normalizeExecutionRow } from './row-normalizer';

export class ExecutionImportService {
  constructor(private readonly episodes: EpisodeDatabase) {}

  parseCsv(sourcePath: string): CsvParseResult {
    const parsed = parseCsvFile(sourcePath);
    return {
      sourcePath,
      fileName: csvBasename(sourcePath),
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 8),
      suggestedMapping: guessExecutionColumnMapping(parsed.headers),
    };
  }

  preview(input: ExecutionImportInput): ExecutionImportPreviewResult {
    assertRequiredMapping(input.mapping);
    const parsed = parseCsvFile(input.sourcePath);
    const rows: ExecutionImportPreviewRow[] = parsed.rows.map((row, index) => {
      const normalized = normalizeExecutionRow(row, input.mapping);
      if (!normalized.ok) {
        return {
          rowIndex: index + 2,
          status: 'error',
          message: normalized.message,
          symbol: null,
          side: null,
          quantity: null,
          price: null,
          fees: null,
          tradeAt: null,
        };
      }
      return {
        rowIndex: index + 2,
        status: 'ready',
        message: null,
        symbol: normalized.value.symbol,
        side: normalized.value.side,
        quantity: normalized.value.quantity,
        price: normalized.value.price,
        fees: normalized.value.fees,
        tradeAt: normalized.value.tradeAt,
      };
    });

    return summarizePreview(rows);
  }

  commit(input: ExecutionImportInput): ExecutionImportCommitResult {
    assertRequiredMapping(input.mapping);
    const parsed = parseCsvFile(input.sourcePath);
    const accountId = this.episodes.resolveAccountId(input.accountId);

    let imported = 0;
    let skippedDuplicate = 0;
    let failed = 0;
    const closedBefore = new Set(
      this.episodes
        .listEpisodes(accountId)
        .filter((episode) => episode.status === 'closed')
        .map((episode) => episode.id),
    );
    const errors: Array<{ rowIndex: number; message: string }> = [];

    const sortedRows = parsed.rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftAt = normalizeExecutionRow(left.row, input.mapping);
        const rightAt = normalizeExecutionRow(right.row, input.mapping);
        if (!leftAt.ok || !rightAt.ok) return left.index - right.index;
        return leftAt.value.tradeAt.localeCompare(rightAt.value.tradeAt);
      });

    for (const { row, index } of sortedRows) {
      const normalized = normalizeExecutionRow(row, input.mapping);
      if (!normalized.ok) {
        failed += 1;
        errors.push({ rowIndex: index + 2, message: normalized.message });
        continue;
      }

      try {
        this.episodes.addExecution({
          accountId,
          ...normalized.value,
          source: 'csv',
        });
        imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : '导入失败';
        if (message.includes('重复')) {
          skippedDuplicate += 1;
        } else {
          failed += 1;
          errors.push({ rowIndex: index + 2, message });
        }
      }
    }

    const closedAfter = this.episodes.listEpisodes(accountId).filter((episode) => episode.status === 'closed');
    const closedEpisodes = closedAfter.filter((episode) => !closedBefore.has(episode.id)).length;

    return { imported, skippedDuplicate, failed, closedEpisodes, errors: errors.slice(0, 20) };
  }
}

function summarizePreview(rows: ExecutionImportPreviewRow[]): ExecutionImportPreviewResult {
  return {
    rows: rows.slice(0, 200),
    readyCount: rows.filter((row) => row.status === 'ready').length,
    duplicateCount: rows.filter((row) => row.status === 'duplicate').length,
    errorCount: rows.filter((row) => row.status === 'error').length,
  };
}
