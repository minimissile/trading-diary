import { describe, expect, it } from 'vitest';
import {
  BROKER_REGISTRY,
  defaultBrokerForAccountKind,
  getBrokerMeta,
  isBrokerAllowedForAccountKind,
  listBrokersForAccountKind,
  matchBrokerSearch,
} from '../src/shared/accounts/brokers';

describe('fund broker registry', () => {
  const fundQueries: Array<[string, string]> = [
    ['天天基金', 'ttfund'],
    ['支付宝', 'antfortune'],
    ['蚂蚁财富', 'antfortune'],
    ['且慢', 'qieman'],
    ['理财通', 'licaitong'],
    ['微信', 'licaitong'],
    ['京东金融', 'jdjr'],
    ['好买', 'howbuy'],
    ['有知有行', 'youzhiyouxing'],
    ['基金豆', 'fundbean'],
    ['陆基金', 'lufund'],
    ['度小满', 'duxiaoman'],
    ['爱基金', 'aifund'],
    ['招商银行', 'cmb'],
    ['工行', 'icbc'],
    ['微众', 'webank'],
    ['易方达', 'efunds'],
  ];

  it.each(fundQueries)('搜索「%s」可匹配 %s', (query, brokerId) => {
    const meta = getBrokerMeta(brokerId as never);
    expect(matchBrokerSearch(meta, query)).toBe(true);
  });

  it('基金账户列表包含主流平台且不含区域券商', () => {
    const fundBrokers = listBrokersForAccountKind('fund');
    const ids = fundBrokers.map((item) => item.id);
    expect(ids).toContain('ttfund');
    expect(ids).toContain('antfortune');
    expect(ids).toContain('qieman');
    expect(ids).not.toContain('cjsc');
    expect(fundBrokers.length).toBeGreaterThan(30);
  });

  it('股票账户列表不含纯基金平台', () => {
    const securitiesBrokers = listBrokersForAccountKind('securities');
    const ids = securitiesBrokers.map((item) => item.id);
    expect(ids).toContain('huatai');
    expect(ids).not.toContain('ttfund');
    expect(ids).not.toContain('antfortune');
  });

  it('默认基金账户渠道为天天基金', () => {
    expect(defaultBrokerForAccountKind('fund')).toBe('ttfund');
    expect(isBrokerAllowedForAccountKind('ttfund', 'fund')).toBe(true);
    expect(isBrokerAllowedForAccountKind('huatai', 'fund')).toBe(false);
  });

  it('注册表 id 唯一', () => {
    const ids = BROKER_REGISTRY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
