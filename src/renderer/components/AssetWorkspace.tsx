import type { AssetStats, ImportedAsset } from '../../shared/api.types';
import { formatBytes } from '../lib/format-bytes';

interface AssetWorkspaceProps {
  stats: AssetStats | null;
  lastAsset: ImportedAsset | null;
  busy: boolean;
  error: string | null;
  onImport: () => void;
}

export function AssetWorkspace({
  stats,
  lastAsset,
  busy,
  error,
  onImport,
}: AssetWorkspaceProps): React.JSX.Element {
  return (
    <section className="workspace">
      <div>
        <h2>图片仓库验证</h2>
        <p>
          原图与缩略图按 SHA-256 分片存放；SQLite 保存元数据。当前原图占用
          {stats ? ` ${formatBytes(stats.originalBytes)}` : ' —'}。
        </p>
        <button type="button" disabled={busy} onClick={onImport}>
          {busy ? '处理中…' : '选择一张图片'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="preview" aria-live="polite">
        {lastAsset ? (
          <>
            <img src={lastAsset.previewUrl} alt="最近导入的图片预览" />
            <p>
              {lastAsset.width ?? '?'} × {lastAsset.height ?? '?'} ·{' '}
              {lastAsset.duplicate ? '已去重' : '已入库'}
            </p>
          </>
        ) : (
          <p>尚未导入图片</p>
        )}
      </div>
    </section>
  );
}
