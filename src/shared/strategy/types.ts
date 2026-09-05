export type StockStrategyId = 'momentum' | 'breakout' | 'pullback';
export type StrategyPoolId = 'personal' | 'research' | 'custom';

export interface StockStrategySettings {
  strategyId: StockStrategyId;
  poolId: StrategyPoolId;
  symbols: string[];
  topN: number;
  holdingDays: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  initialCapital: number;
  commissionBps: number;
  minimumCommission: number;
  stampDutyBps: number;
  slippageBps: number;
}

export interface StrategyStock {
  symbol: string;
  name: string;
}
export interface StrategyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rawOpen: number;
  rawClose: number;
}
export interface StrategySeries extends StrategyStock {
  bars: StrategyBar[];
}
export interface StockCandidate extends StrategyStock {
  rank: number;
  score: number;
  signalDate: string;
  referencePrice: number;
  momentum20: number;
  volumeRatio: number;
  volatility20: number;
  reasons: string[];
}
export interface StrategyExclusion extends StrategyStock {
  reason: string;
}
export interface StockScreenResult {
  id: string;
  createdAt: string;
  signalDate: string;
  settings: StockStrategySettings;
  universe: StrategyStock[];
  evaluatedCount: number;
  candidates: StockCandidate[];
  exclusions: StrategyExclusion[];
  warnings: string[];
}
export interface StrategyEquityPoint {
  date: string;
  equity: number;
  cash: number;
  returnPercent: number;
  benchmarkPercent: number;
  drawdownPercent: number;
}
export interface StrategyTrade extends StrategyStock {
  signalDate: string;
  date: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  fees: number;
  reason: string;
  pnl: number | null;
}
export interface StockBacktestInput {
  settings: StockStrategySettings;
  startDate: string;
  endDate: string;
}
export interface StockBacktestResult {
  id: string;
  createdAt: string;
  input: StockBacktestInput;
  universe: StrategyStock[];
  startDate: string;
  endDate: string;
  totalReturnPercent: number;
  annualizedReturnPercent: number | null;
  benchmarkReturnPercent: number;
  maxDrawdownPercent: number;
  winRatePercent: number | null;
  closedTrades: number;
  fees: number;
  finalEquity: number;
  openPositions: number;
  skippedOrders: number;
  curve: StrategyEquityPoint[];
  trades: StrategyTrade[];
  warnings: string[];
}
export interface StockStrategyState {
  settings: StockStrategySettings;
  screens: StockScreenResult[];
  lastBacktest: StockBacktestResult | null;
}
export interface StockStrategyMethods {
  'stockStrategy.state': { params: Record<string, never>; result: StockStrategyState };
  'stockStrategy.save': { params: StockStrategySettings; result: StockStrategySettings };
  'stockStrategy.screen': { params: { settings: StockStrategySettings; refresh?: boolean }; result: StockScreenResult };
  'stockStrategy.backtest': { params: StockBacktestInput; result: StockBacktestResult };
}
export interface StockStrategyApi {
  getState: () => Promise<StockStrategyState>;
  saveSettings: (settings: StockStrategySettings) => Promise<StockStrategySettings>;
  screen: (input: { settings: StockStrategySettings; refresh?: boolean }) => Promise<StockScreenResult>;
  backtest: (input: StockBacktestInput) => Promise<StockBacktestResult>;
}
