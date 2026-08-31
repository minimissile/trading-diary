export function parseOptionalNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,，\s￥¥元]/gu, '').trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function isPartialDecimalInput(raw: string): boolean {
  const cleaned = raw.replace(/[,，\s￥¥元]/gu, '').trim();
  if (!cleaned) return true;
  return /^-?\d*\.?\d*$/u.test(cleaned);
}

export function isIncompleteDecimalInput(raw: string): boolean {
  const cleaned = raw.replace(/[,，\s￥¥元]/gu, '').trim();
  return cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned.endsWith('.');
}
