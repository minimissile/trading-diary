import { Alert, Button, Empty } from 'antd';
import type { AssetStats, ImportedAsset } from '../../shared/api.types';
import { formatBytes } from '../lib/format-bytes';

interface AssetWorkspaceProps {
  stats: AssetStats | null;
  lastAsset: ImportedAsset | null;
  busy: boolean;
  error: string | null;
  onImport: () => void;
}

export function AssetWorkspace({ stats, lastAsset, busy, error, onImport }: AssetWorkspaceProps): React.JSX.Element {
  return (
    <section className="workspace">
      <div>
        <h2>图片仓库验证</h2>
        <p>
          原图与缩略图按 SHA-256 分片存放；SQLite 保存元数据。当前原图占用
          {stats ? ` ${formatBytes(stats.originalBytes)}` : ' —'}。
        </p>
        <Button type="primary" loading={busy} onClick={onImport}>
          选择一张图片
        </Button>
        {error ? <Alert className="workspace__error" type="error" title={error} showIcon /> : null}
      </div>

      <div className="preview" aria-live="polite">
        {lastAsset ? (
          <>
            <img src={lastAsset.previewUrl} alt="最近导入的图片预览" />
            <p>
              {lastAsset.width ?? '?'} × {lastAsset.height ?? '?'} · {lastAsset.duplicate ? '已去重' : '已入库'}
            </p>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未导入图片" />
        )}
      </div>
    </section>
  );
}
