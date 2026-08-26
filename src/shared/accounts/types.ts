/** 券商/渠道标识。 */
export type AccountBroker =
  | 'huatai'
  | 'citic'
  | 'csc'
  | 'gtja'
  | 'haitong'
  | 'gf'
  | 'cms'
  | 'galaxy'
  | 'swhy'
  | 'guosen'
  | 'cicc'
  | 'ciccwm'
  | 'xyzq'
  | 'ebscn'
  | 'pingan'
  | 'dfzq'
  | 'sdicsec'
  | 'bocichina'
  | 'glzq'
  | 'ghzq'
  | 'eastmoney'
  | 'ths'
  | 'xueqiu'
  | 'futu'
  | 'tiger'
  | 'cjsc'
  | 'zszq'
  | 'ztzq'
  | 'nesc'
  | 'hxzq'
  | 'gjzq'
  | 'dwzq'
  | 'fzzq'
  | 'cgws'
  | 'gyzq'
  | 'tfzq'
  | 'haazq'
  | 'cnht'
  | 'mszq'
  | 'xdzq'
  | 'jyzq'
  | 'hczq'
  | 'cczq'
  | 'swsc'
  | 'gszq'
  | 'gkzq'
  | 'gdzq'
  | 'gxzq'
  | 'grzq'
  | 'njzq'
  | 'shzq'
  | 'chinalin'
  | 'hlzq'
  | 'cfzq'
  | 'hfzq'
  | 'hwabao'
  | 'huajin'
  | 'dycy'
  | 'dgzq'
  | 'dhzq'
  | 'dxzq'
  | 'ccnew'
  | 'avicsec'
  | 'cnpsec'
  | 'ztzsec'
  | 'sgsec'
  | 'kysec'
  | 'xcsc'
  | 'ykzq'
  | 'jhzq'
  | 'wlzq'
  | 'whzq'
  | 'lczq'
  | 'tebon'
  | 'bhzq'
  | 'wkzq'
  | 'tpyzq'
  | 'jzsec'
  | 'ytzq'
  | 'yxzq'
  | 'sczq'
  | 'htzq'
  | 'sxzq'
  | 'westsec'
  | 'ajzq'
  | 'dtsbc'
  | 'sjzq'
  | 'jinyuan'
  | 'cczqsc'
  | 'cdzq'
  | 'dtsec'
  | 'ydzq'
  | 'mgzq'
  | 'custom'
  | 'other';

/** 账户类型。 */
export type AccountKind = 'securities' | 'fund';

/** 费用试算标的类型。 */
export type TradeFeeInstrumentKind = 'stock' | 'etf' | 'lof' | 'otc_fund';

/** 账户自定义费率输入（前端万X，后端转 ppm）。 */
export interface AccountCustomFeeInput {
  commissionWan: number;
  commissionMinYuan?: number;
  noCommissionMin?: boolean;
  /** 股票账户必填：ETF/LOF 佣金。 */
  etfCommissionWan?: number;
  etfCommissionMinYuan?: number;
  etfNoCommissionMin?: boolean;
}

/** 费率配置。 */
export interface FeeProfile {
  id: string;
  name: string;
  commissionRatePpm: number;
  commissionMinCents: number;
  /** ETF 独立佣金；null 表示沿用股票佣金。 */
  etfCommissionRatePpm: number | null;
  etfCommissionMinCents: number | null;
  stampDutyRatePpm: number;
  transferFeeRatePpm: number;
  transferFeeMinCents: number;
  otherFeeCents: number;
  slippageBps: number;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 交易账户主数据。 */
export interface TradingAccount {
  id: string;
  name: string;
  broker: AccountBroker;
  accountKind: AccountKind;
  currency: string;
  marketScope: string[];
  feeProfileId: string | null;
  /** @deprecated 不做现金余额管理，字段保留兼容旧数据。 */
  initialBalance: number;
  isDefault: boolean;
  isArchived: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 带统计摘要的账户视图。 */
export interface TradingAccountSummary extends TradingAccount {
  totalFees: number;
  totalTurnover: number;
  feeRatio: number | null;
  positionCount: number;
  ledgerCount: number;
  /** 持仓市值（来自行情 × 份额）。 */
  totalMarketValue: number;
  /** 持仓成本。 */
  totalCost: number;
  /** 浮动盈亏 = 市值 − 成本。 */
  unrealizedPnl: number;
}

/** 新建账户输入。 */
export interface CreateTradingAccountInput {
  /** 别名；同一券商多账户时用于区分，留空则仅显示券商名。 */
  alias?: string;
  /** @deprecated 使用 alias。 */
  name?: string;
  broker?: AccountBroker;
  accountKind?: AccountKind;
  currency?: string;
  marketScope?: string[];
  feeProfileId?: string;
  customFee?: AccountCustomFeeInput;
  isDefault?: boolean;
}

/** 更新账户输入。 */
export interface UpdateTradingAccountInput {
  alias?: string;
  /** @deprecated 使用 alias。 */
  name?: string;
  broker?: AccountBroker;
  accountKind?: AccountKind;
  feeProfileId?: string;
  customFee?: AccountCustomFeeInput;
}

/** 费用试算输入。 */
export interface FeeEstimateInput {
  side: 'buy' | 'sell';
  market: 'SH' | 'SZ' | null;
  price: number;
  quantity: number;
  instrumentKind?: TradeFeeInstrumentKind;
  feeProfileId?: string;
  accountId?: string;
}

/** 费用试算结果。 */
export interface FeeEstimateResult {
  grossAmount: number;
  commission: number;
  stampDuty: number;
  transferFee: number;
  otherFee: number;
  totalFees: number;
}

/** 费率试算所需的精简字段。 */
export interface FeeProfileRates {
  commissionRatePpm: number;
  commissionMinCents: number;
  /** ETF 独立佣金；null 表示沿用股票佣金。 */
  etfCommissionRatePpm: number | null;
  etfCommissionMinCents: number | null;
  stampDutyRatePpm: number;
  transferFeeRatePpm: number;
  transferFeeMinCents: number;
  otherFeeCents: number;
}
