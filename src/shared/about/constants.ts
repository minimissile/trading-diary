/** 开源仓库地址（与 package.json repository 保持一致）。 */
export const APP_REPOSITORY_URL = 'https://github.com/minimissile/trading-diary';

/** 产品原则（README 与应用内「关于我们」共用）。 */
export const ABOUT_PRINCIPLES = [
  {
    title: '计划先于行动',
    description: '下单前写清逻辑、区间与失效条件，减少临盘冲动。',
  },
  {
    title: '过程与结果分开',
    description: '纪律指标解释过程，盈亏数字解释结果，不混为一谈。',
  },
  {
    title: '数据属于用户',
    description: '本地 SQLite 存储，随时导出备份，不被平台绑定。',
  },
] as const;

/** 微信交流群配置。 */
export const COMMUNITY_CHANNEL = {
  id: 'wechat-group',
  label: '微信交流群',
  subtitle: '交易为生，复盘为师',
  imageSrc: './about/community-wechat-group.png',
  hint: '扫码加入用户群，反馈问题、交流用法与版本动态',
  footnote: '群二维码会定期更新；若无法入群，可在 GitHub 仓库提 Issue 联系维护者',
} as const;

/** 赞赏渠道配置。 */
export const DONATION_CHANNELS = [
  {
    id: 'wechat',
    label: '微信赞赏',
    imageSrc: './about/donate-wechat.png',
    hint: '自愿支持，不影响任何功能；你的鼓励是我们持续维护的动力',
  },
] as const;

export const ABOUT_SECURITY_POINTS = [
  {
    title: '本地优先',
    description: '计划、提醒、复盘、持仓与流水默认写入本机 SQLite，无需云端账号即可查看与管理核心记录。',
  },
  {
    title: '敏感凭据隔离',
    description: 'OpenRouter API Key、启动访问密码等凭据单独存放在 userData，不会进入 SQLite 或 ZIP 备份。',
  },
  {
    title: '可选启动访问锁',
    description: '可在设置中开启启动密码；启动页结束后需验证方可进入，密码以 scrypt 哈希本地保存。',
  },
  {
    title: '离线 License 校验',
    description: 'Pro 激活码在本机离线验证，不上传交易数据或账户信息至授权服务器。',
  },
  {
    title: '不代客交易',
    description: '产品只帮你落实自己的交易系统，不提供买卖建议，也不连接券商自动下单。',
  },
  {
    title: '开源可审计',
    description: '核心代码以 MIT 协议开源，可自行审查数据的存储、备份与导出方式。',
  },
] as const;

export const ABOUT_MISSION_PARAGRAPHS = [
  '市面上不乏看行情、算盈亏的工具，却少有产品认真回答三个问题：下单前有没有计划，盘中有没有守纪律，收盘后有没有留下可复用的复盘。',
  '交易日记希望把分散在表格、备忘录和提醒 App 里的碎片工作，收拢到一台本地桌面工作台，让「计划 → 提醒 → 成交 → 复盘」形成稳定闭环。',
  '我们相信过程与结果应当分开看待，数据也应始终属于用户本人——随时导出、备份、迁移，不被平台绑架。',
] as const;

export const ABOUT_FEATURE_ITEMS = [
  {
    title: '今日指挥台',
    description: '汇总待处理提醒、到期计划与待复盘事项，给出下一步动作。',
  },
  {
    title: '计划与提醒',
    description: '记录入场逻辑、失效条件与价格触发，跟踪计划状态流转。',
  },
  {
    title: '持仓与定投',
    description: '跟踪真实成本、分红与定投纪律，把执行落到账户层面。',
  },
  {
    title: '复盘与分析',
    description: '沉淀错误标签与周期统计，而不只盯着盈亏数字。',
  },
] as const;
