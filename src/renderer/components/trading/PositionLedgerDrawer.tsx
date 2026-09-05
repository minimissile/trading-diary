import { useCallback, useEffect, useState } from 'react';
import { App, Button, Drawer, Dropdown, Empty, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { PortfolioLedgerEntry, PortfolioPositionView } from '../../../shared/portfolio/types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../../shared/accounts/account-display';
import { formatTradeDate, ValueDisplay } from '../../lib/trading-format';
import { confirmDanger } from '../../lib/confirm-dialog';
import { deletePortfolioPosition } from '../../lib/portfolio-actions';
import { PortfolioLedgerModal } from './PortfolioLedgerModal';

interface PositionLedgerDrawerProps {
  open: boolean;
  position: PortfolioPositionView | null;
  accountId?: string;
  onClose: () => void;
  onChanged: () => void;
}

const sideLabels = {
  buy: '买入',
  sell: '卖出',
  dividend_reinvest: '分红再投',
} as const;

/**
 * 展示某标的的持仓流水，并支持编辑与删除。
 */
export function PositionLedgerDrawer(props: PositionLedgerDrawerProps): React.JSX.Element {
  return props.open ? <PositionLedgerDrawerContent key={props.position?.symbol + ':' + props.accountId} {...props} /> : <></>;
}

function PositionLedgerDrawerContent({
  open,
  position,
  accountId,
  onClose,
  onChanged,
}: PositionLedgerDrawerProps): React.JSX.Element {
  const { message, modal } = App.useApp();
  const [entries, setEntries] = useState<PortfolioLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PortfolioLedgerEntry | null>(null);
  const [accountLabels, setAccountLabels] = useState<Map<string, string>>(new Map());

  const load = useCallback(async (): Promise<void> => {
    if (!position) return;
    setLoading(true);
    try {
      const resolvedAccountId = isAllAccountsId(accountId) ? ALL_ACCOUNTS_ID : accountId;
      const [nextEntries, accounts] = await Promise.all([
        window.desktop.portfolio.listLedgerEntries(resolvedAccountId, position.symbol),
        window.desktop.accounts.list(),
      ]);
      setEntries(nextEntries);
      setAccountLabels(new Map(accounts.map((item) => [item.id, formatAccountSelectLabel(item)])));
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '流水读取失败');
    } finally {
      setLoading(false);
    }
  }, [accountId, message, position]);

  useEffect(() => {
    if (!open || !position) return;
    // Start the external IPC request and expose its pending state in the same lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, open, position]);

  const deleteEntry = async (entry: PortfolioLedgerEntry): Promise<void> => {
    setDeletingId(entry.id);
    try {
      await window.desktop.portfolio.deleteLedgerEntry(entry.id);
      void message.success('流水已删除');
      onChanged();
      await load();
      if (entries.length <= 1) {
        onClose();
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAll = async (): Promise<void> => {
    if (!position) return;
    setDeletingAll(true);
    try {
      const resolvedAccountId = isAllAccountsId(accountId) ? ALL_ACCOUNTS_ID : accountId;
      await deletePortfolioPosition(resolvedAccountId, position.symbol);
      void message.success('持仓已删除');
      onChanged();
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setDeletingAll(false);
    }
  };

  const columns: ColumnsType<PortfolioLedgerEntry> = [
    ...(isAllAccountsId(accountId)
      ? [
          {
            title: '账户',
            dataIndex: 'accountId',
            width: 120,
            render: (id: string) => accountLabels.get(id) ?? id,
          } as const,
        ]
      : []),
    {
      title: '方向',
      dataIndex: 'side',
      width: 72,
      render: (side: PortfolioLedgerEntry['side']) => (
        <Tag color={side === 'buy' ? 'green' : side === 'sell' ? 'orange' : 'blue'}>{sideLabels[side]}</Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 96,
      align: 'right',
      render: (value: number) => <ValueDisplay kind="quantity" value={value} />,
    },
    {
      title: '价格',
      dataIndex: 'price',
      width: 88,
      align: 'right',
      render: (value: number) => <ValueDisplay kind="price" value={value} />,
    },
    {
      title: '手续费',
      dataIndex: 'fees',
      width: 88,
      align: 'right',
      render: (value: number) => <ValueDisplay kind="currency" value={value} />,
    },
    {
      title: '成交时间',
      dataIndex: 'tradeAt',
      width: 120,
      render: (value: string) => formatTradeDate(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 64,
      fixed: 'right',
      align: 'center',
      render: (_, row) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'edit',
                label: '编辑',
                icon: <EditOutlined />,
                onClick: () => setEditingEntry(row),
              },
              {
                key: 'delete',
                label: '删除',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                  confirmDanger(modal.confirm, {
                    title: '删除此条流水？',
                    content: '删除后持仓数量与成本将重新计算，且不可恢复。',
                    okText: '删除',
                    onOk: () => deleteEntry(row),
                  });
                },
              },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} loading={deletingId === row.id} aria-label="操作菜单" />
        </Dropdown>
      ),
    },
  ];

  const deleteAllDescription = isAllAccountsId(accountId)
    ? `将删除所有账户中 ${position?.symbol ?? ''} 的全部流水，持仓记录一并清除。`
    : `将删除当前账户中 ${position?.symbol ?? ''} 的全部流水，持仓记录一并清除。`;

  return (
    <>
      <Drawer
        title={position ? `${position.name} · 持仓流水` : '持仓流水'}
        open={open}
        width={760}
        onClose={onClose}
        destroyOnHidden
        extra={
          position && entries.length > 0 ? (
            <Button
              danger
              loading={deletingAll}
              onClick={() => {
                confirmDanger(modal.confirm, {
                  title: '删除整个持仓？',
                  content: deleteAllDescription,
                  okText: '删除',
                  onOk: () => deleteAll(),
                });
              }}
            >
              删除持仓
            </Button>
          ) : null
        }
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : entries.length === 0 ? (
          <Empty description="暂无流水记录" />
        ) : (
          <Table<PortfolioLedgerEntry>
            className="watchlist-table"
            columns={columns}
            dataSource={entries}
            pagination={false}
            rowKey="id"
            size="small"
            scroll={{ x: isAllAccountsId(accountId) ? 720 : 600 }}
          />
        )}
      </Drawer>

      <PortfolioLedgerModal
        open={editingEntry !== null}
        editingEntry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={() => {
          setEditingEntry(null);
          onChanged();
          void load();
        }}
      />
    </>
  );
}
