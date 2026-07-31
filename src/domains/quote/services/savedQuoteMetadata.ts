import type { SaveQuoteInput } from '@/domains/quote/types/savedQuote';

export function deriveSavedQuoteMetadata(input: SaveQuoteInput) {
  const quoteBook = input.quoteBook;
  const firstLabel = quoteBook.cases[0]?.label.trim() || '배송 견적';
  const defaultTitle =
    quoteBook.cases.length === 1
      ? firstLabel
      : `${firstLabel} 외 ${quoteBook.cases.length - 1}개 라인`;
  const effectiveDates = quoteBook.cases
    .flatMap((item) => [
      item.pricingEvidence?.hourly?.effectiveFrom,
      item.pricingEvidence?.fuelSurcharge?.effectiveFrom,
    ])
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    title: (input.title?.trim() || defaultTitle).slice(0, 120),
    customerName: input.customerName?.trim().slice(0, 120) || null,
    totalAmount: Math.round(quoteBook.rollup.oneTimeTotal),
    caseCount: quoteBook.cases.length,
    vehicleTypes: Array.from(new Set(quoteBook.cases.map((item) => item.vehicleType))),
    rateEffectiveFrom: effectiveDates.at(-1) ?? null,
  };
}
