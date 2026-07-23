import { parseUnits } from 'viem';

/**
 * Multiplies a whole/decimal string by 10^18 to get a base-unit string
 * for GenLayer smart contract calls.
 */
export function parseGen(amount: string | number): string {
  try {
    return parseUnits(amount.toString(), 18).toString();
  } catch (err) {
    console.error("parseGen parsing error:", err);
    throw err;
  }
}
