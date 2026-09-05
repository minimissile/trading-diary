import type { InstrumentVenue, QuoteCurrency } from '../market/venues';

export interface CompanyAssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompanyAssistantAskInput {
  symbol: string;
  question: string;
  history: CompanyAssistantHistoryMessage[];
}

export interface CompanyAssistantSource {
  id: number;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  url: string | null;
  source: 'eastmoney-f10';
}

export interface CompanyAssistantResult {
  answer: string;
  company: {
    symbol: string;
    name: string;
    venue: InstrumentVenue;
    quoteCurrency: QuoteCurrency;
  };
  quote: {
    price: number | null;
    changePercent: number | null;
    peTtm: number | null;
    pb: number | null;
    dividendYieldTtm: number | null;
    fetchedAt: string;
  };
  sources: CompanyAssistantSource[];
  generatedAt: string;
}
