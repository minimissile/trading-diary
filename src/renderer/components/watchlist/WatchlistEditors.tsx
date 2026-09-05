import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  PersonalWatchlistItem,
  TrackingLog,
  WatchlistGroup,
  WatchlistItemChanges,
  WatchlistReminder,
} from '../../../shared/watchlist/personal';
import { invalidateAlerts } from '../../lib/queries/invalidate';
import { useWatchlistAction } from './watchlist-utils';

export function TrackingLogEditor({
  itemId,
  log,
  onClose,
}: {
  itemId: string;
  log?: TrackingLog;
  onClose: () => void;
}): React.JSX.Element {
  const { busy, run } = useWatchlistAction();
  return (
    <Modal open title={log ? '编辑跟踪日志' : '写跟踪日志'} width={640} footer={null} onCancel={onClose}>
      <Form<{ date: Dayjs; review: string; feeling: string }>
        layout="vertical"
        initialValues={{ date: log ? dayjs(log.date) : dayjs(), review: log?.review ?? '', feeling: log?.feeling ?? '' }}
        onFinish={async (values) => {
          if (
            await run(
              () =>
                window.desktop.watchlist.saveLog({
                  id: log?.id,
                  itemId,
                  date: values.date.format('YYYY-MM-DD'),
                  review: values.review,
                  feeling: values.feeling,
                }),
              '跟踪日志已保存',
            )
          )
            onClose();
        }}
      >
        <Form.Item name="date" label="记录日期" rules={[{ required: true, message: '请选择记录日期' }]}>
          <DatePicker allowClear={false} />
        </Form.Item>
        <Form.Item
          name="review"
          label="复盘记录"
          dependencies={['feeling']}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, value: string) =>
                value?.trim() || (getFieldValue('feeling') as string)?.trim()
                  ? Promise.resolve()
                  : Promise.reject(new Error('请至少填写复盘记录或盘感记录')),
            }),
          ]}
        >
          <Input.TextArea
            rows={6}
            maxLength={10000}
            showCount
            placeholder="今天观察到了什么？走势、成交量或基本面有何变化？原来的判断是否得到验证？"
          />
        </Form.Item>
        <Form.Item name="feeling" label="盘感记录">
          <Input.TextArea
            rows={4}
            maxLength={10000}
            showCount
            placeholder="记录强弱感受、情绪变化、犹豫或冲动，以及接下来想验证的判断。"
          />
        </Form.Item>
        <div className="watchlist-modal-footer">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存日志
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}

export function WatchlistSettingsEditor({
  item,
  groups,
  onClose,
}: {
  item: PersonalWatchlistItem;
  groups: WatchlistGroup[];
  onClose: () => void;
}): React.JSX.Element {
  const { busy, run } = useWatchlistAction();
  return (
    <Modal open title={`管理自选 · ${item.name}`} width={560} footer={null} onCancel={onClose}>
      <Form<WatchlistItemChanges>
        layout="vertical"
        initialValues={item}
        onFinish={async (changes) => {
          if (await run(() => window.desktop.watchlist.update(item.id, changes), '自选设置已保存')) onClose();
        }}
      >
        <Form.Item label="重点关注" name="starred" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="所属分组" name="groupIds">
          <Select
            mode="multiple"
            allowClear
            placeholder="选择分组"
            options={groups.map((group) => ({ label: group.name, value: group.id }))}
          />
        </Form.Item>
        <Form.Item label="标签" name="tags">
          <Select mode="tags" maxCount={20} tokenSeparators={['，', ',']} placeholder="输入标签后回车" />
        </Form.Item>
        <Form.Item label="正在等什么" name="waitingFor">
          <Input.TextArea rows={3} maxLength={2000} placeholder="如：等待财报验证、观察回调后的承接力度" />
        </Form.Item>
        <Form.Item label="什么情况不再看好" name="invalidation">
          <Input.TextArea rows={3} maxLength={2000} placeholder="记录观察逻辑的失效条件" />
        </Form.Item>
        <div className="watchlist-modal-footer">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存设置
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}

export function WatchlistReminderEditor({
  item,
  onClose,
}: {
  item: PersonalWatchlistItem;
  onClose: () => void;
}): React.JSX.Element {
  const { busy, run } = useWatchlistAction();
  return (
    <Modal open title={`提醒价格 · ${item.name}`} width={440} footer={null} onCancel={onClose}>
      <Form<Pick<WatchlistReminder, 'condition' | 'targetPrice'>>
        layout="vertical"
        initialValues={{ condition: item.reminder?.condition ?? 'at_or_below', targetPrice: item.reminder?.targetPrice }}
        onFinish={async (reminder) => {
          if (
            await run(async () => {
              await window.desktop.watchlist.setReminder({ id: item.id, reminder });
              await invalidateAlerts();
            }, '提醒价格已保存')
          )
            onClose();
        }}
      >
        <Form.Item label="触发条件" name="condition">
          <Select
            options={[
              { value: 'at_or_below', label: '价格小于或等于' },
              { value: 'at_or_above', label: '价格大于或等于' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={`提醒价格（${item.quoteCurrency}）`}
          name="targetPrice"
          rules={[{ required: true, message: '请输入提醒价格' }]}
        >
          <InputNumber min={0.0001} max={1_000_000_000} precision={4} className="watchlist-full-width" />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          title="保存后交由提醒中心监控"
          description="应用运行时按现有监控设置检查价格；触发后可重新设置提醒。"
        />
        <div className="watchlist-modal-footer">
          <Space>
            {item.reminder ? (
              <Button
                danger
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(async () => {
                      await window.desktop.watchlist.setReminder({ id: item.id, reminder: null });
                      await invalidateAlerts();
                    }, '提醒价格已清除')
                  )
                    onClose();
                }}
              >
                清除提醒
              </Button>
            ) : null}
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存提醒
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
