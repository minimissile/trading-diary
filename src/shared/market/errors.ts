export class MarketError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MarketError';
    this.code = code;
  }
}

export class MarketNotFoundError extends MarketError {
  constructor(message: string) {
    super('MARKET_NOT_FOUND', message);
    this.name = 'MarketNotFoundError';
  }
}

export class MarketProviderError extends MarketError {
  constructor(message: string) {
    super('MARKET_PROVIDER_ERROR', message);
    this.name = 'MarketProviderError';
  }
}

export class MarketUnsupportedError extends MarketError {
  constructor(message: string) {
    super('MARKET_UNSUPPORTED', message);
    this.name = 'MarketUnsupportedError';
  }
}
