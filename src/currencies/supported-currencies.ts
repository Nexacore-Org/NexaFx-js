export const SUPPORTED_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'NGN'] as const;

export type SupportedCurrencyCode =
  (typeof SUPPORTED_CURRENCY_CODES)[number];

export const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCY_CODES);

export function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}

export function isSupportedCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCY_SET.has(normalizeCurrencyCode(currency));
}
