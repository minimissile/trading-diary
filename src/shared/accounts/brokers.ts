import type { AccountBroker } from './types';

export interface BrokerMeta {
  id: AccountBroker;
  label: string;
  /** 用于拉取 favicon 的域名。 */
  domain?: string;
  group: 'head' | 'regional' | 'internet' | 'other';
  /** 搜索别名：简称、拼音、常用 APP 名等。 */
  keywords?: string[];
}

/** 国内常见券商与常用交易渠道（含证监会名录主流机构）。 */
export const BROKER_REGISTRY: readonly BrokerMeta[] = [
  { id: 'huatai', label: '华泰证券', domain: 'htsc.com.cn', group: 'head', keywords: ['华泰', 'ht', 'htsc', '涨乐', '涨乐财富通'] },
  { id: 'citic', label: '中信证券', domain: 'citics.com', group: 'head', keywords: ['中信', 'zx', 'citics', '信e投', '信投'] },
  { id: 'csc', label: '中信建投', domain: 'csc108.com', group: 'head', keywords: ['建投', 'zxjt', 'csc', '蜻蜓点金'] },
  { id: 'gtja', label: '国泰君安', domain: 'gtja.com', group: 'head', keywords: ['国君', '国泰君安', 'gtja', '君弘', '海通'] },
  { id: 'haitong', label: '海通证券', domain: 'htsec.com', group: 'head', keywords: ['海通', 'htsec', 'e海通财'] },
  { id: 'gf', label: '广发证券', domain: 'gf.com.cn', group: 'head', keywords: ['广发', 'gf', '易淘金'] },
  { id: 'cms', label: '招商证券', domain: 'cmschina.com', group: 'head', keywords: ['招商', 'cms', '智远一户通', '招证'] },
  { id: 'galaxy', label: '中国银河', domain: 'chinastock.com.cn', group: 'head', keywords: ['银河', '中国银河', 'yh', '银河证券'] },
  { id: 'swhy', label: '申万宏源', domain: 'swhysc.com', group: 'head', keywords: ['申万', '宏源', 'swhy', '大赢家'] },
  { id: 'guosen', label: '国信证券', domain: 'guosen.com.cn', group: 'head', keywords: ['国信', 'guosen', '金太阳'] },
  { id: 'cicc', label: '中金公司', domain: 'cicc.com', group: 'head', keywords: ['中金', 'cicc', '中金财富'] },
  { id: 'ciccwm', label: '中金财富', domain: 'ciccwm.com', group: 'head', keywords: ['中金财富', '财富证券', 'ciccwm'] },
  { id: 'xyzq', label: '兴业证券', domain: 'xyzq.com.cn', group: 'head', keywords: ['兴业', 'xyzq', '优理宝'] },
  { id: 'ebscn', label: '光大证券', domain: 'ebscn.com', group: 'head', keywords: ['光大', 'ebscn', '金阳光'] },
  { id: 'pingan', label: '平安证券', domain: 'stock.pingan.com', group: 'head', keywords: ['平安', 'pingan', '平安证券'] },
  { id: 'dfzq', label: '东方证券', domain: 'dfzq.com.cn', group: 'head', keywords: ['东方证券', 'dfzq', '东方赢家'] },
  { id: 'sdicsec', label: '国投证券', domain: 'sdicsc.com.cn', group: 'head', keywords: ['国投', '安信', 'sdic', '国投证券'] },
  { id: 'bocichina', label: '中银证券', domain: 'bocichina.com', group: 'head', keywords: ['中银', 'boc', '中银国际'] },
  { id: 'glzq', label: '国联证券', domain: 'glzq.com.cn', group: 'head', keywords: ['国联', 'glzq', '国联尊宝'] },
  { id: 'ghzq', label: '国海证券', domain: 'ghzq.com.cn', group: 'head', keywords: ['国海', 'ghzq'] },

  { id: 'eastmoney', label: '东方财富', domain: 'eastmoney.com', group: 'internet', keywords: ['东财', 'eastmoney', '天天基金', '东方财富证券'] },
  { id: 'ths', label: '同花顺', domain: '10jqka.com.cn', group: 'internet', keywords: ['同花顺', 'ths', '10jqka'] },
  { id: 'xueqiu', label: '雪球', domain: 'xueqiu.com', group: 'internet', keywords: ['雪球', 'xueqiu', '蛋卷'] },
  { id: 'futu', label: '富途证券', domain: 'futunn.com', group: 'internet', keywords: ['富途', 'futu', 'moomoo', '牛牛'] },
  { id: 'tiger', label: '老虎证券', domain: 'itiger.com', group: 'internet', keywords: ['老虎', 'tiger', 'itiger'] },

  { id: 'cjsc', label: '长江证券', domain: 'cjsc.com.cn', group: 'regional', keywords: ['长江', 'cjsc', '长江e号'] },
  { id: 'zszq', label: '浙商证券', domain: 'stocke.com.cn', group: 'regional', keywords: ['浙商', 'zszq', '浙商汇金'] },
  { id: 'ztzq', label: '中泰证券', domain: 'zts.com.cn', group: 'regional', keywords: ['中泰', 'zts', '齐富通'] },
  { id: 'nesc', label: '东北证券', domain: 'nesc.cn', group: 'regional', keywords: ['东北', 'nesc', '融e通'] },
  { id: 'hxzq', label: '华西证券', domain: 'hx168.com.cn', group: 'regional', keywords: ['华西', 'hx168', '华彩人生'] },
  { id: 'gjzq', label: '国金证券', domain: 'gjzq.com.cn', group: 'regional', keywords: ['国金', 'gjzq', '佣金宝'] },
  { id: 'dwzq', label: '东吴证券', domain: 'dwzq.com.cn', group: 'regional', keywords: ['东吴', 'dwzq', '秀财'] },
  { id: 'fzzq', label: '方正证券', domain: 'foundersc.com', group: 'regional', keywords: ['方正', 'fzzq', '小方'] },
  { id: 'cgws', label: '长城证券', domain: 'cgws.com', group: 'regional', keywords: ['长城', 'cgws', '长城炼金术'] },
  { id: 'gyzq', label: '国元证券', domain: 'gyzq.com.cn', group: 'regional', keywords: ['国元', 'gyzq', '国元点金'] },
  { id: 'tfzq', label: '天风证券', domain: 'tfzq.com', group: 'regional', keywords: ['天风', 'tfzq', '天风高财生'] },
  { id: 'haazq', label: '华安证券', domain: 'hazq.com', group: 'regional', keywords: ['华安', 'hazq', '智赢'] },
  { id: 'cnht', label: '恒泰证券', domain: 'cnht.com.cn', group: 'regional', keywords: ['恒泰', 'cnht', '恒泰金玉管家'] },
  { id: 'mszq', label: '民生证券', domain: 'mszq.com', group: 'regional', keywords: ['民生', 'mszq', '民生财富汇'] },
  { id: 'xdzq', label: '信达证券', domain: 'cindasc.com', group: 'regional', keywords: ['信达', 'cinda', '信达天下'] },
  { id: 'jyzq', label: '中山证券', domain: 'zs95533.com', group: 'regional', keywords: ['中山', 'zs95533'] },
  { id: 'hczq', label: '华创证券', domain: 'hczq.com', group: 'regional', keywords: ['华创', 'hczq', 'e智通'] },
  { id: 'cczq', label: '财通证券', domain: 'ctsec.com', group: 'regional', keywords: ['财通', 'ctsec', '财通财管家'] },
  { id: 'swsc', label: '西南证券', domain: 'swsc.com.cn', group: 'regional', keywords: ['西南', 'swsc', '西南金点子'] },
  { id: 'gszq', label: '国盛证券', domain: 'gsstock.com', group: 'regional', keywords: ['国盛', 'gsstock', '国盛通'] },
  { id: 'gkzq', label: '国开证券', domain: 'gkzq.com.cn', group: 'regional', keywords: ['国开', 'gkzq'] },
  { id: 'gdzq', label: '国都证券', domain: 'guodu.com', group: 'regional', keywords: ['国都', 'guodu'] },
  { id: 'gxzq', label: '国新证券', domain: 'crsec.com.cn', group: 'regional', keywords: ['国新', '华融', 'crsec'] },
  { id: 'grzq', label: '国融证券', domain: 'grzq.com', group: 'regional', keywords: ['国融', 'grzq'] },
  { id: 'njzq', label: '南京证券', domain: 'njzq.com.cn', group: 'regional', keywords: ['南京', 'njzq', '金罗盘'] },
  { id: 'shzq', label: '上海证券', domain: 'shzq.com', group: 'regional', keywords: ['上海证券', 'shzq', '指e通'] },
  { id: 'chinalin', label: '华林证券', domain: 'chinalin.com', group: 'regional', keywords: ['华林', 'chinalin', '海豚股票'] },
  { id: 'hlzq', label: '华龙证券', domain: 'hlzq.com', group: 'regional', keywords: ['华龙', 'hlzq', '华龙点金'] },
  { id: 'cfzq', label: '华鑫证券', domain: 'cfzq.com', group: 'regional', keywords: ['华鑫', 'cfzq', '鑫智投'] },
  { id: 'hfzq', label: '华福证券', domain: 'hfzq.com.cn', group: 'regional', keywords: ['华福', 'hfzq', '小福牛'] },
  { id: 'hwabao', label: '华宝证券', domain: 'cnhbstock.com', group: 'regional', keywords: ['华宝', 'hwabao', '华宝智投'] },
  { id: 'huajin', label: '华金证券', domain: 'huajinsc.cn', group: 'regional', keywords: ['华金', 'huajin'] },
  { id: 'dycy', label: '第一创业', domain: 'firstcapital.com.cn', group: 'regional', keywords: ['第一创业', 'dycy', '一创'] },
  { id: 'dgzq', label: '东莞证券', domain: 'dgzq.com.cn', group: 'regional', keywords: ['东莞', 'dgzq', '掌证宝'] },
  { id: 'dhzq', label: '东海证券', domain: 'longone.com.cn', group: 'regional', keywords: ['东海', 'longone', '龙点金'] },
  { id: 'dxzq', label: '东兴证券', domain: 'dxzq.net', group: 'regional', keywords: ['东兴', 'dxzq', '东兴198'] },
  { id: 'ccnew', label: '中原证券', domain: 'ccnew.com', group: 'regional', keywords: ['中原', 'ccnew', '财升宝'] },
  { id: 'avicsec', label: '中航证券', domain: 'avicsec.com', group: 'regional', keywords: ['中航', 'avic', '翼启航'] },
  { id: 'cnpsec', label: '中邮证券', domain: 'cnpsec.com', group: 'regional', keywords: ['中邮', 'cnpsec'] },
  { id: 'ztzsec', label: '中天证券', domain: 'ztzq.com', group: 'regional', keywords: ['中天', 'ztzsec'] },
  { id: 'sgsec', label: '申港证券', domain: 'shgsec.com', group: 'regional', keywords: ['申港', 'shgsec'] },
  { id: 'kysec', label: '开源证券', domain: 'kysec.cn', group: 'regional', keywords: ['开源', 'kysec', '肥猫'] },
  { id: 'xcsc', label: '湘财证券', domain: 'xcsc.com', group: 'regional', keywords: ['湘财', 'xcsc', '百宝湘'] },
  { id: 'ykzq', label: '粤开证券', domain: 'ykzq.com', group: 'regional', keywords: ['粤开', 'ykzq', '联讯'] },
  { id: 'jhzq', label: '江海证券', domain: 'jhzq.com.cn', group: 'regional', keywords: ['江海', 'jhzq', '金太阳江海'] },
  { id: 'wlzq', label: '万联证券', domain: 'wlzq.cn', group: 'regional', keywords: ['万联', 'wlzq', 'e万通'] },
  { id: 'whzq', label: '万和证券', domain: 'whzq.com.cn', group: 'regional', keywords: ['万和', 'whzq'] },
  { id: 'lczq', label: '联储证券', domain: 'lczq.com', group: 'regional', keywords: ['联储', 'lczq'] },
  { id: 'tebon', label: '德邦证券', domain: 'tebon.com.cn', group: 'regional', keywords: ['德邦', 'tebon', '德邦证券'] },
  { id: 'bhzq', label: '渤海证券', domain: 'bhstock.com', group: 'regional', keywords: ['渤海', 'bhstock', '信悦'] },
  { id: 'wkzq', label: '五矿证券', domain: 'wkzq.com.cn', group: 'regional', keywords: ['五矿', 'wkzq'] },
  { id: 'tpyzq', label: '太平洋证券', domain: 'tpyzq.com', group: 'regional', keywords: ['太平洋', 'tpy', 'tpyzq'] },
  { id: 'jzsec', label: '九州证券', domain: 'jzsec.com', group: 'regional', keywords: ['九州', 'jzsec'] },
  { id: 'ytzq', label: '银泰证券', domain: 'ytzq.com', group: 'regional', keywords: ['银泰', 'ytzq', '银泰掌易宝'] },
  { id: 'yxzq', label: '甬兴证券', domain: 'yongxingsec.com', group: 'regional', keywords: ['甬兴', 'yxzq'] },
  { id: 'sczq', label: '首创证券', domain: 'sczq.com.cn', group: 'regional', keywords: ['首创', 'sczq', '首创证券'] },
  { id: 'htzq', label: '红塔证券', domain: 'htzq.com.cn', group: 'regional', keywords: ['红塔', 'htzq', '智越'] },
  { id: 'sxzq', label: '山西证券', domain: 'i618.com.cn', group: 'regional', keywords: ['山西', 'sxzq', '汇通启富'] },
  { id: 'westsec', label: '西部证券', domain: 'westsec.com.cn', group: 'regional', keywords: ['西部', 'westsec', '西部信天游'] },
  { id: 'ajzq', label: '爱建证券', domain: 'ajzq.com', group: 'regional', keywords: ['爱建', 'ajzq'] },
  { id: 'dtsbc', label: '大同证券', domain: 'dtsbc.com.cn', group: 'regional', keywords: ['大同', 'dtsbc'] },
  { id: 'sjzq', label: '世纪证券', domain: 'csco.com.cn', group: 'regional', keywords: ['世纪', 'sjzq', 'csco'] },
  { id: 'jinyuan', label: '金元证券', domain: 'jyzq.cn', group: 'regional', keywords: ['金元', 'jinyuan'] },
  { id: 'cczqsc', label: '川财证券', domain: 'cczq.com', group: 'regional', keywords: ['川财', 'cczqsc'] },
  { id: 'cdzq', label: '财达证券', domain: 'cdzq.com', group: 'regional', keywords: ['财达', 'cdzq', '财达财日昇'] },
  { id: 'dtsec', label: '大通证券', domain: 'dtsec.com', group: 'regional', keywords: ['大通', 'dtsec'] },
  { id: 'ydzq', label: '英大证券', domain: 'ydzq.com.cn', group: 'regional', keywords: ['英大', 'ydzq'] },
  { id: 'mgzq', label: '麦高证券', domain: 'mgzq.com', group: 'regional', keywords: ['麦高', 'mgzq'] },

  { id: 'custom', label: '其他券商', group: 'other', keywords: ['其他', '自定义'] },
  { id: 'other', label: '未列出渠道', group: 'other', keywords: ['未列出', '未知'] },
];

export const ACCOUNT_BROKER_IDS = BROKER_REGISTRY.map((item) => item.id) as [AccountBroker, ...AccountBroker[]];

const brokerMap = new Map(BROKER_REGISTRY.map((item) => [item.id, item]));

export function getBrokerMeta(id: AccountBroker): BrokerMeta {
  return brokerMap.get(id) ?? { id: 'other', label: '未列出渠道', group: 'other' };
}

export function getBrokerLabel(id: AccountBroker): string {
  return getBrokerMeta(id).label;
}

/** 按名称、别名、id 匹配搜索词。 */
export function matchBrokerSearch(meta: BrokerMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [meta.label, meta.id, ...(meta.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(q);
}

function brokerIconHosts(domain: string): string[] {
  const hosts = [domain];
  if (!domain.startsWith('www.')) {
    hosts.push(`www.${domain}`);
  }
  return hosts;
}

/** 券商 favicon 候选地址（按优先级，国内网络友好；不含 Google）。 */
export function getBrokerIconCandidates(id: AccountBroker): string[] {
  const domain = getBrokerMeta(id).domain;
  if (!domain) return [];

  const urls: string[] = [];
  for (const host of brokerIconHosts(domain)) {
    urls.push(`https://${host}/favicon.ico`, `https://${host}/favicon.png`);
  }
  urls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  return urls;
}

/** 通过主进程 app-asset 协议加载券商 favicon（本地缓存 + 多源拉取）。 */
export function getBrokerIconAssetUrl(id: AccountBroker): string | null {
  if (!getBrokerMeta(id).domain) return null;
  return `app-asset://broker-icon/${id}`;
}

/** @deprecated 请使用 getBrokerIconAssetUrl。 */
export function getBrokerIconUrl(id: AccountBroker): string | null {
  return getBrokerIconAssetUrl(id);
}

export const BROKER_GROUP_LABELS: Record<BrokerMeta['group'], string> = {
  head: '头部券商',
  internet: '互联网渠道',
  regional: '区域券商',
  other: '其他',
};
