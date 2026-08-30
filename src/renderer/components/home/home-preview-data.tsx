import {
  BellOutlined,
  CheckOutlined,
  ExportOutlined,
  FileAddOutlined,
  ImportOutlined,
  MinusOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ActionItem } from './types';

export const previewActionItems: ActionItem[] = [
  {
    id: 'preview-1',
    priority: 'high',
    category: 'reminder',
    type: '触发提醒',
    symbol: '宁德时代',
    code: '300750',
    description: '突破 240.00，放量站上20日均线',
    price: '241.36',
    change: '+1.21%',
    status: '等待入场',
    statusTone: 'warning',
    action: '查看计划',
  },
  {
    id: 'preview-2',
    priority: 'high',
    category: 'risk',
    type: '风险预警',
    symbol: '沪深300ETF',
    code: '510300',
    description: '回撤 > 2.5%，触发风控',
    price: '3.512',
    change: '-0.79%',
    status: '持仓中',
    statusTone: 'success',
    action: '处理预警',
  },
  {
    id: 'preview-3',
    priority: 'medium',
    category: 'due',
    type: '计划到期',
    symbol: '贵州茅台',
    code: '600519',
    description: '计划有效期将于 1 天后到期',
    price: '1,618.00',
    change: '-0.37%',
    status: '等待入场',
    statusTone: 'warning',
    action: '延长计划',
  },
  {
    id: 'preview-4',
    priority: 'medium',
    category: 'review',
    type: '待复盘',
    symbol: '腾讯控股',
    code: '0700.HK',
    description: '交易回合已结束，等待复盘',
    price: '375.60',
    change: '-0.53%',
    status: '已完成',
    statusTone: 'success',
    action: '开始复盘',
  },
  {
    id: 'preview-5',
    priority: 'low',
    category: 'reminder',
    type: '触发提醒',
    symbol: '中国平安',
    code: '601318',
    description: '回踩 55.80 附近，关注支撑',
    price: '55.96',
    change: '+0.27%',
    status: '观察中',
    statusTone: 'violet',
    action: '查看计划',
  },
];

export const stageColumns = [
  {
    title: '观察中',
    count: 6,
    tone: 'blue',
    items: [
      ['宁德时代', '关注突破 240'],
      ['中国平安', '观察支撑 55.8'],
      ['美团-W', '等待回调机会'],
    ],
  },
  {
    title: '等待入场',
    count: 7,
    tone: 'orange',
    items: [
      ['宁德时代', '突破 240 入场'],
      ['贵州茅台', '回踩 1610 附近'],
      ['比亚迪', '站上 240 入场'],
    ],
  },
  {
    title: '持仓中',
    count: 5,
    tone: 'green',
    items: [
      ['沪深300ETF', '成本 3.502'],
      ['腾讯控股', '成本 368.20'],
      ['中国平安', '成本 54.80'],
    ],
  },
  {
    title: '等待退出',
    count: 4,
    tone: 'violet',
    items: [
      ['腾讯控股', '目标 400 附近'],
      ['贵州茅台', '目标 1750'],
      ['中国平安', '上移止损'],
    ],
  },
  {
    title: '已完成',
    count: 6,
    tone: 'slate',
    items: [
      ['比亚迪', '止盈达成'],
      ['洋河股份', '止损离场'],
      ['招商银行', '止盈达成'],
    ],
  },
] as const;

export const timelineSteps = [
  { label: '计划创建', date: '05-08 21:30', icon: <FileAddOutlined />, details: ['突破 365', '入场计划', '仓位计划 20%'] },
  { label: '提醒触发', date: '05-12 09:35', icon: <BellOutlined />, details: ['突破 366', '成交放量', '提醒确认'] },
  { label: '买入', date: '05-12 09:41', icon: <ImportOutlined />, details: ['价格 368.20', '数量 2,000', '仓位 20%'] },
  { label: '加仓', date: '05-12 10:15', icon: <PlusOutlined />, details: ['价格 371.60', '数量 1,000', '仓位 30%'] },
  { label: '减仓', date: '05-14 10:02', icon: <MinusOutlined />, details: ['价格 382.00', '数量 1,000', '仓位 20%'] },
  { label: '卖出', date: '05-15 14:28', icon: <ExportOutlined />, details: ['价格 375.60', '数量 2,000', '仓位 0%'] },
  { label: '复盘完成', date: '05-16 10:20', icon: <CheckOutlined />, details: ['评分 72/100', '盈亏 +1.69%', 'R倍数 +0.63R'] },
] as const;

export const ruleRows = [
  ['计划优先原则', '必须存在有效计划，且条件已触发', '通过'],
  ['风险收益比 ≥ 1.5', '当前计划盈亏比 1.82', '通过'],
  ['单笔风险 ≤ 2%', '预计风险 1.48%（¥7,580）', '通过'],
  ['仓位符合计划', '计划仓位 20%，当前拟下单 20%', '通过'],
  ['市场环境过滤', '大盘趋势向上，量能正常', '量能较昨日下降 18%'],
] as const;
