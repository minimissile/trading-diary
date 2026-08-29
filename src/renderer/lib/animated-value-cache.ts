/** 跨 Tab / 路由挂载缓存，避免 AnimatedValueDisplay 卸载后丢失上次数值。 */
const animatedValueCache = new Map<string, number>();

export function readAnimatedValueCache(key: string): number | undefined {
  return animatedValueCache.get(key);
}

export function writeAnimatedValueCache(key: string, value: number): void {
  animatedValueCache.set(key, value);
}

export function clearAnimatedValueCache(key: string): void {
  animatedValueCache.delete(key);
}

/** 测试专用。 */
export function clearAllAnimatedValueCache(): void {
  animatedValueCache.clear();
}
