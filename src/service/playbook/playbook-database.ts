import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CreatePlaybookRuleInput,
  PlaybookCheckTiming,
  PlaybookRule,
  PlaybookRuleCategory,
  PlaybookRuleStatus,
  UpdatePlaybookRuleInput,
} from '../../shared/playbook/types';

const ACTIVATION_CHECKLIST_LIMIT = 7;

function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const normalized = symbol.trim().toUpperCase();
  return normalized || null;
}

interface PlaybookRuleRow {
  id: string;
  content: string;
  category: PlaybookRuleCategory;
  status: PlaybookRuleStatus;
  symbol: string | null;
  check_timing: PlaybookCheckTiming;
  source_review_id: string | null;
  created_at: string;
  updated_at: string;
}

export class PlaybookDatabase {
  constructor(private readonly db: DatabaseSync) {}

  listRules(status?: PlaybookRuleStatus): PlaybookRule[] {
    const rows = status
      ? (this.db
          .prepare('SELECT * FROM playbook_rules WHERE status = ? ORDER BY updated_at DESC')
          .all(status) as unknown as PlaybookRuleRow[])
      : (this.db.prepare('SELECT * FROM playbook_rules ORDER BY updated_at DESC').all() as unknown as PlaybookRuleRow[]);
    return rows.map((row) => this.mapRule(row));
  }

  listActivationChecklist(symbol?: string): PlaybookRule[] {
    const normalizedSymbol = normalizeSymbol(symbol);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM playbook_rules
        WHERE status = 'active'
          AND check_timing IN ('plan_activation', 'always')
          AND (? IS NULL OR symbol IS NULL OR symbol = ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `,
      )
      .all(normalizedSymbol, normalizedSymbol, ACTIVATION_CHECKLIST_LIMIT) as unknown as PlaybookRuleRow[];
    return rows.map((row) => this.mapRule(row));
  }

  createRule(input: CreatePlaybookRuleInput): PlaybookRule {
    const content = input.content.trim();
    if (!content) throw new Error('规则内容不能为空');

    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO playbook_rules (
          id, content, category, status, symbol, check_timing, source_review_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        content,
        input.category,
        normalizeSymbol(input.symbol),
        input.checkTiming ?? 'plan_activation',
        input.sourceReviewId ?? null,
        now,
        now,
      );
    return this.getRule(id);
  }

  createFromReview(reviewId: string, symbol: string, lesson: string): PlaybookRule {
    return this.createRule({
      content: lesson,
      category: 'process',
      symbol,
      checkTiming: 'plan_activation',
      sourceReviewId: reviewId,
    });
  }

  updateRule(id: string, input: UpdatePlaybookRuleInput): PlaybookRule {
    this.getRule(id);
    const current = this.getRule(id);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE playbook_rules
        SET content = ?, category = ?, symbol = ?, check_timing = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        input.content?.trim() ?? current.content,
        input.category ?? current.category,
        input.symbol !== undefined ? normalizeSymbol(input.symbol) : current.symbol,
        input.checkTiming ?? current.checkTiming,
        input.status ?? current.status,
        now,
        id,
      );
    return this.getRule(id);
  }

  archiveRule(id: string): PlaybookRule {
    return this.updateRule(id, { status: 'archived' });
  }

  countRules(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM playbook_rules WHERE status = 'active'").get() as {
      count: number;
    };
    return row.count;
  }

  getRule(id: string): PlaybookRule {
    const row = this.db.prepare('SELECT * FROM playbook_rules WHERE id = ?').get(id) as unknown as PlaybookRuleRow | undefined;
    if (!row) throw new Error('规则不存在');
    return this.mapRule(row);
  }

  private mapRule(row: PlaybookRuleRow): PlaybookRule {
    return {
      id: row.id,
      content: row.content,
      category: row.category,
      status: row.status,
      symbol: row.symbol,
      checkTiming: row.check_timing,
      sourceReviewId: row.source_review_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
