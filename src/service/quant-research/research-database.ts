import type { DatabaseSync } from 'node:sqlite';
import {
  defaultResearchRequest,
  researchReportSchema,
  researchRequestSchema,
  type ResearchKind,
  type ResearchReport,
  type ResearchRequest,
  type ResearchState,
  type ResearchSummary,
} from '../../shared/quant-research/workbench';
import type { ShareObservation } from './research-market-data';

export class ResearchWorkbenchDatabase {
  constructor(private readonly db: DatabaseSync) {}
  state(kind: ResearchKind): ResearchState {
    const saved = this.db.prepare('SELECT payload_json FROM quant_research_tool_settings WHERE kind = ?').get(kind) as
      { payload_json: string } | undefined;
    const rows = this.db
      .prepare('SELECT summary_json FROM quant_research_reports WHERE kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 20')
      .all(kind) as Array<{ summary_json: string }>;
    const history = rows.map((r) => JSON.parse(r.summary_json) as ResearchSummary);
    return {
      settings: saved ? researchRequestSchema.parse(JSON.parse(saved.payload_json)) : defaultResearchRequest(kind),
      latest: history[0] ? this.get(history[0].id) : null,
      history,
    };
  }
  get(id: string): ResearchReport {
    const row = this.db.prepare('SELECT payload_json FROM quant_research_reports WHERE id = ?').get(id) as
      { payload_json: string } | undefined;
    if (!row) throw new Error('研究记录不存在或已超过该工具最近 20 次保留范围');
    return researchReportSchema.parse(JSON.parse(row.payload_json));
  }
  saveSettings(input: ResearchRequest): ResearchRequest {
    const parsed = researchRequestSchema.parse(input);
    this.db
      .prepare(
        'INSERT INTO quant_research_tool_settings(kind, payload_json) VALUES (?, ?) ON CONFLICT(kind) DO UPDATE SET payload_json = excluded.payload_json',
      )
      .run(parsed.kind, JSON.stringify(parsed));
    return parsed;
  }
  previous(symbol: string, date: string): ShareObservation | null {
    const row = this.db
      .prepare(
        'SELECT symbol, data_date AS date, shares FROM quant_research_share_observations WHERE symbol = ? AND data_date < ? ORDER BY data_date DESC LIMIT 1',
      )
      .get(symbol, date) as unknown as ShareObservation | undefined;
    return row ?? null;
  }
  save(input: ResearchReport, observations: ShareObservation[] = []): ResearchReport {
    const report = researchReportSchema.parse(input);
    const { id, kind, createdAt, title, asOf } = report;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.saveSettings(report.request);
      this.db
        .prepare('INSERT INTO quant_research_reports(id, kind, created_at, summary_json, payload_json) VALUES (?, ?, ?, ?, ?)')
        .run(id, kind, createdAt, JSON.stringify({ id, kind, createdAt, title, asOf }), JSON.stringify(report));
      this.db
        .prepare(
          'DELETE FROM quant_research_reports WHERE kind = ? AND id NOT IN (SELECT id FROM quant_research_reports WHERE kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 20)',
        )
        .run(kind, kind);
      const upsert = this.db.prepare(
        'INSERT INTO quant_research_share_observations(symbol, data_date, shares) VALUES (?, ?, ?) ON CONFLICT(symbol, data_date) DO UPDATE SET shares = excluded.shares',
      );
      const prune = this.db.prepare(
        'DELETE FROM quant_research_share_observations WHERE symbol = ? AND data_date NOT IN (SELECT data_date FROM quant_research_share_observations WHERE symbol = ? ORDER BY data_date DESC LIMIT 90)',
      );
      for (const item of observations) {
        if (!Number.isFinite(item.shares) || item.shares <= 0) throw new Error('无效份额快照');
        upsert.run(item.symbol, item.date, item.shares);
        prune.run(item.symbol, item.symbol);
      }
      this.db.exec('COMMIT');
      return report;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
