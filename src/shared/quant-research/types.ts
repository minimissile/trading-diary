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
  'quantResearch.state': { params: Record<string, never>; result: QuantResearchState };
  'quantResearch.save': { params: QuantSettings; result: QuantSettings };
  'quantResearch.scan': { params: QuantSettings; result: QuantRun };
  'quantResearch.run': { params: { id: string }; result: QuantRun };
}

export interface QuantResearchApi {
  getState: () => Promise<QuantResearchState>;
  saveSettings: (settings: QuantSettings) => Promise<QuantSettings>;
  scan: (settings: QuantSettings) => Promise<QuantRun>;
  getRun: (id: string) => Promise<QuantRun>;
}
