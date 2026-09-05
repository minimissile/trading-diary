# 内置图片背景

使用内置 image_gen 工具生成原创背景，转换为 WebP 随应用离线分发。

- `src/renderer/public/backgrounds/moonlake.webp`：月下山湖
- `src/renderer/public/backgrounds/silk.webp`：午夜织纹
- `src/renderer/public/backgrounds/shore.webp`：静海潮汐

## 生成提示词

### 月下山湖

Create a premium desktop wallpaper, landscape 16:9, no text no UI no logos. Cinematic photorealistic blue-hour mountain lake, distant layered indigo mountain silhouettes along lower third, delicate low mist, soft muted cyan moonlight from upper right reflected subtly on still water. Deep navy #07122f dominant, restrained cool teal and slate blue, dark low contrast center with generous negative space for a frosted glass financial dashboard overlay. Fine natural atmospheric texture, sophisticated serene photographic art, no bright white highlights, no stars, no people. Save the generated image.

### 午夜织纹

Premium 16:9 photographic desktop wallpaper for deep navy frosted glass UI. Abstract close up of flowing midnight blue satin silk with broad graceful sculptural folds diagonally across frame, subtle slate-blue edge light and very restrained muted violet reflected light at far right. Deep ink navy shadows, soft low contrast center, tactile matte fabric, elegant quiet luxury editorial photography, no bright highlights, no objects, no text, no UI, no logos, no gold, no neon. Full bleed landscape.

### 静海潮汐

Create 16:9 landscape premium photographic wallpaper. Aerial view of a quiet dark teal ocean, long delicate misty surf sweeping diagonally along a black slate shore at the bottom right, subtle moonlit blue-green water, deep navy upper left 70 percent softly textured negative space for a dark glass financial app. Fine natural sea texture but low contrast, subdued light, tranquil elegant editorial photography, no bright white foam, no text no logos no UI no people no buildings. Blue hour, full bleed.

## 本地图片

支持 JPG、PNG 和 WebP（最大 15 MB）。在渲染进程中解码并缩放至最长边 2560 像素，转换为受大小限制的 WebP 后写入独立 localStorage 项。不会上传图片；原始文件不被修改。移除仅删除应用保存的副本。外观选择继续兼容已有 v1 设置。
