/**
 * Part C4: counts and the Wilson 95% interval. These describe an observed sample; they are not a score.
 */
export interface Proportion {
  count: number;
  of: number;
  /** null when the sample is below the minimum for comparison. */
  wilson95: { low: number; high: number } | null;
  note: string | null;
}

export function wilson(x: number, n: number, z = 1.959964): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { low: r(Math.max(0, centre - half)), high: r(Math.min(1, centre + half)) };
}

export function proportion(count: number, of: number, minForComparison: number): Proportion {
  if (of < minForComparison) {
    return { count, of, wilson95: null, note: `Only ${of} valid answers (fewer than ${minForComparison}): the sample is too small to compare.` };
  }
  return { count, of, wilson95: wilson(count, of), note: null };
}

export function phrase(verb: string, p: { count: number; of: number }, unit = "valid runs"): string {
  return `${verb} in ${p.count} of ${p.of} ${unit}`;
}
