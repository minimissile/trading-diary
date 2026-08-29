/** 持仓视图「全部账户汇总」的特殊账户 ID。 */
export const ALL_ACCOUNTS_ID = '__all__';

/** 是否为全部账户汇总视图。 */
export function isAllAccountsId(accountId?: string): boolean {
  return accountId === ALL_ACCOUNTS_ID;
}
