import type { ResearchKind, ResearchReport, ResearchRequest, ResearchState } from './workbench';

export type QuantRuleId =
  | 'new_high'
  | 'new_low'
  | 'ma_cross_up'
  | 'ma_cross_down'
  | 'volume_surge'
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'upper_shadow';
export type QuantSignalDirection = 'strength' | 'weakness' | 'activity';

export interface QuantSettings {
  poolId: 'personal' | 'custom';
  symbols: string[];
  rules: QuantRuleId[];
  lookback: number;
  maPeriod: number;
  volumeMultiple: number;
  recentDays: number;
}

export interface QuantBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuantStock {
  symbol: string;
  name: string;
}
export interface QuantSeries extends QuantStock {
  bars: QuantBar[];
}
export interface QuantSignal extends QuantStock {
  id: string;
  date: string;
  ruleId: QuantRuleId;
  direction: QuantSignalDirection;
  adjustedClose: number;
  volumeRatio: number | null;
  description: string;
}

export interface QuantRunSummary {
  id: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  scannedCount: number;
  matchedCount: number;
  signalCount: number;
  excludedCount: number;
}

export interface QuantRun extends QuantRunSummary {
  settings: QuantSettings;
  universe: QuantStock[];
  signals: QuantSignal[];
  exclusions: Array<QuantStock & { reason: string }>;
  source: 'tencent';
  engineVersion: 1;
}

export interface QuantResearchState {
  settings: QuantSettings;
  history: QuantRunSummary[];
  latest: QuantRun | null;
}

export interface QuantResearchMethods {
  'quantResearch.toolState': { params: { kind: ResearchKind }; result: ResearchState };
  'quantResearch.toolSave': { params: ResearchRequest; result: ResearchRequest };
  'quantResearch.toolRun': { params: ResearchRequest; result: ResearchReport };
  'quantResearch.report': { params: { id: string }; result: ResearchReport };
  'quantResearch.state': { params: Record<string, never>; result: QuantResearchState };
  'quantResearch.save': { params: QuantSettings; result: QuantSettings };
  'quantResearch.scan': { params: QuantSettings; result: QuantRun };
  'quantResearch.run': { params: { id: string }; result: QuantRun };
}

export interface QuantResearchApi {
  getToolState: (kind: ResearchKind) => Promise<ResearchState>;
  saveToolSettings: (input: ResearchRequest) => Promise<ResearchRequest>;
  runTool: (input: ResearchRequest) => Promise<ResearchReport>;
  getReport: (id: string) => Promise<ResearchReport>;
  getState: () => Promise<QuantResearchState>;
  saveSettings: (settings: QuantSettings) => Promise<QuantSettings>;
  scan: (settings: QuantSettings) => Promise<QuantRun>;
  getRun: (id: string) => Promise<QuantRun>;
}
