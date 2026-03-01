import { describe, it, expect } from 'vitest';
import { generateTimestamp, generateReqRefNum } from '../src/vpos-client';

describe('generateTimestamp', () => {
  it('should generate timestamp in yyyy-MM-ddTHH:mm:ss.SSS format', () => {
    const ts = generateTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('should use provided date', () => {
    const date = new Date(2025, 0, 15, 10, 30, 45, 123); // 2025-01-15T10:30:45.123
    const ts = generateTimestamp(date);
    expect(ts).toBe('2025-01-15T10:30:45.123');
  });

  it('should zero-pad months and days', () => {
    const date = new Date(2025, 1, 5, 3, 7, 9, 42);
    const ts = generateTimestamp(date);
    expect(ts).toBe('2025-02-05T03:07:09.042');
  });
});

describe('generateReqRefNum', () => {
  it('should generate 32-character numeric string', () => {
    const ref = generateReqRefNum();
    expect(ref).toHaveLength(32);
    expect(ref).toMatch(/^\d{32}$/);
  });

  it('should start with yyyyMMdd date prefix', () => {
    const date = new Date(2025, 5, 15);
    const ref = generateReqRefNum(date);
    expect(ref.substring(0, 8)).toBe('20250615');
  });

  it('should generate unique values', () => {
    const ref1 = generateReqRefNum();
    const ref2 = generateReqRefNum();
    expect(ref1).not.toBe(ref2);
  });
});
