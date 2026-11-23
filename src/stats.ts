// Small, deterministic statistics helpers.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 95% bootstrap confidence interval for the mean of `values` (resampling images).
// Fixed seed, so the same results always give the same interval.
export function bootstrapCI(values: number[], iterations = 5000, seed = 7): [number, number] {
  const n = values.length;
  if (!n) return [0, 0];
  const rand = mulberry32(seed);
  const means = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[Math.floor(rand() * n)];
    means[i] = sum / n;
  }
  means.sort();
  return [means[Math.floor(iterations * 0.025)], means[Math.floor(iterations * 0.975)]];
}
