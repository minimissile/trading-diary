import { z } from 'zod';

export const selectionPlatformSchema = z.enum(['wencai', 'eastmoney']);
export type SelectionPlatform = z.infer<typeof selectionPlatformSchema>;
export const SELECTION_PLATFORMS = {
  wencai: { name: '同花顺 i 问财', keyUrl: 'https://www.iwencai.com/skillhub' },
  eastmoney: { name: '东方财富妙想', keyUrl: 'https://ai.eastmoney.com/skills' },
} as const;
export const DEFAULT_SELECTION_QUERY = '沪深 A 股，非 ST，上市超过一年，成交额大于 2 亿，收盘价高于 20 日均线，按近 20 日涨幅从高到低排序';
export const aiSelectionSettingsSchema = z.object({
  platform: selectionPlatformSchema,
  queries: z.object({ wencai: z.string().trim().max(2000), eastmoney: z.string().trim().max(2000) }).strict(),
  limit: z.number().int().min(1).max(60),
}).strict();
export const aiSelectionQuerySchema = z.object({
  platform: selectionPlatformSchema,
  query: z.string().trim().min(2, '请输入选股条件').max(2000),
  limit: z.number().int().min(1).max(60),
}).strict();
export const aiSelectionKeySchema = z.object({
  platform: selectionPlatformSchema,
  apiKey: z.string().trim().min(1, '请输入 API Key').max(4096).regex(/^[\x21-\x7e]+$/u, 'API Key 不能包含空白或中文'),
}).strict();
export type AiSelectionSettings = z.infer<typeof aiSelectionSettingsSchema>;
export type AiSelectionQuery = z.infer<typeof aiSelectionQuerySchema>;
export interface AiSelectionStock {
  symbol: string;
  name: string;
  metrics: { label: string; value: string }[];
}
export interface AiSelectionResult extends AiSelectionQuery {
  id: string;
  createdAt: string;
  stocks: AiSelectionStock[];
  total: number | null;
  warnings: string[];
  explanation: string;
}
export interface AiSelectionState {
  settings: AiSelectionSettings;
  configured: Record<SelectionPlatform, boolean>;
  history: AiSelectionResult[];
}
export interface AiSelectionApi {
  getState: () => Promise<AiSelectionState>;
  saveSettings: (input: AiSelectionSettings) => Promise<AiSelectionState>;
  saveKey: (input: z.infer<typeof aiSelectionKeySchema>) => Promise<AiSelectionState>;
  clearKey: (platform: SelectionPlatform) => Promise<AiSelectionState>;
  query: (input: AiSelectionQuery) => Promise<AiSelectionResult>;
}
