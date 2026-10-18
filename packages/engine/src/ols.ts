/**
 * Ordinary least squares via the normal equations (XᵀX)β = Xᵀy,
 * solved with Gaussian elimination and partial pivoting.
 * X must already contain the intercept column.
 */
export function ols(X: number[][], y: number[]): { beta: number[]; r2: number } {
  const k = X[0]?.length ?? 0;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));

  X.forEach((row, n) => {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) A[i]![j]! += row[i]! * row[j]!;
      A[i]![k]! += row[i]! * y[n]!;
    }
  });

  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    for (let r = col + 1; r < k; r++) {
      const f = A[r]![col]! / A[col]![col]!;
      for (let c = col; c <= k; c++) A[r]![c]! -= f * A[col]![c]!;
    }
  }

  const beta = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let sum = A[i]![k]!;
    for (let j = i + 1; j < k; j++) sum -= A[i]![j]! * beta[j]!;
    beta[i] = sum / A[i]![i]!;
  }

  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  X.forEach((row, n) => {
    const pred = row.reduce((s, x, i) => s + x * beta[i]!, 0);
    ssRes += (y[n]! - pred) ** 2;
    ssTot += (y[n]! - mean) ** 2;
  });

  return { beta, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}
