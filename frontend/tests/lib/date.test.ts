import { describe, it, expect } from 'vitest';
import { datetimeLocalToISO, isoToDatetimeLocal, formatDistanceToNow } from '@/lib/date';

describe('datetimeLocalToISO', () => {
  it('converts a local datetime string to a UTC ISO string', () => {
    // 2026-07-28T08:52 local time will become some UTC ISO string.
    // The exact UTC string depends on the runtime timezone, so we verify the Date parsing works.
    const input = '2026-07-28T08:52';
    const result = datetimeLocalToISO(input);
    const expected = new Date(input).toISOString();
    
    expect(result).toBe(expected);
  });

  it('handles empty strings', () => {
    expect(datetimeLocalToISO('')).toBe('');
  });
});

describe('isoToDatetimeLocal', () => {
  it('converts a UTC ISO string to a local datetime-local string format', () => {
    // Create a known Date
    const date = new Date(2026, 6, 28, 8, 52); // Note: months are 0-indexed in JS Date, so 6 is July
    const isoString = date.toISOString();
    
    const result = isoToDatetimeLocal(isoString);
    // Should format as YYYY-MM-DDTHH:mm using local timezone getters
    expect(result).toBe('2026-07-28T08:52');
  });

  it('converts a Date object to a local datetime-local string format', () => {
    const date = new Date(2026, 6, 28, 8, 52);
    const result = isoToDatetimeLocal(date);
    expect(result).toBe('2026-07-28T08:52');
  });

  it('handles empty strings or invalid dates gracefully', () => {
    expect(isoToDatetimeLocal('')).toBe('');
    expect(isoToDatetimeLocal('invalid-date')).toBe('');
  });
});

describe('formatDistanceToNow', () => {
  it('formats dates in the past appropriately', () => {
    // Mock the current time to ensure stable tests if needed, or just test relative to a recent time
    // For simplicity, we just verify the string formatting works.
    const now = new Date();
    
    const oneMinAgo = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(formatDistanceToNow(oneMinAgo)).toMatch(/1m ago/);
    
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatDistanceToNow(twoHoursAgo)).toMatch(/2h ago/);
    
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatDistanceToNow(threeDaysAgo)).toMatch(/3d ago/);
  });
});
