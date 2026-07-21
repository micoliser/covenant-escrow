import { formatUnits } from 'viem';

/**
 * Divides a raw base-unit u256 string (or bigint/number) by 10^18
 * and formats it for human-readable display with maximum 4 fractional digits.
 */
export function formatGen(weiString: string | bigint | number | undefined | null): string {
  if (weiString === undefined || weiString === null || weiString === '') return '0';
  try {
    const eth = formatUnits(BigInt(weiString), 18);
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 4,
    }).format(parseFloat(eth));
  } catch (err) {
    console.error("formatGen parsing error:", err);
    return '0';
  }
}
