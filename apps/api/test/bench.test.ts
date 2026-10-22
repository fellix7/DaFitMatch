import { describe, expect, it } from 'vitest';
import { summarize } from '../src/jobs/bench';

describe('bench latency summary', () => {
  it('handles no samples', () => {
    expect(summarize([])).toEqual({ count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 });
  });

  it('summarises a single run', () => {
    expect(summarize([12.5])).toEqual({
      count: 1,
      min: 12.5,
      p50: 12.5,
      p95: 12.5,
      max: 12.5,
      mean: 12.5,
    });
  });

  it('sorts before taking the percentiles', () => {
    const stats = summarize([30, 10, 20, 40, 50]);
    expect(stats.count).toBe(5);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.mean).toBe(30);
    expect(stats.p50).toBe(30);
    expect(stats.p95).toBe(50);
  });

  it('does not mutate the input', () => {
    const samples = [3, 1, 2];
    summarize(samples);
    expect(samples).toEqual([3, 1, 2]);
  });
});
