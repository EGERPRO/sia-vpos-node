import { describe, it, expect } from 'vitest';
import { computeHash, generateMAC, verifyMAC } from '../src/mac';

describe('computeHash', () => {
  const secret = 'test_secret_key';
  const text = 'OPERATION=AUTHORIZATION&TIMESTAMP=2025-01-01T00:00:00.000';

  it('should compute MD5 hash (text + secretKey)', () => {
    const hash = computeHash(text, secret, 'md5');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should compute SHA-1 hash (text + secretKey)', () => {
    const hash = computeHash(text, secret, 'sha1');
    expect(hash).toHaveLength(40);
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should compute HMAC-SHA256 hash', () => {
    const hash = computeHash(text, secret, 'hmac-sha256');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should default to hmac-sha256', () => {
    const hashDefault = computeHash(text, secret);
    const hashExplicit = computeHash(text, secret, 'hmac-sha256');
    expect(hashDefault).toBe(hashExplicit);
  });

  it('should produce deterministic results', () => {
    const hash1 = computeHash(text, secret, 'hmac-sha256');
    const hash2 = computeHash(text, secret, 'hmac-sha256');
    expect(hash1).toBe(hash2);
  });

  it('should produce different results with different keys', () => {
    const hash1 = computeHash(text, 'key1', 'hmac-sha256');
    const hash2 = computeHash(text, 'key2', 'hmac-sha256');
    expect(hash1).not.toBe(hash2);
  });

  it('should throw on unsupported algorithm', () => {
    expect(() => computeHash(text, secret, 'sha512' as any)).toThrow('Unsupported hash algorithm');
  });
});

describe('generateMAC', () => {
  const secret = 'my_secret_key_50_chars_long_for_testing_purposes!!!';

  it('should build MAC string from key-value pairs and hash it', () => {
    const fields: [string, string | number | undefined][] = [
      ['OPERATION', 'AUTHORIZATION'],
      ['TIMESTAMP', '2025-01-01T00:00:00.000'],
      ['SHOPID', 'OTP_SERBIA_RSD'],
    ];
    const mac = generateMAC(fields, secret, 'hmac-sha256');
    expect(mac).toHaveLength(64);
  });

  it('should skip undefined/null/empty fields', () => {
    const fields1: [string, string | number | undefined][] = [
      ['OPERATION', 'TEST'],
      ['EMPTY', undefined],
      ['NULL', null],
      ['BLANK', ''],
      ['SHOPID', 'SHOP1'],
    ];
    const fields2: [string, string | number | undefined][] = [
      ['OPERATION', 'TEST'],
      ['SHOPID', 'SHOP1'],
    ];
    const mac1 = generateMAC(fields1, secret, 'hmac-sha256');
    const mac2 = generateMAC(fields2, secret, 'hmac-sha256');
    expect(mac1).toBe(mac2);
  });

  it('should include numeric values', () => {
    const fields: [string, string | number | undefined][] = [
      ['AMOUNT', 1500],
      ['CURRENCY', '941'],
    ];
    const mac = generateMAC(fields, secret, 'hmac-sha256');
    expect(mac).toHaveLength(64);
  });
});

describe('verifyMAC', () => {
  const secret = 'test_secret';
  const fields: [string, string | number | undefined][] = [
    ['OPERATION', 'TEST'],
    ['SHOPID', 'MYSHOP'],
  ];

  it('should return true for matching MAC', () => {
    const mac = generateMAC(fields, secret, 'hmac-sha256');
    expect(verifyMAC(fields, secret, mac, 'hmac-sha256')).toBe(true);
  });

  it('should return false for non-matching MAC', () => {
    expect(verifyMAC(fields, secret, 'deadbeef', 'hmac-sha256')).toBe(false);
  });

  it('should return false for NULL mac', () => {
    expect(verifyMAC(fields, secret, 'NULL', 'hmac-sha256')).toBe(false);
  });

  it('should return false for empty mac', () => {
    expect(verifyMAC(fields, secret, '', 'hmac-sha256')).toBe(false);
  });

  it('should be case-insensitive for MAC comparison', () => {
    const mac = generateMAC(fields, secret, 'hmac-sha256');
    expect(verifyMAC(fields, secret, mac.toUpperCase(), 'hmac-sha256')).toBe(true);
  });
});
