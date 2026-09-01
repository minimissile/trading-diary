import { useState } from 'react';
import { App, Button, Empty, Skeleton, Switch, Tag } from 'antd';
import type {
  CreateTradingAccountInput,
  UpdateTradingAccountInput,
} from '../../shared/api.types';
import { getBrokerLabel } from '../../shared/accounts/brokers';
import { getAccountAlias } from '../../shared/accounts/account-display';
import { ValueDisplay } from '../lib/trading-format';
import { confirmDanger, withConfirmDefaults } from '../lib/confirm-dialog';
import { AccountFormModal } from '../components/trading/AccountFormModal';
import { BrokerAvatar } from '../components/trading/BrokerAvatar';
import { invalidateAccounts, useAccountsPageQuery } from '../lib/queries';

import { EditOutlined, DeleteOutlined, PlusOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import type { TradingAccountSummary } from '../../shared/api.types';

const kindLabels = {
  securities: '股票账户',
  fund: '基金账户',
} as const;

export function AccountsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [showArchived, setShowArchived] = useState(false);
  const { accounts, feeProfiles, isLoading: loading, refetch } = useAccountsPageQuery(showArchived);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TradingAccountSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (
    payload: CreateTradingAccountInput | { id: string; input: UpdateTradingAccountInput },
  ): Promise<void> => {
    setSaving(true);
    try {
      if ('id' in payload) {
        await window.desktop.accounts.update(payload.id, payload.input);
        void message.success('账户已更新');
      } else {
        await window.desktop.accounts.create(payload);
        void message.success('账户已创建');
      }
      setModalOpen(false);
      setEditing(null);
      await invalidateAccounts();
      await refetch();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="workspace-page accounts-page">
      <header className="page-header accounts-page-header">
        <div>
          <p className="page-kicker">ACCOUNTS</p>
          <h1>账户管理</h1>
          <p className="page-intro">按账户归类持仓资产，跟踪市值与成本，不管理现金余额。</p>
        </div>
        <div className="accounts-toolbar">
          <label className="accounts-toolbar-filter">
            <span>显示已归档</span>
            <Switch checked={showArchived} onChange={setShowArchived} />
          </label>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新建账户
          </Button>
        </div>
      </header>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : accounts.length === 0 ? (
        <Empty description="还没有账户，创建第一个交易账户">
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新建账户
          </Button>
        </Empty>
      ) : (
        <section className="accounts-grid">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={() => {
                setEditing(account);
                setModalOpen(true);
              }}
              onSetDefault={async () => {
                await window.desktop.accounts.setDefault(account.id);
                void message.success('已设为默认账户');
                await invalidateAccounts();
                await refetch();
              }}
              onArchive={async () => {
                await window.desktop.accounts.archive(account.id);
                void message.success('账户已归档');
                await invalidateAccounts();
                await refetch();
              }}
              onDelete={async () => {
                await window.desktop.accounts.delete(account.id);
                void message.success('账户已删除');
                await invalidateAccounts();
                await refetch();
              }}
            />
          ))}
        </section>
      )}

      <AccountFormModal
        open={modalOpen}
        editing={editing}
        feeProfiles={feeProfiles}
        saving={saving}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={(payload) => void handleSubmit(payload)}
      />
    </main>
  );
}

interface AccountCardProps {
  account: TradingAccountSummary;
  onEdit: () => void;
  onSetDefault: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function AccountCard({ account, onEdit, onSetDefault, onArchive, onDelete }: AccountCardProps): React.JSX.Element {
  const { modal } = App.useApp();
  const alias = getAccountAlias(account);
  const brokerLabel = getBrokerLabel(account.broker);

  return (
    <article className={`account-card${account.isArchived ? ' account-card--archived' : ''}`}>
      <header className="account-card-head">
        <div className="account-card-title">
          <div className="account-card-name-row">
            <BrokerAvatar brokerId={account.broker} className="account-card-broker-icon" />
            <div>
              <div className="account-card-name-line">
                <h2>{brokerLabel}</h2>
                {account.isDefault ? <Tag color="blue">默认</Tag> : null}
                {account.isArchived ? <Tag>已归档</Tag> : null}
              </div>
              <p>
                {alias ? `${alias} · ` : ''}
                {kindLabels[account.accountKind]}
              </p>
            </div>
          </div>
        </div>
        {!account.isArchived ? (
          <div className="account-card-actions">
            {account.isDefault ? <StarFilled className="account-card-default-icon" aria-label="默认账户" /> : null}
            <Button type="text" icon={<EditOutlined />} onClick={onEdit}>
              编辑
            </Button>
            {!account.isDefault ? (
              <Button type="text" icon={<StarOutlined />} onClick={onSetDefault}>
                设为默认
              </Button>
            ) : null}
            {!account.isDefault ? (
              <Button
                type="text"
                danger
                onClick={() => {
                  modal.confirm(
                    withConfirmDefaults({
                      title: '归档此账户？',
                      content: '归档后不再出现在下拉列表，流水数据保留。',
                      okText: '归档',
                      onOk: onArchive,
                    }),
                  );
                }}
              >
                归档
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="account-card-actions">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                confirmDanger(modal.confirm, {
                  title: '永久删除此账户？',
                  content: `将删除 ${account.ledgerCount} 条流水与 ${account.positionCount} 个持仓标的的相关数据，且不可恢复。`,
                  okText: '删除',
                  onOk: onDelete,
                });
              }}
            >
              删除
            </Button>
          </div>
        )}
      </header>

      <dl className="account-card-meta">
        <div className="account-card-meta-item account-card-meta-item--highlight">
          <dt>持仓市值</dt>
          <dd><ValueDisplay kind="currency" value={account.totalMarketValue} /></dd>
        </div>
        <div className="account-card-meta-item">
          <dt>持仓成本</dt>
          <dd><ValueDisplay kind="currency" value={account.totalCost} /></dd>
        </div>
        <div className="account-card-meta-item">
          <dt>浮动盈亏</dt>
          <dd>
            <ValueDisplay kind="pnl" value={account.unrealizedPnl} />
          </dd>
        </div>
        <div className="account-card-meta-item">
          <dt>持仓标的</dt>
          <dd>{account.positionCount}</dd>
        </div>
      </dl>
    </article>
  );
}
