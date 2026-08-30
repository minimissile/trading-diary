import type { CreateTradingAccountInput, UpdateTradingAccountInput } from './types';

/** 统一 alias / 旧版 name 字段。 */
export function normalizeCreateAccountInput(
  input: CreateTradingAccountInput & { name?: string },
): CreateTradingAccountInput {
  const alias = input.alias ?? input.name;
  return {
    broker: input.broker,
    accountKind: input.accountKind,
    currency: input.currency,
    marketScope: input.marketScope,
    feeProfileId: input.feeProfileId,
    customFee: input.customFee,
    isDefault: input.isDefault,
    alias: alias?.trim() || undefined,
  };
}

/** 统一 alias / 旧版 name 字段。 */
export function normalizeUpdateAccountInput(
  input: UpdateTradingAccountInput & { name?: string },
): UpdateTradingAccountInput {
  const alias =
    input.alias !== undefined || input.name !== undefined
      ? (input.alias ?? input.name)?.trim() ?? ''
      : input.alias;
  return {
    broker: input.broker,
    accountKind: input.accountKind,
    currency: input.currency,
    marketScope: input.marketScope,
    feeProfileId: input.feeProfileId,
    customFee: input.customFee,
    alias,
  };
}
