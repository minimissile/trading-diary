import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearAllAnimatedValueCache,
  readAnimatedValueCache,
  writeAnimatedValueCache,
} from '../src/renderer/lib/animated-value-cache';

describe('animated value cache', () => {
  beforeEach(() => {
    clearAllAnimatedValueCache();
  });

  it('persists values across logical remounts', () => {
    writeAnimatedValueCache('positions:all:601519:marketPrice', 8.9);
    expect(readAnimatedValueCache('positions:all:601519:marketPrice')).toBe(8.9);
  });

  it('keeps separate keys for different fields', () => {
    writeAnimatedValueCache('positions:all:601519:marketPrice', 8.9);
    writeAnimatedValueCache('positions:all:601519:marketValue', 5340);
    expect(readAnimatedValueCache('positions:all:601519:marketValue')).toBe(5340);
  });
});
