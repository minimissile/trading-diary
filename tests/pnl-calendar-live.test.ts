import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { PortfolioService } from '../src/service/portfolio/portfolio-service';
import { currentMonthPrefix } from '../src/shared/portfolio/pnl-calendar-window';

const DB_PATH = '/Users/nuke/Library/Application Support/交易日记/database/app.sqlite';

describe.skipIf(!existsSync(DB_PATH))('pnl calendar live', () => {
  it('getPnlCalendar does not throw for current and edge months', async () => {
    const db = new AppDatabase(DB_PATH);
    const svc = new PortfolioService(db);
    const current = currentMonthPrefix();
    const view = await svc.getPnlCalendar(undefined, current);
    expect(view.days.length).toBeGreaterThan(0);
    expect(view.windowStart <= view.windowEnd).toBe(true);

    const edgeMonth = view.windowStart.slice(0, 7);
    const edgeView = await svc.getPnlCalendar(undefined, edgeMonth);
    expect(edgeView.month).toBe(edgeMonth);
  });
});
