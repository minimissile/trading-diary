import type { InstrumentInfo, InstrumentKind, MarketQuote, MarketSearchHit } from '../../../shared/market/types';
import type { InstrumentVenue } from '../../../shared/market/venues';
import { quoteCurrencyForVenue } from '../../../shared/market/venues';

/** 为 EastMoney 解析结果补充 venue / quoteCurrency。 */
export function enrichEastMoneyInstrument(
  info: Omit<InstrumentInfo, 'venue' | 'quoteCurrency'>,
  venueOverride?: InstrumentVenue,
): InstrumentInfo {
  const venue = venueOverride ?? resolveVenueFromEastMoney(info);
  return {
    ...info,
    venue,
    quoteCurrency: quoteCurrencyForVenue(venue),
  };
}

function resolveVenueFromEastMoney(info: Pick<InstrumentInfo, 'kind' | 'market'>): InstrumentVenue {
  if (info.kind === 'otc_fund') return 'OTC';
  if (info.market === 'SH' || info.market === 'SZ') return info.market;
  return 'OTC';
}

export function enrichEastMoneySearchHit(
  hit: Omit<MarketSearchHit, 'venue' | 'quoteCurrency'>,
  venue: InstrumentVenue,
): MarketSearchHit {
  return {
    ...hit,
    venue,
    quoteCurrency: quoteCurrencyForVenue(venue),
  };
}

export function enrichEastMoneyQuote(
  quote: Omit<MarketQuote, 'venue' | 'quoteCurrency'>,
  venue: InstrumentVenue,
  kind: InstrumentKind = quote.kind,
): MarketQuote {
  return {
    ...quote,
    venue,
    quoteCurrency: quoteCurrencyForVenue(venue),
    kind,
  };
}
