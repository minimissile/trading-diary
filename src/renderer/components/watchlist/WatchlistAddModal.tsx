import { useState } from 'react';
import { Alert, App, Button, Form, Modal, Select, Space, Switch } from 'antd';
import type { MarketSearchHit } from '../../../shared/market/types';
import type { PersonalWatchlistItem, WatchlistGroup } from '../../../shared/watchlist/personal';
import { marketLookupKey } from '../../../shared/market/instrument-id';
import { labelForVenue } from '../../../shared/market/venues';
import { SymbolSearchInput } from '../trading/SymbolSearchInput';
import { useWatchlistAction } from './watchlist-utils';

interface Values {
  symbol: string;
  groupIds: string[];
  tags: string[];
  starred: boolean;
}
export function WatchlistAddModal({
  groups,
  seed,
  onClose,
  onSaved,
}: {
  groups: WatchlistGroup[];
  seed: string;
  onClose: () => void;
  onSaved: (item: PersonalWatchlistItem, existing: boolean) => void;
}): React.JSX.Element {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { busy, run } = useWatchlistAction();
  const [hit, setHit] = useState<MarketSearchHit | null>(null);
  const [scope, setScope] = useState('CN_A');

  return (
    <Modal open title="添加自选" width={520} onCancel={onClose} footer={null} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ symbol: seed, groupIds: [], tags: [], starred: false }}
        onFinish={(values) =>
          void run(async () => {
            const result = await window.desktop.watchlist.add({ ...values, symbol: hit ? marketLookupKey(hit) : values.symbol });
            void message.success(result.alreadyExists ? '已在自选中，可直接调整分组或添加日志' : '已加入我的自选');
            onSaved(result.item, result.alreadyExists);
          })
        }
      >
        <Form.Item label="搜索市场">
          <Select
            value={scope}
            onChange={(value) => {
              setScope(value);
              setHit(null);
              form.setFieldValue('symbol', '');
            }}
            options={[
              { value: 'CN_A', label: 'A 股 / 场内基金' },
              { value: 'HK', label: '港股' },
              { value: 'US', label: '美股' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="股票名称或代码"
          name="symbol"
          rules={[{ required: true, whitespace: true, message: '请选择或输入股票代码' }]}
        >
          <SymbolSearchInput
            marketScopes={[scope]}
            assetKind="stock"
            resolveOnBlur={false}
            placeholder="输入名称或代码搜索"
            onChange={() => setHit(null)}
            onHitSelect={setHit}
          />
        </Form.Item>
        {hit ? (
          <p className="dialog-intro">
            {hit.name} · {labelForVenue(hit.venue)} · {hit.quoteCurrency}
          </p>
        ) : null}
        <Form.Item label="所属分组" name="groupIds">
          <Select
            mode="multiple"
            allowClear
            placeholder="可以稍后分组"
            options={groups.map((group) => ({ label: group.name, value: group.id }))}
          />
        </Form.Item>
        <Form.Item label="标签" name="tags">
          <Select mode="tags" maxCount={20} tokenSeparators={['，', ',']} placeholder="如：行业龙头、等待财报" />
        </Form.Item>
        <Form.Item label="重点关注" name="starred" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Alert type="info" title="加入后可设置提醒价格，并按日期记录复盘与盘感。" showIcon />
        <div className="watchlist-modal-footer">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              加入自选
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
