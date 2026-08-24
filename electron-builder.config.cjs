const updateBaseUrl = process.env.UPDATE_BASE_URL?.trim();
const updateChannel = process.env.UPDATE_CHANNEL?.trim() || 'latest';

/**
 * 正式发布时通过环境变量注入更新服务器地址。
 * 未提供地址仍可生成安装包，但不会写入 app-update.yml，客户端会自动禁用更新。
 */
module.exports = {
  extends: './electron-builder.yml',
  ...(updateBaseUrl
    ? {
        publish: [
          {
            provider: 'generic',
            url: updateBaseUrl,
            channel: updateChannel,
          },
        ],
      }
    : {}),
};
