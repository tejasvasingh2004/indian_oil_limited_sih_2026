import { describe, expect, test } from 'vitest';
import { delta, fmt, inr, kscToPsi, psiToKsc } from './format';

describe('format', () => {
  test('rupees switch to lakh at 1,00,000', () => {
    expect(inr(138000)).toBe('₹1.38 L');
    expect(inr(2900)).toBe('₹2,900');
    expect(inr(-700, { signed: true })).toBe('−₹700');
    expect(inr(16000, { signed: true })).toBe('+₹16,000');
  });
  test('Indian digit grouping', () => {
    expect(fmt(1234567)).toBe('12,34,567');
  });
  test('ksc ↔ psi round-trips (OIL uses ksc)', () => {
    expect(kscToPsi(90)).toBeCloseTo(1280, 0);
    expect(psiToKsc(kscToPsi(87))).toBeCloseTo(87, 6);
  });
  test('delta arrows', () => {
    expect(delta(1.22, 1.38).text).toBe('▲13%');
    expect(delta(14.1, 12.6).dir).toBe(-1);
  });
});
