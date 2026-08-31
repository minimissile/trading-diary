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
  | 'zabank'
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
  | 'ttfund'
  | 'antfortune'
  | 'qieman'
  | 'licaitong'
  | 'jdjr'
  | 'howbuy'
  | 'yingmi'
  | 'youzhiyouxing'
  | 'fundbean'
  | 'lufund'
  | 'duxiaoman'
  | 'simuwang'
  | 'zhonglu'
  | 'aifund'
  | 'fund123'
  | 'efunds'
  | 'chinaamc'
  | 'nffund'
  | 'harvestfund'
  | 'gtfund'
  | 'phfund'
  | 'bosera'
  | 'cmb'
  | 'icbc'
  | 'ccb'
  | 'abc'
  | 'boc'
  | 'bocom'
  | 'cibbank'
  | 'spdb'
  | 'cmbc'
  | 'citicbank'
  | 'webank'
  | 'mybank'
  | 'psbc'
  | 'bob'
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
  /** 股票账户：ETF/LOF 统一佣金（未分市场时使用）。 */
  etfCommissionWan?: number;
  etfCommissionMinYuan?: number;
  etfNoCommissionMin?: boolean;
  /** 上证 ETF/LOF 佣金；未填时沿用 etfCommissionWan。 */
  etfShCommissionWan?: number;
  etfShCommissionMinYuan?: number;
  etfShNoCommissionMin?: boolean;
  /** 深证 ETF/LOF 佣金；未填时沿用 etfCommissionWan。 */
  etfSzCommissionWan?: number;
  etfSzCommissionMinYuan?: number;
  etfSzNoCommissionMin?: boolean;
  /** 港股佣金（万）；未填时沿用 commissionWan。 */
  hkCommissionWan?: number;
  hkCommissionMinYuan?: number;
  hkNoCommissionMin?: boolean;
  /** 美股佣金（万）；与 usCommissionPerShare 二选一。 */
  usCommissionWan?: number;
  usCommissionMinYuan?: number;
  usNoCommissionMin?: boolean;
  /** 美股每股佣金（美元）；> 0 时按股数计费。 */
  usCommissionPerShare?: number;
}

/** 费率配置。 */
export interface FeeProfile {
  id: string;
  name: string;
  /** 股票佣金（万 X，4 位小数，如 1.0540 表示万 1.054）。 */
  commissionWan: number;
  commissionMinCents: number;
  /** ETF 统一佣金；null 表示沿用股票佣金或未单独设置。 */
  etfCommissionWan: number | null;
  etfCommissionMinCents: number | null;
  /** 上证 ETF/LOF 佣金；null 表示沿用 etfCommissionWan。 */
  etfShCommissionWan: number | null;
  etfShCommissionMinCents: number | null;
  /** 深证 ETF/LOF 佣金；null 表示沿用 etfCommissionWan。 */
  etfSzCommissionWan: number | null;
  etfSzCommissionMinCents: number | null;
  /** 港股佣金（万）；null 表示沿用 commissionWan。 */
  hkCommissionWan: number | null;
  hkCommissionMinCents: number | null;
  /** 美股佣金（万）；null 表示沿用 commissionWan。 */
  usCommissionWan: number | null;
  usCommissionMinCents: number | null;
  /** 美股每股佣金；> 0 时按股数计费，单位与报价币种一致（USD）。 */
  usCommissionPerShare: number | null;
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
  /** 浮动盈亏合计（已扣预估卖出费用）。 */
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
  currency?: string;
  marketScope?: string[];
  feeProfileId?: string;
  customFee?: AccountCustomFeeInput;
}

/** 费用试算市场（A 股交易所 + 港美股）。 */
export type FeeMarket = 'SH' | 'SZ' | 'HK' | 'US' | null;

/** 费用试算输入。 */
export interface FeeEstimateInput {
  side: 'buy' | 'sell';
  market: FeeMarket;
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
  commissionWan: number;
  commissionMinCents: number;
  etfCommissionWan: number | null;
  etfCommissionMinCents: number | null;
  etfShCommissionWan: number | null;
  etfShCommissionMinCents: number | null;
  etfSzCommissionWan: number | null;
  etfSzCommissionMinCents: number | null;
  hkCommissionWan: number | null;
  hkCommissionMinCents: number | null;
  usCommissionWan: number | null;
  usCommissionMinCents: number | null;
  usCommissionPerShare: number | null;
  stampDutyRatePpm: number;
  transferFeeRatePpm: number;
  transferFeeMinCents: number;
  otherFeeCents: number;
}
