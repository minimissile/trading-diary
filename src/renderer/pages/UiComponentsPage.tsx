import { useState } from 'react';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popover,
  Progress,
  Radio,
  Segmented,
  Select,
  Skeleton,
  Slider,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { AnimatedValueDisplay } from '../components/trading/AnimatedValueDisplay';

/** Development-only specimen of actual shared components, without account or market dependencies. */
export function UiComponentsPage(): React.JSX.Element {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [progress, setProgress] = useState(32);
  const { message } = App.useApp();
  return (
    <main className="ui-specimen">
      <h1>公共组件样板</h1>
      <p className="ui-specimen-intro">青碧主色 · 暖金次色 · 细边框 · 紧凑间距</p>
      <div className="ui-specimen-grid">
        <section className="ui-panel">
          <h2>按钮与操作</h2>
          <div className="ui-specimen-row">
            <Button type="primary" icon={<PlusOutlined />}>
              新建计划
            </Button>
            <Button className="ui-button-secondary">记录成交</Button>
            <Button>默认操作</Button>
            <Button danger>删除</Button>
            <Tooltip title="更多操作">
              <Button className="ui-icon-button" icon={<MoreOutlined />} aria-label="更多操作" />
            </Tooltip>
          </div>
          <div className="ui-specimen-row">
            <Button disabled>不可用</Button>
            <Button type="primary" loading>
              加载中
            </Button>
            <Button type="text">文字操作</Button>
            <Button type="link">查看详情</Button>
            <Button size="small">小尺寸</Button>
          </div>
        </section>
        <section className="ui-panel">
          <h2>标签与选择</h2>
          <div className="ui-specimen-row">
            <Tag color="success">已确认</Tag>
            <Tag color="warning">待确认</Tag>
            <Tag color="processing">处理中</Tag>
            <Tag color="error">已驳回</Tag>
            <Tag color="purple">现金分红</Tag>
            <Tag closable>可关闭</Tag>
          </div>
          <div className="ui-specimen-row">
            <Checkbox defaultChecked>开启提醒</Checkbox>
            <Switch defaultChecked aria-label="启用功能" />
            <Radio.Group
              defaultValue="a"
              options={[
                { label: '全部账户', value: 'a' },
                { label: '当前账户', value: 'b' },
              ]}
            />
          </div>
        </section>
        <section className="ui-panel">
          <h2>表单与状态</h2>
          <Form layout="vertical">
            <Form.Item label="计划名称">
              <Input placeholder="输入计划名称" />
            </Form.Item>
            <div className="ui-specimen-row">
              <InputNumber aria-label="目标金额" prefix="¥" defaultValue={10000} />
              <DatePicker placeholder="选择日期" />
            </div>
            <Form.Item label="交易账户">
              <Select
                aria-label="交易账户"
                defaultValue="all"
                options={[
                  { value: 'all', label: '全部账户汇总' },
                  { value: 'main', label: '主要账户' },
                ]}
              />
            </Form.Item>
            <div className="ui-specimen-row">
              <Input status="error" aria-label="错误输入" placeholder="请填写金额" />
              <Input disabled placeholder="不可编辑" />
            </div>
          </Form>
        </section>
        <section className="ui-panel">
          <h2>导航与动态数值</h2>
          <Segmented options={['总览', '分红日历', '分红明细']} />
          <Tabs
            items={[
              { key: 'one', label: '账户详情', children: '次级导航使用清晰的文字高亮与指示线。' },
              { key: 'two', label: '历史记录', children: '暂无历史记录' },
            ]}
          />
          <p>
            <AnimatedValueDisplay kind="currency" value={progress * 100.25} /> / ¥10,025
          </p>
          <Progress percent={progress} />
          <Slider aria-label="演示进度" value={progress} onChange={setProgress} />
        </section>
        <section className="ui-panel ui-specimen-wide">
          <h2>表格</h2>
          <Table
            pagination={false}
            rowKey="id"
            size="middle"
            dataSource={[
              { id: 1, name: '红利基金', status: '已确认' },
              { id: 2, name: '银行股分红', status: '待确认' },
            ]}
            columns={[
              { title: '标的', dataIndex: 'name' },
              { title: '金额', render: () => '¥292.91', align: 'right' },
              { title: '状态', render: (_, row) => <Tag color={row.id === 1 ? 'success' : 'warning'}>{row.status}</Tag> },
              {
                title: '操作',
                align: 'right',
                render: () => (
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'detail', label: '查看详情' },
                        { key: 'remove', label: '删除记录', danger: true },
                      ],
                    }}
                    trigger={['click']}
                  >
                    <Button className="ui-icon-button" icon={<MoreOutlined />} aria-label="表格操作" />
                  </Dropdown>
                ),
              },
            ]}
          />
        </section>
        <section className="ui-panel">
          <h2>反馈与浮层</h2>
          <div className="ui-specimen-row">
            <Button onClick={() => setModal(true)}>打开弹窗</Button>
            <Button onClick={() => setDrawer(true)}>打开抽屉</Button>
            <Button onClick={() => void message.success('保存成功')}>保存反馈</Button>
            <Popover content="使用页面默认配色" title="工作台背景">
              <Button>浮层说明</Button>
            </Popover>
          </div>
          <Alert type="info" showIcon title="累计分红仅包含已确认记录" />
          <Alert type="warning" showIcon title="还有一条记录待确认" style={{ marginTop: 12 }} />
        </section>
        <section className="ui-panel">
          <h2>空白与加载</h2>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分红记录" />
          <Skeleton active paragraph={{ rows: 1 }} />
        </section>
      </div>
      <Modal title="设置分红目标" open={modal} onCancel={() => setModal(false)} onOk={() => setModal(false)}>
        <Form layout="vertical">
          <Form.Item label="累计分红目标">
            <InputNumber prefix="¥" defaultValue={10000} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer title="账户详情" open={drawer} onClose={() => setDrawer(false)}>
        <p>主要账户</p>
        <Tag color="success">使用中</Tag>
      </Drawer>
    </main>
  );
}
