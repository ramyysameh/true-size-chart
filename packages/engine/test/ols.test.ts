import { describe, expect, it } from 'vitest';
import { ols } from '../src/ols';

describe('ols', () => {
  it('recovers exact coefficients from noiseless data', () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 50; i++) {
      const x1 = (i * 7) % 13;
      const x2 = (i * i) % 17;
      X.push([1, x1, x2]);
      y.push(3 + 2 * x1 - 0.5 * x2);
    }
    const { beta, r2 } = ols(X, y);
    expect(beta[0]).toBeCloseTo(3, 6);
    expect(beta[1]).toBeCloseTo(2, 6);
    expect(beta[2]).toBeCloseTo(-0.5, 6);
    expect(r2).toBeCloseTo(1, 9);
  });
});
