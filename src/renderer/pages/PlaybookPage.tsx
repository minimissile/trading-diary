import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Segmented, Select, Skeleton, Tag } from 'antd';
import type {
  CreatePlaybookRuleInput,
  PlaybookCheckTiming,
  PlaybookRule,
  PlaybookRuleCategory,
} from '../../shared/playbook/types';
import { formatDateTime, playbookCategoryLabels, playbookCheckTimingLabels } from '../lib/trading-format';
import { invalidatePlaybook, invalidateWorkspaceData, usePlaybookQuery } from '../lib/queries';
import { withConfirmDefaults } from '../lib/confirm-dialog';

type RuleFilter = 'active' | 'archived';

interface RuleFormValues {
  content: string;
  category: PlaybookRuleCategory;
  symbol?: string;
  checkTiming: PlaybookCheckTiming;
}

export function PlaybookPage(): React.JSX.Element {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<RuleFormValues>();
  const { rules, isLoading: loading, refetch } = usePlaybookQuery();
  const [filter, setFilter] = useState<RuleFilter>('active');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlaybookRuleCategory | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PlaybookRule | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleRules = useMemo(
    () =>
      rules.filter(
        (rule) =>
          rule.status === filter &&
          (category === 'all' || rule.category === category) &&
          `${rule.content} ${rule.symbol ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [filter, rules, category, query],
  );

  const openCreate = (): void => {
    setEditingRule(null);
    form.setFieldsValue({
      content: '',
      category: 'process',
      checkTiming: 'plan_activation',
    });
    setDialogOpen(true);
  };

  const openEdit = (rule: PlaybookRule): void => {
    setEditingRule(rule);
    form.setFieldsValue({
      content: rule.content,
      category: rule.category,
      symbol: rule.symbol ?? undefined,
      checkTiming: rule.checkTiming,
    });
    setDialogOpen(true);
  };

  const saveRule = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input: CreatePlaybookRuleInput = {
        content: values.content,
        category: values.category,
        symbol: values.symbol?.trim().toUpperCase() || null,
        checkTiming: values.checkTiming,
      };
      if (editingRule) {
        await window.desktop.playbook.update(editingRule.id, input);
        void message.success('规则已更新');
      } else {
        await window.desktop.playbook.create(input);
        void message.success('规则已创建');
      }
      setDialogOpen(false);
      await invalidatePlaybook();
      await refetch();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const archiveRule = async (id: string): Promise<void> => {
    try {
      await window.desktop.playbook.archive(id);
      await invalidateWorkspaceData();
      await refetch();
      void message.success('规则已归档');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '归档失败');
    }
  };

  return (
    <main className="workspace-page playbook-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PLAYBOOK</p>
          <h1>规则库</h1>
          <p className="page-intro">把复盘教训沉淀为可复用规则，激活计划前自动检查。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建规则
        </Button>
      </header>

      <section className="library-intro">
        <h2>执行前检查，复盘后更新</h2>
        <p>规则按适用标的和检查时机使用，保留具体、可执行的约束。</p>
      </section>
      <div className="library-toolbar">
        <Segmented<RuleFilter>
          options={[
            { label: `生效中 ${rules.filter((rule) => rule.status === 'active').length}`, value: 'active' },
            { label: `已归档 ${rules.filter((rule) => rule.status === 'archived').length}`, value: 'archived' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="library-search-controls">
          <Select
            aria-label="规则分类"
            value={category}
            onChange={setCategory}
            options={[
              { label: '全部分类', value: 'all' },
              ...Object.entries(playbookCategoryLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Input
            prefix={<SearchOutlined />}
            allowClear
            placeholder="搜索规则或标的"
            aria-label="搜索规则"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : visibleRules.length === 0 ? (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              query.trim() || category !== 'all' ? '未找到匹配规则' : filter === 'archived' ? '暂无归档规则' : '还没有生效规则'
            }
          >
            <Button type="primary" onClick={openCreate}>
              手动添加规则
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="playbook-rule-list">
          {visibleRules.map((rule) => (
            <article className="playbook-rule-card" key={rule.id}>
              <div className="playbook-rule-card-header">
                <Tag>{playbookCategoryLabels[rule.category]}</Tag>
                {rule.symbol ? <span className="symbol-label">{rule.symbol}</span> : <span className="symbol-label">全市场</span>}
                <small>{playbookCheckTimingLabels[rule.checkTiming]}</small>
              </div>
              <p>{rule.content}</p>
              <footer>
                <span>{formatDateTime(rule.updatedAt)} 更新</span>
                {rule.status === 'active' ? (
                  <div className="playbook-rule-card-actions">
                    <Button onClick={() => openEdit(rule)}>编辑</Button>
                    <Button
                      onClick={() => {
                        modal.confirm(
                          withConfirmDefaults({
                            title: '归档这条规则？',
                            okText: '归档',
                            cancelText: '取消',
                            onOk: () => archiveRule(rule.id),
                          }),
                        );
                      }}
                    >
                      归档
                    </Button>
                  </div>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}

      <Modal
        destroyOnHidden
        open={dialogOpen}
        title={editingRule ? '编辑规则' : '新建规则'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onCancel={() => setDialogOpen(false)}
        onOk={() => void saveRule()}
      >
        <Form<RuleFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item label="规则内容" name="content" rules={[{ required: true, message: '请填写规则内容' }]}>
            <Input.TextArea rows={4} maxLength={2000} showCount placeholder="例如：突破前高必须放量，否则放弃追价" />
          </Form.Item>
          <div className="form-grid form-grid--2">
            <Form.Item label="分类" name="category" rules={[{ required: true }]}>
              <Select
                options={(Object.keys(playbookCategoryLabels) as PlaybookRuleCategory[]).map((key) => ({
                  label: playbookCategoryLabels[key],
                  value: key,
                }))}
              />
            </Form.Item>
            <Form.Item label="检查时机" name="checkTiming" rules={[{ required: true }]}>
              <Select
                options={(Object.keys(playbookCheckTimingLabels) as PlaybookCheckTiming[]).map((key) => ({
                  label: playbookCheckTimingLabels[key],
                  value: key,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item label="适用标的（可选）" name="symbol">
            <Input maxLength={32} placeholder="留空表示适用于所有标的" />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
