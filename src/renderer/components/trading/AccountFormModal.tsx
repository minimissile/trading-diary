import { useEffect } from 'react';
import { Checkbox, Form, Input, InputNumber, Modal, Radio, Select, Switch } from 'antd';
import type {
  AccountBroker,
  AccountCustomFeeInput,
  AccountKind,
  CreateTradingAccountInput,
  FeeProfile,
  TradingAccountSummary,
  UpdateTradingAccountInput,
} from '../../../shared/api.types';
import { getAccountAlias } from '../../../shared/accounts/account-display';
import {
  defaultMarketSettingsForAccount,
  suggestCurrencyForMarketScope,
} from '../../../shared/accounts/market-defaults';
import type { AccountMarketScope, QuoteCurrency } from '../../../shared/market/venues';
import { ACCOUNT_MARKET_SCOPES, labelForMarketScope } from '../../../shared/market/venues';
import {
  DEFAULT_HK_COMMISSION_MIN,
  DEFAULT_HK_COMMISSION_WAN,
  DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
  DEFAULT_SECURITIES_COMMISSION_WAN,
  DEFAULT_US_COMMISSION_MIN,
  DEFAULT_US_COMMISSION_PER_SHARE,
  resolveEtfMarketFormRates,
  resolveOffshoreMarketFormRates,
} from '../../../shared/accounts/fee-utils';
import {
  defaultBrokerForAccountKind,
  isBrokerAllowedForAccountKind,
} from '../../../shared/accounts/brokers';
import { BrokerSelect } from './BrokerSelect';

interface AccountFormValues {
  alias?: string;
  broker: AccountBroker;
  accountKind: AccountKind;
  marketScope: AccountMarketScope[];
  currency: QuoteCurrency;
  commissionWan: number;
  commissionMinYuan: number;
  noCommissionMin: boolean;
  etfShCommissionWan: number;
  etfShCommissionMinYuan: number;
  etfShNoCommissionMin: boolean;
  etfSzCommissionWan: number;
  etfSzCommissionMinYuan: number;
  etfSzNoCommissionMin: boolean;
  hkCommissionWan: number;
  hkCommissionMinYuan: number;
  hkNoCommissionMin: boolean;
  usCommissionMode: 'percent' | 'per_share';
  usCommissionWan: number;
  usCommissionPerShare: number;
  usCommissionMinYuan: number;
  usNoCommissionMin: boolean;
  isDefault?: boolean;
}

interface AccountFormModalProps {
  open: boolean;
  editing: TradingAccountSummary | null;
  feeProfiles: FeeProfile[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTradingAccountInput | { id: string; input: UpdateTradingAccountInput }) => void;
}

type SecuritiesFeeFormValues = Pick<
  AccountFormValues,
  | 'commissionWan'
  | 'commissionMinYuan'
  | 'noCommissionMin'
  | 'etfShCommissionWan'
  | 'etfShCommissionMinYuan'
  | 'etfShNoCommissionMin'
  | 'etfSzCommissionWan'
  | 'etfSzCommissionMinYuan'
  | 'etfSzNoCommissionMin'
  | 'hkCommissionWan'
  | 'hkCommissionMinYuan'
  | 'hkNoCommissionMin'
  | 'usCommissionMode'
  | 'usCommissionWan'
  | 'usCommissionPerShare'
  | 'usCommissionMinYuan'
  | 'usNoCommissionMin'
>;

function defaultOffshoreFeeValues(): Pick<
  SecuritiesFeeFormValues,
  | 'hkCommissionWan'
  | 'hkCommissionMinYuan'
  | 'hkNoCommissionMin'
  | 'usCommissionMode'
  | 'usCommissionWan'
  | 'usCommissionPerShare'
  | 'usCommissionMinYuan'
  | 'usNoCommissionMin'
> {
  return {
    hkCommissionWan: DEFAULT_HK_COMMISSION_WAN,
    hkCommissionMinYuan: DEFAULT_HK_COMMISSION_MIN,
    hkNoCommissionMin: false,
    usCommissionMode: 'per_share',
    usCommissionWan: 0,
    usCommissionPerShare: DEFAULT_US_COMMISSION_PER_SHARE,
    usCommissionMinYuan: DEFAULT_US_COMMISSION_MIN,
    usNoCommissionMin: false,
  };
}

function defaultEtfMarketFeeValues(): Pick<
  SecuritiesFeeFormValues,
  | 'etfShCommissionWan'
  | 'etfShCommissionMinYuan'
  | 'etfShNoCommissionMin'
  | 'etfSzCommissionWan'
  | 'etfSzCommissionMinYuan'
  | 'etfSzNoCommissionMin'
> {
  return {
    etfShCommissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    etfShCommissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    etfShNoCommissionMin: false,
    etfSzCommissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    etfSzCommissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    etfSzNoCommissionMin: false,
  };
}

function defaultSecuritiesFeeValues(offshoreOnly = false): SecuritiesFeeFormValues {
  if (offshoreOnly) {
    return {
      commissionWan: DEFAULT_HK_COMMISSION_WAN,
      commissionMinYuan: DEFAULT_HK_COMMISSION_MIN,
      noCommissionMin: false,
      ...defaultEtfMarketFeeValues(),
      ...defaultOffshoreFeeValues(),
    };
  }
  return {
    commissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    commissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    noCommissionMin: false,
    ...defaultEtfMarketFeeValues(),
    ...defaultOffshoreFeeValues(),
  };
}

function profileToFormValues(
  profile: FeeProfile | undefined,
  accountKind: AccountKind,
  marketScope: AccountMarketScope[] = ['CN_A'],
): SecuritiesFeeFormValues {
  const offshoreOnly = !marketScope.includes('CN_A');
  if (!profile) {
    return accountKind === 'fund'
      ? {
          commissionWan: 0,
          commissionMinYuan: 0,
          noCommissionMin: true,
          etfShCommissionWan: 0,
          etfShCommissionMinYuan: 0,
          etfShNoCommissionMin: true,
          etfSzCommissionWan: 0,
          etfSzCommissionMinYuan: 0,
          etfSzNoCommissionMin: true,
          ...defaultOffshoreFeeValues(),
        }
      : defaultSecuritiesFeeValues(offshoreOnly);
  }

  const sh = resolveEtfMarketFormRates(profile, 'SH');
  const sz = resolveEtfMarketFormRates(profile, 'SZ');
  const hk = resolveOffshoreMarketFormRates(profile, 'HK');
  const us = resolveOffshoreMarketFormRates(profile, 'US');

  return {
    commissionWan: profile.commissionWan,
    commissionMinYuan: profile.commissionMinCents / 100,
    noCommissionMin: profile.commissionMinCents === 0,
    etfShCommissionWan: sh.wan,
    etfShCommissionMinYuan: sh.minYuan,
    etfShNoCommissionMin: sh.noMin,
    etfSzCommissionWan: sz.wan,
    etfSzCommissionMinYuan: sz.minYuan,
    etfSzNoCommissionMin: sz.noMin,
    hkCommissionWan: hk.wan,
    hkCommissionMinYuan: hk.minYuan,
    hkNoCommissionMin: hk.noMin,
    usCommissionMode: us.perShare != null && us.perShare > 0 ? 'per_share' : 'percent',
    usCommissionWan: us.wan,
    usCommissionPerShare: us.perShare ?? 0,
    usCommissionMinYuan: us.minYuan,
    usNoCommissionMin: us.noMin,
  };
}

function toCustomFee(values: AccountFormValues): AccountCustomFeeInput {
  const hasCnA = values.marketScope.includes('CN_A');
  const hasHk = values.marketScope.includes('HK');
  const hasUs = values.marketScope.includes('US');
  const customFee: AccountCustomFeeInput = {
    commissionWan: hasCnA
      ? Number(values.commissionWan) || 0
      : Number(values.hkCommissionWan) || 0,
    commissionMinYuan: hasCnA
      ? values.noCommissionMin
        ? 0
        : Number(values.commissionMinYuan) || 0
      : values.hkNoCommissionMin
        ? 0
        : Number(values.hkCommissionMinYuan) || 0,
    noCommissionMin: hasCnA ? values.noCommissionMin : values.hkNoCommissionMin,
  };

  if (values.accountKind === 'securities') {
    if (hasCnA) {
      customFee.etfShCommissionWan = Number(values.etfShCommissionWan) || 0;
      customFee.etfShCommissionMinYuan = values.etfShNoCommissionMin
        ? 0
        : Number(values.etfShCommissionMinYuan) || 0;
      customFee.etfShNoCommissionMin = values.etfShNoCommissionMin;
      customFee.etfSzCommissionWan = Number(values.etfSzCommissionWan) || 0;
      customFee.etfSzCommissionMinYuan = values.etfSzNoCommissionMin
        ? 0
        : Number(values.etfSzCommissionMinYuan) || 0;
      customFee.etfSzNoCommissionMin = values.etfSzNoCommissionMin;
    }
    if (hasHk) {
      customFee.hkCommissionWan = Number(values.hkCommissionWan) || 0;
      customFee.hkCommissionMinYuan = values.hkNoCommissionMin
        ? 0
        : Number(values.hkCommissionMinYuan) || 0;
      customFee.hkNoCommissionMin = values.hkNoCommissionMin;
    }
    if (hasUs) {
      customFee.usCommissionMinYuan = values.usNoCommissionMin
        ? 0
        : Number(values.usCommissionMinYuan) || 0;
      customFee.usNoCommissionMin = values.usNoCommissionMin;
      if (values.usCommissionMode === 'per_share') {
        customFee.usCommissionPerShare = Number(values.usCommissionPerShare) || 0;
      } else {
        customFee.usCommissionWan = Number(values.usCommissionWan) || 0;
      }
    }
  }

  return customFee;
}

interface EtfMarketFeeFieldsProps {
  market: 'SH' | 'SZ';
  wanField: 'etfShCommissionWan' | 'etfSzCommissionWan';
  minField: 'etfShCommissionMinYuan' | 'etfSzCommissionMinYuan';
  noMinField: 'etfShNoCommissionMin' | 'etfSzNoCommissionMin';
  noMin: boolean;
}

function EtfMarketFeeFields({ market, wanField, minField, noMinField, noMin }: EtfMarketFeeFieldsProps): React.JSX.Element {
  const label = market === 'SH' ? '上证 ETF / LOF' : '深证 ETF / LOF';
  return (
    <>
      <p className="account-fee-subhead">{label}</p>
      <div className="portfolio-form-row">
        <Form.Item
          label="佣金（万）"
          name={wanField}
          rules={[{ required: true, message: `请输入${label}佣金` }]}
          extra="场内 ETF / LOF 适用"
        >
          <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
        </Form.Item>
        <Form.Item
          label="最低佣金（元）"
          name={minField}
          rules={[{ required: !noMin, message: `请输入${label}最低佣金` }]}
        >
          <InputNumber
            className="full-width-input"
            min={0}
            precision={2}
            disabled={noMin}
            addonAfter="元/笔"
          />
        </Form.Item>
      </div>
      <Form.Item name={noMinField} valuePropName="checked" className="account-fee-switch">
        <Switch checkedChildren="无最低佣金" unCheckedChildren="有最低佣金" />
      </Form.Item>
    </>
  );
}

function HkFeeFields({ noMin }: { noMin: boolean }): React.JSX.Element {
  return (
    <>
      <p className="account-fee-subhead">港股</p>
      <div className="portfolio-form-row">
        <Form.Item
          label="佣金（万）"
          name="hkCommissionWan"
          rules={[{ required: true, message: '请输入港股佣金' }]}
          extra="按成交金额比例，如 0.3 表示万 0.3（≈ 0.03%）"
        >
          <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
        </Form.Item>
        <Form.Item
          label="最低佣金（港币）"
          name="hkCommissionMinYuan"
          rules={[{ required: !noMin, message: '请输入港股最低佣金' }]}
        >
          <InputNumber
            className="full-width-input"
            min={0}
            precision={2}
            disabled={noMin}
            addonAfter="港币/笔"
          />
        </Form.Item>
      </div>
      <Form.Item name="hkNoCommissionMin" valuePropName="checked" className="account-fee-switch">
        <Switch checkedChildren="无最低佣金" unCheckedChildren="有最低佣金" />
      </Form.Item>
    </>
  );
}

function UsFeeFields({
  mode,
  noMin,
}: {
  mode: 'percent' | 'per_share';
  noMin: boolean;
}): React.JSX.Element {
  return (
    <>
      <p className="account-fee-subhead">美股</p>
      <Form.Item label="计费方式" name="usCommissionMode">
        <Radio.Group
          options={[
            { label: '按股（$/股）', value: 'per_share' },
            { label: '按成交额（万）', value: 'percent' },
          ]}
        />
      </Form.Item>
      {mode === 'per_share' ? (
        <div className="portfolio-form-row">
          <Form.Item
            label="每股佣金"
            name="usCommissionPerShare"
            rules={[{ required: true, message: '请输入每股佣金' }]}
            extra="如 0.005 表示每股 $0.005"
          >
            <InputNumber className="full-width-input" min={0} max={1} step={0.001} precision={4} addonBefore="$" />
          </Form.Item>
          <Form.Item
            label="最低佣金（美元）"
            name="usCommissionMinYuan"
            rules={[{ required: !noMin, message: '请输入美股最低佣金' }]}
          >
            <InputNumber
              className="full-width-input"
              min={0}
              precision={2}
              disabled={noMin}
              addonAfter="美元/笔"
            />
          </Form.Item>
        </div>
      ) : (
        <div className="portfolio-form-row">
          <Form.Item
            label="佣金（万）"
            name="usCommissionWan"
            rules={[{ required: true, message: '请输入美股佣金' }]}
            extra="按成交金额比例"
          >
            <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
          </Form.Item>
          <Form.Item
            label="最低佣金（美元）"
            name="usCommissionMinYuan"
            rules={[{ required: !noMin, message: '请输入美股最低佣金' }]}
          >
            <InputNumber
              className="full-width-input"
              min={0}
              precision={2}
              disabled={noMin}
              addonAfter="美元/笔"
            />
          </Form.Item>
        </div>
      )}
      <Form.Item name="usNoCommissionMin" valuePropName="checked" className="account-fee-switch">
        <Switch checkedChildren="无最低佣金" unCheckedChildren="有最低佣金" />
      </Form.Item>
    </>
  );
}

/** 新建/编辑账户表单。 */
export function AccountFormModal({
  open,
  editing,
  feeProfiles,
  saving,
  onClose,
  onSubmit,
}: AccountFormModalProps): React.JSX.Element {
  const [form] = Form.useForm<AccountFormValues>();
  const accountKind = Form.useWatch('accountKind', form) ?? 'securities';
  const marketScope = Form.useWatch('marketScope', form) ?? ['CN_A'];
  const noCommissionMin = Form.useWatch('noCommissionMin', form);
  const etfShNoCommissionMin = Form.useWatch('etfShNoCommissionMin', form);
  const etfSzNoCommissionMin = Form.useWatch('etfSzNoCommissionMin', form);
  const hkNoCommissionMin = Form.useWatch('hkNoCommissionMin', form);
  const usNoCommissionMin = Form.useWatch('usNoCommissionMin', form);
  const usCommissionMode = Form.useWatch('usCommissionMode', form) ?? 'per_share';

  const hasCnA = marketScope.includes('CN_A');
  const hasHk = marketScope.includes('HK');
  const hasUs = marketScope.includes('US');
  const hasOffshore = hasHk || hasUs;

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    if (editing) {
      const profile = feeProfiles.find((item) => item.id === editing.feeProfileId);
      form.setFieldsValue({
        alias: getAccountAlias(editing) ?? '',
        broker: editing.broker,
        accountKind: editing.accountKind,
        marketScope: editing.marketScope.filter((item): item is AccountMarketScope =>
          item === 'CN_A' || item === 'HK' || item === 'US',
        ),
        currency: editing.currency === 'HKD' || editing.currency === 'USD' ? editing.currency : 'CNY',
        ...profileToFormValues(profile, editing.accountKind, editing.marketScope.filter((item): item is AccountMarketScope =>
          item === 'CN_A' || item === 'HK' || item === 'US',
        )),
      });
      return;
    }

    const defaults = defaultMarketSettingsForAccount('huatai', 'securities');
    form.setFieldsValue({
      broker: 'huatai',
      accountKind: 'securities',
      marketScope: defaults.marketScope,
      currency: defaults.currency,
      isDefault: false,
      ...profileToFormValues(undefined, 'securities', defaults.marketScope),
    });
  }, [editing, feeProfiles, form, open]);

  const handleKindChange = (kind: AccountKind): void => {
    const profile = editing ? feeProfiles.find((item) => item.id === editing.feeProfileId) : undefined;
    const currentBroker = form.getFieldValue('broker') as AccountBroker | undefined;
    const nextBroker =
      currentBroker && isBrokerAllowedForAccountKind(currentBroker, kind)
        ? currentBroker
        : defaultBrokerForAccountKind(kind);
    const marketDefaults = defaultMarketSettingsForAccount(nextBroker, kind);
    form.setFieldsValue({
      accountKind: kind,
      broker: nextBroker,
      marketScope: marketDefaults.marketScope,
      currency: marketDefaults.currency,
      ...profileToFormValues(
        kind === editing?.accountKind ? profile : undefined,
        kind,
        marketDefaults.marketScope,
      ),
    });
  };

  const handleBrokerChange = (broker: AccountBroker): void => {
    const kind = (form.getFieldValue('accountKind') as AccountKind | undefined) ?? 'securities';
    const marketDefaults = defaultMarketSettingsForAccount(broker, kind);
    form.setFieldsValue({
      marketScope: marketDefaults.marketScope,
      currency: marketDefaults.currency,
      ...profileToFormValues(undefined, kind, marketDefaults.marketScope),
    });
  };

  const handleMarketScopeChange = (scopes: AccountMarketScope[]): void => {
    if (scopes.length === 0) return;
    const kind = (form.getFieldValue('accountKind') as AccountKind | undefined) ?? 'securities';
    form.setFieldsValue({
      marketScope: scopes,
      currency: suggestCurrencyForMarketScope(scopes),
      ...profileToFormValues(undefined, kind, scopes),
    });
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    const customFee = toCustomFee(values);
    const alias = values.alias?.trim() ?? '';
    if (editing) {
      onSubmit({
        id: editing.id,
        input: {
          alias,
          broker: values.broker,
          accountKind: values.accountKind,
          marketScope: values.marketScope,
          currency: values.currency,
          customFee,
        },
      });
      return;
    }
    onSubmit({
      alias: alias || undefined,
      broker: values.broker,
      accountKind: values.accountKind,
      marketScope: values.marketScope,
      currency: values.currency,
      customFee,
      isDefault: values.isDefault,
    });
  };

  return (
    <Modal
      title={editing ? '编辑账户' : '新建账户'}
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={720}
      className="accounts-form-modal"
    >
      <Form<AccountFormValues> form={form} layout="vertical" className="trading-form portfolio-ledger-form account-form">
        <Form.Item label="账户类型" name="accountKind" rules={[{ required: true }]}>
          <Radio.Group
            className="account-kind-radio"
            onChange={(event) => handleKindChange(event.target.value as AccountKind)}
            options={[
              { label: '股票账户', value: 'securities' },
              { label: '基金账户', value: 'fund' },
            ]}
          />
        </Form.Item>

        <div className="account-broker-row">
          <div className="portfolio-form-row">
            <Form.Item label="券商 / 渠道" name="broker" rules={[{ required: true, message: '请选择渠道' }]}>
              <BrokerSelect accountKind={accountKind} onChange={handleBrokerChange} />
            </Form.Item>
            <Form.Item label="别名" name="alias">
              <Input maxLength={80} placeholder="如 主账户、打新户" />
            </Form.Item>
          </div>
          <p className="form-field-hint">可选；同一券商开多个账户时用于区分，留空则仅显示券商名</p>
        </div>

        {accountKind === 'securities' ? (
          <>
            <Form.Item
              label="可交易市场"
              name="marketScope"
              rules={[{ required: true, message: '请至少选择一个市场' }]}
            >
              <Checkbox.Group
                options={ACCOUNT_MARKET_SCOPES.map((scope) => ({
                  label: labelForMarketScope(scope),
                  value: scope,
                }))}
                onChange={(checked) => handleMarketScopeChange(checked as AccountMarketScope[])}
              />
            </Form.Item>
            <Form.Item label="结算币种" name="currency" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: '人民币 (CNY)', value: 'CNY' },
                  { label: '港币 (HKD)', value: 'HKD' },
                  { label: '美元 (USD)', value: 'USD' },
                ]}
              />
            </Form.Item>
            <p className="form-field-hint">
              港股账户可同时勾选「港股 + 美股」；流水价格按标的报价币种录入，汇总以结算币种展示。
            </p>
          </>
        ) : null}

        <section className="account-fee-panel">
          <header className="account-fee-panel-head">
            <strong>{accountKind === 'fund' ? '基金费率' : '股票 / ETF 费率'}</strong>
            <span>
              {accountKind === 'fund'
                ? '场外基金按申购佣金估算，无印花税与过户费'
                : hasCnA && hasOffshore
                  ? 'A 股、港股、美股可分别配置佣金'
                  : hasOffshore
                    ? '港股按成交额比例；美股可选按股或按成交额'
                    : '股票与 ETF 分开设置佣金；上证与深证 ETF/LOF 可分别配置'}
            </span>
          </header>

          {accountKind === 'fund' ? (
            <Form.Item
              label="申购佣金（万）"
              name="commissionWan"
              rules={[{ required: true, message: '请输入佣金' }]}
              extra="如 0 表示免申购费"
            >
              <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
            </Form.Item>
          ) : (
            <>
              {hasCnA ? (
                <>
                  <p className="account-fee-subhead">A 股</p>
                  <div className="portfolio-form-row">
                    <Form.Item
                      label="佣金（万）"
                      name="commissionWan"
                      rules={[{ required: true, message: '请输入股票佣金' }]}
                      extra="如 0.8 表示万 0.8"
                    >
                      <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
                    </Form.Item>
                    <Form.Item
                      label="最低佣金（元）"
                      name="commissionMinYuan"
                      rules={[{ required: !noCommissionMin, message: '请输入最低佣金' }]}
                    >
                      <InputNumber
                        className="full-width-input"
                        min={0}
                        precision={2}
                        disabled={noCommissionMin}
                        addonAfter="元/笔"
                      />
                    </Form.Item>
                  </div>
                  <Form.Item name="noCommissionMin" valuePropName="checked" className="account-fee-switch">
                    <Switch checkedChildren="无最低佣金" unCheckedChildren="有最低佣金" />
                  </Form.Item>
                  <EtfMarketFeeFields
                    market="SH"
                    wanField="etfShCommissionWan"
                    minField="etfShCommissionMinYuan"
                    noMinField="etfShNoCommissionMin"
                    noMin={etfShNoCommissionMin}
                  />
                  <EtfMarketFeeFields
                    market="SZ"
                    wanField="etfSzCommissionWan"
                    minField="etfSzCommissionMinYuan"
                    noMinField="etfSzNoCommissionMin"
                    noMin={etfSzNoCommissionMin}
                  />
                </>
              ) : null}

              {hasHk ? <HkFeeFields noMin={hkNoCommissionMin} /> : null}
              {hasUs ? <UsFeeFields mode={usCommissionMode} noMin={usNoCommissionMin} /> : null}

              <p className="account-fee-note">
                {hasCnA
                  ? 'A 股卖出收印花税 0.05%；ETF/LOF 卖出免印花税。沪 A 另收过户费 0.001%（系统固定）。'
                  : null}
                {hasOffshore
                  ? `${hasCnA ? ' ' : ''}港股卖出印花税约 0.13%；美股卖出含 SEC 规费。实际以券商账单为准。`
                  : hasCnA
                    ? ''
                    : '股票卖出收印花税 0.05%；ETF/LOF 卖出免印花税。沪 A 另收过户费 0.001%（系统固定）。'}
              </p>
            </>
          )}
        </section>

        {!editing ? (
          <Form.Item label="设为默认账户" name="isDefault" valuePropName="checked">
            <Switch />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
