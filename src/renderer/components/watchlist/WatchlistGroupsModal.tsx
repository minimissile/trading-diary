import { useState } from 'react';
import { Button, Input, Modal, Popconfirm, Space } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { WatchlistGroup } from '../../../shared/watchlist/personal';
import { useWatchlistAction } from './watchlist-utils';

export function WatchlistGroupsModal({ groups, onClose }: { groups: WatchlistGroup[]; onClose: () => void }): React.JSX.Element {
  const [editing, setEditing] = useState<string | undefined>();
  const [name, setName] = useState('');
  const { busy, run } = useWatchlistAction();
  const save = async () => {
    if (await run(() => window.desktop.watchlist.saveGroup({ id: editing, name }), editing ? '分组已重命名' : '分组已添加')) {
      setEditing(undefined);
      setName('');
    }
  };
  return (
    <Modal open title="管理分组" width={460} footer={null} onCancel={onClose}>
      <p className="dialog-intro">同一只股票可加入多个分组，跟踪日志保持一份。</p>
      <div className="watchlist-group-list">
        {groups.map((group) => (
          <div key={group.id}>
            <span>{group.name}</span>
            <Space>
              <Button
                className="ui-icon-button"
                aria-label={`重命名${group.name}`}
                icon={<EditOutlined />}
                disabled={busy}
                onClick={() => {
                  setEditing(group.id);
                  setName(group.name);
                }}
              />
              <Popconfirm
                title={`删除分组“${group.name}”？`}
                description="组内股票和跟踪日志会保留。"
                onConfirm={() => run(() => window.desktop.watchlist.removeGroup(group.id), '分组已删除')}
              >
                <Button className="ui-icon-button" aria-label={`删除${group.name}`} icon={<DeleteOutlined />} disabled={busy} />
              </Popconfirm>
            </Space>
          </div>
        ))}
      </div>
      <div className="watchlist-group-editor">
        <Input
          aria-label="分组名称"
          value={name}
          maxLength={30}
          placeholder={editing ? '修改分组名称' : '新建分组，如长期关注'}
          onChange={(event) => setName(event.target.value)}
          onPressEnter={() => {
            if (name.trim()) void save();
          }}
        />
        <Button type="primary" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
          {editing ? '保存' : '添加'}
        </Button>
        {editing ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setName('');
            }}
          >
            取消
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
