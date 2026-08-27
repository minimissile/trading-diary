export type PlaybookRuleCategory = 'entry' | 'position' | 'stop' | 'exit' | 'market' | 'emotion' | 'process';

export type PlaybookRuleStatus = 'active' | 'archived';

export type PlaybookCheckTiming = 'plan_activation' | 'always';

export interface PlaybookRule {
  id: string;
  content: string;
  category: PlaybookRuleCategory;
  status: PlaybookRuleStatus;
  symbol: string | null;
  checkTiming: PlaybookCheckTiming;
  sourceReviewId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaybookRuleInput {
  content: string;
  category: PlaybookRuleCategory;
  symbol?: string | null;
  checkTiming?: PlaybookCheckTiming;
  sourceReviewId?: string | null;
}

export interface UpdatePlaybookRuleInput {
  content?: string;
  category?: PlaybookRuleCategory;
  symbol?: string | null;
  checkTiming?: PlaybookCheckTiming;
  status?: PlaybookRuleStatus;
}
