import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_QUANT_SETTINGS } from '../../shared/quant-research/catalog';
import { quantRunSchema, quantRunSummarySchema, quantSettingsSchema } from '../../shared/quant-research/schemas';
import type { QuantResearchState, QuantRun, QuantRunSummary, QuantSettings } from '../../shared/quant-research/types';

export class QuantResearchDatabase {
  constructor(private readonly db: DatabaseSync) {}

  getState(): QuantResearchState {
    const saved = this.db.prepare('SELECT payload_json FROM quant_research_settings WHERE id = 1').get() as
      { payload_json: string } | undefined;
    const rows = this.db
      .prepare('SELECT summary_json FROM quant_research_runs ORDER BY created_at DESC, rowid DESC LIMIT 20')
      .all() as Array<{ summary_json: string }>;
    const history = rows.map((row) => quantRunSummarySchema.parse(JSON.parse(row.summary_json)));
    return {
      settings: saved ? quantSettingsSchema.parse(JSON.parse(saved.payload_json)) : structuredClone(DEFAULT_QUANT_SETTINGS),
      history,
      latest: history[0] ? this.getRun(history[0].id) : null,
    };
  }

  getRun(id: string): QuantRun {
    const row = this.db.prepare('SELECT payload_json FROM quant_research_runs WHERE id = ?').get(id) as
      { payload_json: string } | undefined;
    if (!row) throw new Error('扫描记录不存在或已超出最近 20 次保留范围');
    return quantRunSchema.parse(JSON.parse(row.payload_json));
  }

  saveSettings(input: QuantSettings): QuantSettings {
    const settings = quantSettingsSchema.parse(input);
    this.db
      .prepare(
        'INSERT INTO quant_research_settings (id, payload_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json',
      )
      .run(JSON.stringify(settings));
    return settings;
  }

  saveRun(input: QuantRun): void {
    const run = quantRunSchema.parse(input);
    const summary: QuantRunSummary = quantRunSummarySchema.parse(run);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.saveSettings(run.settings);
      this.db
        .prepare('INSERT INTO quant_research_runs (id, created_at, summary_json, payload_json) VALUES (?, ?, ?, ?)')
        .run(run.id, run.createdAt, JSON.stringify(summary), JSON.stringify(run));
      this.db.exec(
        'DELETE FROM quant_research_runs WHERE id NOT IN (SELECT id FROM quant_research_runs ORDER BY created_at DESC, rowid DESC LIMIT 20)',
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
