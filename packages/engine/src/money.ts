import type { CurrencyFormat } from './types/map.js';

function trimZeros(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Formats an engine amount for display. */
export function formatMoney(
  amount: number,
  currency: CurrencyFormat,
  opts: { short?: boolean } = {},
): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let body: string;
  switch (currency.style) {
    case 'indian-lakh': {
      if (abs >= 100) body = `${trimZeros(abs / 100, 2)} Cr`;
      else body = `${trimZeros(abs, 2)} L`;
      break;
    }
    case 'compact': {
      if (abs >= 1_000_000) body = `${trimZeros(abs / 1_000_000, 2)}M`;
      else if (abs >= 1000) body = `${trimZeros(abs / 1000, 1)}K`;
      else body = String(abs);
      break;
    }
    default: {
      if (opts.short && abs >= 10_000) body = `${trimZeros(abs / 1000, 1)}K`;
      else body = new Intl.NumberFormat(currency.locale).format(abs);
    }
  }
  return `${neg ? '-' : ''}${currency.symbol}${body}`;
}
