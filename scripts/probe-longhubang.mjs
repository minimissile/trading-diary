#!/usr/bin/env node
/**
 * 龙虎榜数据源可行性探测；只读公开行情，不访问应用数据库、不安装依赖。
 * node scripts/probe-longhubang.mjs [输出 JSON 路径]
 * 默认只输出控制台；每项保留请求、耗时、返回数量、字段与最多两条样本。
 */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const endpoint = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const report = 'RPT_DAILYBILLBOARD_DETAILSNEW';
const results = [];
const dayFilter = (day) => `(TRADE_DATE='${day}')`;
const rangeFilter = (from, to) => `(TRADE_DATE>='${from}')(TRADE_DATE<='${to}')`;
const dateOf = (row) => row.TRADE_DATE.slice(0, 10);
const eventKey = (row) => `${row.SECURITY_CODE}|${row.TRADE_DATE}|${row.EXPLANATION}`;
const nonEmpty = (data) => assert.ok(data.length > 0, '应返回非空数据');

async function probe(name, params, check = nonEmpty) {
  const query = {
    reportName: report, columns: 'ALL', pageSize: '500', pageNumber: '1',
    sortColumns: 'TRADE_DATE,SECURITY_CODE,TRADE_ID', sortTypes: '-1,1,1',
    source: 'WEB', client: 'WEB', ...params,
  };
  const url = new URL(endpoint);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const record = { name, startedAt, query, url: url.toString() };
  let payload;
  let data = [];
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://data.eastmoney.com/stock/tradedetail.html',
        Accept: 'application/json, text/plain, */*',
      },
    });
    record.httpStatus = response.status;
    assert.ok(response.ok, `HTTP ${response.status}`);
    payload = await response.json();
    record.success = payload.success;
    record.code = payload.code;
    record.message = payload.message;
    record.total = payload.result?.count ?? null;
    record.pages = payload.result?.pages ?? null;
    data = payload.result?.data ?? [];
    record.returned = data.length;
    record.fields = Object.keys(data[0] ?? {});
    record.samples = data.slice(0, 2);
    // 空结果的原始业务状态单独保留，由对应用例判断。
    if (check !== emptyResult) assert.equal(payload.success, true, payload.message);
    check(data, payload);
    record.status = 'pass';
  } catch (error) {
    record.status = 'fail';
    record.error = `${error.message}${error.cause ? ` (${error.cause.message})` : ''}`;
  }
  record.elapsedMs = Math.round(performance.now() - started);
  results.push(record);
  console.log(JSON.stringify({ name, status: record.status, total: record.total,
    returned: record.returned, elapsedMs: record.elapsedMs,
    message: record.error ?? record.message }));
  return { data, payload, record };
}

function emptyResult(data, payload) {
  assert.equal(data.length, 0);
  assert.ok((payload.success && payload.result?.count === 0) ||
    (payload.code === 9201 && payload.result === null && payload.message === '返回数据为空'),
  '未知空结果状态，不能吞掉上游错误');
}

const latest = await probe('latest', { pageSize: 1 });
const earliest = await probe('earliest', { pageSize: 1, sortTypes: '1,1,1' });
const latestDay = latest.data[0] ? dateOf(latest.data[0]) : null;
if (latestDay) {
  const recent = await probe('latest-full-day', { filter: dayFilter(latestDay) }, (data, payload) => {
    nonEmpty(data);
    assert.equal(data.length, payload.result.count, '每日样本超过页容量');
    assert.ok(data.every((row) => dateOf(row) === latestDay));
    assert.ok(data.every((row) => Number.isFinite(row.BILLBOARD_NET_AMT)));
    assert.ok(data.every((row) => Math.abs(row.BILLBOARD_BUY_AMT - row.BILLBOARD_SELL_AMT - row.BILLBOARD_NET_AMT) < 0.02));
    assert.equal(new Set(data.map(eventKey)).size, data.length, '候选事件键不唯一');
  });
  recent.record.uniqueStocks = new Set(recent.data.map((row) => row.SECURITY_CODE)).size;
  recent.record.markets = [...new Set(recent.data.map((row) => row.TRADE_MARKET))];
  recent.record.securityTypes = Object.fromEntries([...new Set(recent.data.map((row) => row.SECURITY_TYPE_CODE))]
    .map((type) => [type, recent.data.filter((row) => row.SECURITY_TYPE_CODE === type).length]));
  recent.record.multiReasonStocks = [...new Set(recent.data.map((row) => row.SECURITY_CODE))]
    .filter((code) => recent.data.filter((row) => row.SECURITY_CODE === code).length > 1);

  const cases = [
    ...['2025-09-05', '2024-01-05', '2020-01-02', '2007-04-16'].map((day) =>
      () => probe(`history-${day}`, { filter: dayFilter(day) }, (data) => {
        nonEmpty(data); assert.ok(data.every((row) => dateOf(row) === day));
      })),
    () => probe('weekend-empty', { filter: dayFilter('2024-01-06') }, emptyResult),
    () => probe('combined-filters', {
      filter: `${dayFilter(latestDay)}(BILLBOARD_NET_AMT>=50000000)(CHANGE_RATE>=5)(TURNOVERRATE>=10)`,
      sortColumns: 'BILLBOARD_NET_AMT,SECURITY_CODE,TRADE_ID', sortTypes: '-1,1,1',
    }, (data, payload) => {
      nonEmpty(data);
      const expected = recent.data.filter((row) => row.BILLBOARD_NET_AMT >= 50_000_000 && row.CHANGE_RATE >= 5 && row.TURNOVERRATE >= 10);
      assert.equal(payload.result.count, expected.length);
      assert.deepEqual(data.map(eventKey).sort(), expected.map(eventKey).sort());
      assert.ok(data.every((row, i) => !i || data[i - 1].BILLBOARD_NET_AMT >= row.BILLBOARD_NET_AMT));
    }),
    () => probe('institution-daily', {
      reportName: 'RPT_ORGANIZATION_TRADE_DETAILS', filter: dayFilter(latestDay),
      sortColumns: 'NET_BUY_AMT,SECURITY_CODE', sortTypes: '-1,1',
    }),
    () => probe('a-share-market-filter', {
      filter: `${dayFilter(latestDay)}(MARKET="SZ")(SECURITY_TYPE_CODE="058001001")`,
    }, (data) => {
      nonEmpty(data);
      const expected = recent.data.filter((row) => row.MARKET === 'SZ' && row.SECURITY_TYPE_CODE === '058001001');
      assert.deepEqual(data.map(eventKey).sort(), expected.map(eventKey).sort());
    }),
    () => probe('reason-filter', {
      filter: `${dayFilter(latestDay)}(CHANGE_TYPE="${recent.data[0].CHANGE_TYPE}")`,
    }, (data) => {
      nonEmpty(data);
      assert.deepEqual(data.map(eventKey).sort(), recent.data.filter((row) => row.CHANGE_TYPE === recent.data[0].CHANGE_TYPE).map(eventKey).sort());
    }),
  ];
  // 最多两个请求并发，避免给公开源造成不必要压力。
  for (let i = 0; i < cases.length; i += 2) {
    const settled = await Promise.allSettled(cases.slice(i, i + 2).map((run) => run()));
    for (const item of settled) if (item.status === 'rejected') throw item.reason;
  }

  const from = '2024-01-02';
  const to = '2024-01-05';
  const range = await probe('date-range', { filter: rangeFilter(from, to) }, (data, payload) => {
    nonEmpty(data); assert.equal(data.length, payload.result.count);
    assert.ok(data.every((row) => dateOf(row) >= from && dateOf(row) <= to));
  });
  for (const page of [1, 2]) {
    await probe(`pagination-${page}`, { filter: rangeFilter(from, to), pageSize: 10, pageNumber: page }, (data, payload) => {
      assert.equal(data.length, 10); assert.equal(payload.result.count, range.data.length);
      assert.deepEqual(data.map(eventKey), range.data.slice((page - 1) * 10, page * 10).map(eventKey));
    });
  }

  const symbol = recent.record.multiReasonStocks[0] ?? recent.data[0]?.SECURITY_CODE;
  if (symbol) {
    await probe('stock-history', { filter: `(SECURITY_CODE="${symbol}")`, pageSize: 20 }, (data) => {
      nonEmpty(data); assert.ok(data.every((row) => row.SECURITY_CODE === symbol));
    });
    for (const [name, date, code] of [['recent', latestDay, symbol], ['historical', '2007-04-16', '600077']]) {
      for (const side of ['BUY', 'SELL']) {
        await probe(`${name}-seats-${side.toLowerCase()}`, {
          reportName: `RPT_BILLBOARD_DAILYDETAILS${side}`,
          filter: `${dayFilter(date)}(SECURITY_CODE="${code}")`,
          sortColumns: side, sortTypes: '-1',
        }, (data) => {
          nonEmpty(data);
          assert.ok(data.every((row) => dateOf(row) === date && row.SECURITY_CODE === code));
          assert.ok(data.every((row) => Number.isFinite(row[side])));
        });
      }
    }
  }
}

const output = {
  testedAt: new Date().toISOString(), runtime: process.version, endpoint,
  latestDay, earliestObservedDay: earliest.data[0] ? dateOf(earliest.data[0]) : null,
  scope: '抽样可行性验证，不代表全部历史完整性或持续可用性；未测试 Tushare 付费权限。',
  passed: results.filter((item) => item.status === 'pass').length,
  failed: results.filter((item) => item.status === 'fail').length, results,
};
if (process.argv[2]) await writeFile(process.argv[2], `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ latestDay, earliestObservedDay: output.earliestObservedDay,
  passed: output.passed, failed: output.failed, output: process.argv[2] ?? null }));
if (output.failed) process.exitCode = 1;
