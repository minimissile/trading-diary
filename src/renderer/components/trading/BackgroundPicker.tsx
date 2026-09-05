import { CheckOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Popover, Segmented, Slider } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import '../../styles/background-picker.css';
import { isStoredBackgroundImage, prepareBackgroundImage } from '../../lib/background-image';

const imageBackgrounds = [
  { id: 'moonlake', name: '月下山湖', detail: '月光 · 静水远山' },
  { id: 'silk', name: '午夜织纹', detail: '靛蓝 · 柔软织物' },
  { id: 'shore', name: '静海潮汐', detail: '青碧 · 雾岸潮声' },
];
const backgrounds = [
  { id: 'aurora', name: '极光夜幕', detail: '靛蓝 · 柔和光带' },
  { id: 'ocean', name: '深海流光', detail: '青碧 · 静谧纵深' },
  { id: 'dusk', name: '暮色山岚', detail: '烟紫 · 暖色余晖' },
  { id: 'forest', name: '雾松静境', detail: '墨绿 · 山间薄雾' },
  { id: 'slate', name: '月光岩层', detail: '蓝灰 · 冷冽层次' },
  { id: 'plain', name: '纯净深蓝', detail: '低干扰 · 专注数据' },
] as const;
const storageKey = 'trading-diary:appearance:v1';
const customImageKey = 'trading-diary:background-image:v1';
const defaults = { background: 'none', transparency: 55 };

function readCustomImage(): string | null {
  try {
    const value = localStorage.getItem(customImageKey);
    return isStoredBackgroundImage(value) ? value : null;
  } catch {
    return null;
  }
}

function readAppearance(): typeof defaults {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const saved = value as Record<string, unknown>;
    return {
      background:
        saved.background === 'none' ||
        [...backgrounds, ...imageBackgrounds].some((item) => item.id === saved.background) ||
        (saved.background === 'custom' && readCustomImage() !== null)
          ? String(saved.background)
          : defaults.background,
      transparency:
        typeof saved.transparency === 'number' && Number.isFinite(saved.transparency)
          ? Math.min(80, Math.max(0, saved.transparency))
          : defaults.transparency,
    };
  } catch {
    return defaults;
  }
}

export function BackgroundPicker(): React.JSX.Element {
  const [appearance, setAppearance] = useState(readAppearance);
  const { message } = App.useApp();
  const [customImage, setCustomImage] = useState(readCustomImage);
  const [importing, setImporting] = useState(false);
  const [category, setCategory] = useState('图片');
  const fileInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (appearance.background === 'none') {
      delete document.body.dataset.background;
      for (const property of ['--workspace-custom-image', '--workspace-opacity', '--workspace-frost', '--workspace-backdrop']) {
        document.body.style.removeProperty(property);
      }
      return;
    }
    document.body.dataset.background = appearance.background;
    if (appearance.background === 'custom' && customImage) {
      document.body.style.setProperty('--workspace-custom-image', `url("${customImage}")`);
    } else {
      document.body.style.removeProperty('--workspace-custom-image');
    }
    document.body.style.setProperty('--workspace-opacity', String(1 - appearance.transparency / 100));
    const frost = appearance.transparency / 80;
    document.body.style.setProperty('--workspace-frost', String(frost));
    document.body.style.setProperty(
      '--workspace-backdrop',
      frost === 0 ? 'none' : `blur(${16 * frost}px) saturate(${100 + 15 * frost}%)`,
    );
  }, [appearance, customImage]);

  function save(next: typeof defaults): void {
    setAppearance(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      void message.warning({ content: '背景已应用，但本地存储不可用，重启后需重新选择。', key: 'appearance-storage' });
    }
  }

  async function importImage(file: File): Promise<void> {
    setImporting(true);
    try {
      const data = await prepareBackgroundImage(file);
      try {
        localStorage.setItem(customImageKey, data);
      } catch {
        throw new Error('本地空间不足，图片未保存。请清理空间后重试。');
      }
      setCustomImage(data);
      save({ ...appearance, background: 'custom' });
      void message.success('图片背景已保存到本机');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '图片导入失败，请重试。');
    } finally {
      setImporting(false);
    }
  }

  function removeCustomImage(): void {
    try {
      localStorage.removeItem(customImageKey);
    } catch {
      void message.error('无法移除本地图片，请重试。');
      return;
    }
    setCustomImage(null);
    if (appearance.background === 'custom') save({ ...appearance, background: defaults.background });
  }

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <section className="background-picker" aria-label="工作台背景">
          <div className="background-picker-heading">
            <span>工作台背景</span>
            <small>默认使用页面配色，也可选择图片或氛围色</small>
          </div>
          <button
            type="button"
            className="background-option background-option--none"
            disabled={importing}
            aria-pressed={appearance.background === 'none'}
            onClick={() => save({ ...appearance, background: 'none' })}
          >
            <span>
              <strong>不使用背景</strong>
              <small>使用页面默认配色</small>
            </span>
            {appearance.background === 'none' ? <CheckOutlined aria-hidden="true" /> : null}
          </button>
          <Segmented block options={['图片', '氛围色']} value={category} onChange={setCategory} aria-label="背景类型" />
          <div className="background-options" role="group" aria-label="选择背景">
            {(category === '图片' ? imageBackgrounds : backgrounds).map((item) => (
              <button
                type="button"
                disabled={importing}
                key={item.id}
                className="background-option"
                aria-pressed={appearance.background === item.id}
                onClick={() => save({ ...appearance, background: item.id })}
              >
                <span className="background-swatch" data-background={item.id}>
                  <span className="background-swatch-glass" />
                  {appearance.background === item.id ? <CheckOutlined className="background-selected" /> : null}
                </span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
            {category === '图片' && customImage ? (
              <button
                type="button"
                className="background-option"
                disabled={importing}
                aria-pressed={appearance.background === 'custom'}
                onClick={() => save({ ...appearance, background: 'custom' })}
              >
                <span className="background-swatch" style={{ backgroundImage: `url("${customImage}")` }}>
                  <span className="background-swatch-glass" />
                  {appearance.background === 'custom' ? <CheckOutlined className="background-selected" /> : null}
                </span>
                <strong>我的图片</strong>
                <small>本机保存 · 自定义背景</small>
              </button>
            ) : null}
          </div>
          {category === '图片' ? (
            <div className="background-upload">
              <input
                ref={fileInput}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importImage(file);
                }}
              />
              <Button block icon={<UploadOutlined />} loading={importing} onClick={() => fileInput.current?.click()}>
                {customImage ? '替换本地图片' : '导入本地图片'}
              </Button>
              <div className="background-upload-hint">
                <small>JPG / PNG / WebP · 最大 15 MB</small>
                {customImage ? (
                  <Button size="small" type="text" disabled={importing} onClick={removeCustomImage}>
                    移除图片
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="background-transparency">
            <label id="background-transparency-label">背景磨砂强度</label>
            <span>
              {appearance.background === 'none'
                ? '未启用'
                : appearance.transparency === 0
                  ? '原图'
                  : `${appearance.transparency}%`}
            </span>
          </div>
          <Slider
            disabled={importing || appearance.background === 'none'}
            min={0}
            max={80}
            value={appearance.transparency}
            ariaLabelledByForHandle="background-transparency-label"
            onChange={(transparency) => setAppearance({ ...appearance, transparency })}
            onChangeComplete={(transparency) => save({ ...appearance, transparency })}
          />
          <div className="background-picker-footer">
            <small>即时生效 · 自动保存在本机</small>
            <Button size="small" type="text" disabled={importing} onClick={() => save(defaults)}>
              恢复默认
            </Button>
          </div>
        </section>
      }
    >
      <Button className="background-trigger" icon={<PictureOutlined />} aria-label="选择工作台背景">
        背景
      </Button>
    </Popover>
  );
}
