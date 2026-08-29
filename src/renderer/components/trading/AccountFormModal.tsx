import { useEffect } from 'react';
import { Form, Input, InputNumber, Modal, Radio, Switch } from 'antd';
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
  DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
  DEFAULT_SECURITIES_COMMISSION_WAN,
  resolveEtfMarketFormRates,
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
  commissionWan: number;
  commissionMinYuan: number;
  noCommissionMin: boolean;
  etfShCommissionWan: number;
  etfShCommissionMinYuan: number;
  etfShNoCommissionMin: boolean;
  etfSzCommissionWan: number;
  etfSzCommissionMinYuan: number;
  etfSzNoCommissionMin: boolean;
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
>;

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

function defaultSecuritiesFeeValues(): SecuritiesFeeFormValues {
  return {
    commissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    commissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    noCommissionMin: false,
    ...defaultEtfMarketFeeValues(),
  };
}

function profileToFormValues(profile: FeeProfile | undefined, accountKind: AccountKind): SecuritiesFeeFormValues {
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
        }
      : defaultSecuritiesFeeValues();
  }

  const sh = resolveEtfMarketFormRates(profile, 'SH');
  const sz = resolveEtfMarketFormRates(profile, 'SZ');

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
  };
}

function toCustomFee(values: AccountFormValues): AccountCustomFeeInput {
  const customFee: AccountCustomFeeInput = {
    commissionWan: Number(values.commissionWan) || 0,
    commissionMinYuan: values.noCommissionMin ? 0 : Number(values.commissionMinYuan) || 0,
    noCommissionMin: values.noCommissionMin,
  };

  if (values.accountKind === 'securities') {
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
  const noCommissionMin = Form.useWatch('noCommissionMin', form);
  const etfShNoCommissionMin = Form.useWatch('etfShNoCommissionMin', form);
  const etfSzNoCommissionMin = Form.useWatch('etfSzNoCommissionMin', form);

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
        ...profileToFormValues(profile, editing.accountKind),
      });
      return;
    }

    form.setFieldsValue({
      broker: 'huatai',
      accountKind: 'securities',
      isDefault: false,
      ...defaultSecuritiesFeeValues(),
    });
  }, [editing, feeProfiles, form, open]);

  const handleKindChange = (kind: AccountKind): void => {
    const profile = editing ? feeProfiles.find((item) => item.id === editing.feeProfileId) : undefined;
    const currentBroker = form.getFieldValue('broker') as AccountBroker | undefined;
    const nextBroker =
      currentBroker && isBrokerAllowedForAccountKind(currentBroker, kind)
        ? currentBroker
        : defaultBrokerForAccountKind(kind);
    form.setFieldsValue({
      accountKind: kind,
      broker: nextBroker,
      ...profileToFormValues(kind === editing?.accountKind ? profile : undefined, kind),
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
          customFee,
        },
      });
      return;
    }
    onSubmit({
      alias: alias || undefined,
      broker: values.broker,
      accountKind: values.accountKind,
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
              <BrokerSelect accountKind={accountKind} />
            </Form.Item>
            <Form.Item label="别名" name="alias">
              <Input maxLength={80} placeholder="如 主账户、打新户" />
            </Form.Item>
          </div>
          <p className="form-field-hint">可选；同一券商开多个账户时用于区分，留空则仅显示券商名</p>
        </div>

        <section className="account-fee-panel">
          <header className="account-fee-panel-head">
            <strong>{accountKind === 'fund' ? '基金费率' : '股票 / ETF 费率'}</strong>
            <span>
              {accountKind === 'fund'
                ? '场外基金按申购佣金估算，无印花税与过户费'
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
              <p className="account-fee-subhead">股票</p>
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

              <p className="account-fee-note">
                股票卖出收印花税 0.05%；ETF/LOF 卖出免印花税。沪 A 另收过户费 0.001%（系统固定）。
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
