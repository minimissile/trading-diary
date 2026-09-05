import { z } from 'zod';
import { accountsServiceRequests } from './requests/accounts.requests';
import { alertsServiceRequests } from './requests/alerts.requests';
import { assetsServiceRequests } from './requests/assets.requests';
import { backupServiceRequests } from './requests/backup.requests';
import { episodesServiceRequests } from './requests/episodes.requests';
import { importServiceRequests } from './requests/import.requests';
import { lofArbitrageServiceRequests } from './requests/lof-arbitrage.requests';
import { licenseServiceRequests } from './requests/license.requests';
import { llmServiceRequests } from './requests/llm.requests';
import { marketServiceRequests } from './requests/market.requests';
import { longhubangServiceRequests } from './requests/longhubang.requests';
import { stockStrategyServiceRequests } from './requests/stock-strategy.requests';
import { quantResearchServiceRequests } from './requests/quant-research.requests';
import { plansServiceRequests } from './requests/plans.requests';
import { playbookServiceRequests } from './requests/playbook.requests';
import { portfolioServiceRequests } from './requests/portfolio.requests';
import { reviewsServiceRequests } from './requests/reviews.requests';
import { settingsServiceRequests } from './requests/settings.requests';
import { sipServiceRequests } from './requests/sip.requests';
import { systemServiceRequests } from './requests/system.requests';
import { watchlistServiceRequests } from './requests/watchlist.requests';
import { workspaceServiceRequests } from './requests/workspace.requests';

export const serviceRequestSchema = z.discriminatedUnion('method', [
  ...accountsServiceRequests,
  ...alertsServiceRequests,
  ...assetsServiceRequests,
  ...backupServiceRequests,
  ...episodesServiceRequests,
  ...importServiceRequests,
  ...licenseServiceRequests,
  ...lofArbitrageServiceRequests,
  ...llmServiceRequests,
  ...marketServiceRequests,
  ...longhubangServiceRequests,
  ...stockStrategyServiceRequests,
  ...quantResearchServiceRequests,
  ...plansServiceRequests,
  ...playbookServiceRequests,
  ...portfolioServiceRequests,
  ...reviewsServiceRequests,
  ...settingsServiceRequests,
  ...sipServiceRequests,
  ...systemServiceRequests,
  ...watchlistServiceRequests,
  ...workspaceServiceRequests,
]);
