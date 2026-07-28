import { describe, it, expect } from 'vitest';
import { formatGen } from '@/lib/formatGen';
import { parseGen } from '@/lib/parseGen';

describe('formatGen', () => {
  it('handles undefined, null, and empty string', () => {
    expect(formatGen(undefined)).toBe('0');
    expect(formatGen(null)).toBe('0');
    expect(formatGen('')).toBe('0');
  });

  it('handles zero', () => {
    expect(formatGen('0')).toBe('0');
    expect(formatGen(0)).toBe('0');
    expect(formatGen(BigInt(0))).toBe('0');
  });

  it('formats exactly 18 decimals without rounding down if small', () => {
    // 1 wei (10^-18 GEN)
    expect(formatGen('1')).toBe('0'); // due to max 4 decimals, this becomes 0 in Intl.NumberFormat
  });

  it('formats exactly 1 GEN (10^18)', () => {
    expect(formatGen('1000000000000000000')).toBe('1');
  });

  it('formats large numbers (near 78-digit ceiling)', () => {
    // Let's take a massive number e.g. 1 million GEN (10^24 wei)
    const millionGenWei = '1000000000000000000000000';
    expect(formatGen(millionGenWei)).toBe('1,000,000');
    
    // Very massive number (approx 10^36)
    const massive = '1' + '0'.repeat(36);
    // 10^36 wei = 10^18 GEN = 1,000,000,000,000,000,000
    expect(formatGen(massive)).toBe('1,000,000,000,000,000,000');
  });

  it('formats fractional GEN correctly (up to 4 digits)', () => {
    const fraction = '1500000000000000000'; // 1.5 GEN
    expect(formatGen(fraction)).toBe('1.5');

    const longFraction = '1234500000000000000'; // 1.2345 GEN
    expect(formatGen(longFraction)).toBe('1.2345');

    const truncated = '1234560000000000000'; // 1.23456 GEN -> rounds to 1.2346 according to normal JS Intl formatting rules
    expect(formatGen(truncated)).toBe('1.2346'); // Intl.NumberFormat standard behavior
  });
});

describe('parseGen', () => {
  it('parses zero', () => {
    expect(parseGen('0')).toBe('0');
    expect(parseGen(0)).toBe('0');
  });

  it('parses whole numbers', () => {
    expect(parseGen('1')).toBe('1000000000000000000');
    expect(parseGen('1000000')).toBe('1000000000000000000000000');
  });

  it('parses fractional numbers (up to 18 decimals)', () => {
    expect(parseGen('1.5')).toBe('1500000000000000000');
    expect(parseGen('0.000000000000000001')).toBe('1'); // 1 wei
  });

  it('evaluates numbers with more than 18 decimals as truncated/zero', () => {
    expect(parseGen('0.0000000000000000001')).toBe('0');
  });
});

describe('Round-trip parsing and formatting', () => {
  it('round-trips values sensibly (format -> parse -> format)', () => {
    // If we have 1.5 GEN, parse it to wei, then format it back to GEN
    const initial = '1.5';
    const parsed = parseGen(initial); // '1500000000000000000'
    const formatted = formatGen(parsed); // '1.5'
    expect(formatted).toBe(initial);

    // Large number round-trip
    const largeGen = '1000000';
    const largeParsed = parseGen(largeGen);
    // formatGen inserts commas, so it will be '1,000,000'
    expect(formatGen(largeParsed)).toBe('1,000,000');
  });
});
