const ISO_4217_PATTERN = /^[A-Z]{3}$/;

declare const currencyBrand: unique symbol;

/** Branded ISO-4217-Waehrungscode (z. B. "EUR", "USD"). Nur via {@link toCurrencyCode} erzeugbar. */
export type CurrencyCode = string & { readonly [currencyBrand]: "CurrencyCode" };

export class InvalidCurrencyCodeError extends Error {
  constructor(value: string) {
    super(`"${value}" ist kein gueltiger ISO-4217-Waehrungscode (3 Grossbuchstaben).`);
    this.name = "InvalidCurrencyCodeError";
  }
}

export function toCurrencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!ISO_4217_PATTERN.test(normalized)) {
    throw new InvalidCurrencyCodeError(value);
  }
  return normalized as CurrencyCode;
}

export const EUR: CurrencyCode = toCurrencyCode("EUR");
