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
  commissionPpmToWan,
  DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
  DEFAULT_SECURITIES_COMMISSION_WAN,
} from '../../../shared/accounts/fee-utils';
import { BrokerSelect } from './BrokerSelect';

interface AccountFormValues {
  alias?: string;
  broker: AccountBroker;
  accountKind: AccountKind;
  commissionWan: number;
  commissionMinYuan: number;
  noCommissionMin: boolean;
  etfCommissionWan: number;
  etfCommissionMinYuan: number;
  etfNoCommissionMin: boolean;
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
  'commissionWan' | 'commissionMinYuan' | 'noCommissionMin' | 'etfCommissionWan' | 'etfCommissionMinYuan' | 'etfNoCommissionMin'
>;

function defaultSecuritiesFeeValues(): SecuritiesFeeFormValues {
  return {
    commissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    commissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    noCommissionMin: false,
    etfCommissionWan: DEFAULT_SECURITIES_COMMISSION_WAN,
    etfCommissionMinYuan: DEFAULT_SECURITIES_COMMISSION_MIN_YUAN,
    etfNoCommissionMin: false,
  };
}

function profileToFormValues(profile: FeeProfile | undefined, accountKind: AccountKind): SecuritiesFeeFormValues {
  if (!profile) {
    return accountKind === 'fund'
      ? {
          commissionWan: 0,
          commissionMinYuan: 0,
          noCommissionMin: true,
          etfCommissionWan: 0,
          etfCommissionMinYuan: 0,
          etfNoCommissionMin: true,
        }
      : defaultSecuritiesFeeValues();
  }

  const etfRatePpm = profile.etfCommissionRatePpm ?? profile.commissionRatePpm;
  const etfMinCents = profile.etfCommissionMinCents ?? profile.commissionMinCents;

  return {
    commissionWan: commissionPpmToWan(profile.commissionRatePpm),
    commissionMinYuan: profile.commissionMinCents / 100,
    noCommissionMin: profile.commissionMinCents === 0,
    etfCommissionWan: commissionPpmToWan(etfRatePpm),
    etfCommissionMinYuan: etfMinCents / 100,
    etfNoCommissionMin: etfMinCents === 0,
  };
}

function toCustomFee(values: AccountFormValues): AccountCustomFeeInput {
  const customFee: AccountCustomFeeInput = {
    commissionWan: Number(values.commissionWan) || 0,
    commissionMinYuan: values.noCommissionMin ? 0 : Number(values.commissionMinYuan) || 0,
    noCommissionMin: values.noCommissionMin,
  };

  if (values.accountKind === 'securities') {
    customFee.etfCommissionWan = Number(values.etfCommissionWan) || 0;
    customFee.etfCommissionMinYuan = values.etfNoCommissionMin ? 0 : Number(values.etfCommissionMinYuan) || 0;
    customFee.etfNoCommissionMin = values.etfNoCommissionMin;
  }

  return customFee;
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
  const etfNoCommissionMin = Form.useWatch('etfNoCommissionMin', form);

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
    form.setFieldsValue({
      accountKind: kind,
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
            <Form.Item label="券商 / 渠道" name="broker" rules={[{ required: true, message: '请选择券商' }]}>
              <BrokerSelect />
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
                : '股票与 ETF 分开设置佣金；ETF/LOF 卖出免印花税'}
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

              <p className="account-fee-subhead">ETF / LOF</p>
              <div className="portfolio-form-row">
                <Form.Item
                  label="佣金（万）"
                  name="etfCommissionWan"
                  rules={[{ required: true, message: '请输入 ETF 佣金' }]}
                  extra="场内 ETF / LOF 适用"
                >
                  <InputNumber className="full-width-input" min={0} max={30} step={0.01} precision={4} addonBefore="万" />
                </Form.Item>
                <Form.Item
                  label="最低佣金（元）"
                  name="etfCommissionMinYuan"
                  rules={[{ required: !etfNoCommissionMin, message: '请输入 ETF 最低佣金' }]}
                >
                  <InputNumber
                    className="full-width-input"
                    min={0}
                    precision={2}
                    disabled={etfNoCommissionMin}
                    addonAfter="元/笔"
                  />
                </Form.Item>
              </div>
              <Form.Item name="etfNoCommissionMin" valuePropName="checked" className="account-fee-switch">
                <Switch checkedChildren="无最低佣金" unCheckedChildren="有最低佣金" />
              </Form.Item>

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
