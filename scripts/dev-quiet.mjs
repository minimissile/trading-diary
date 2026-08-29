export function isDevVerbose() {
  return process.env.TRADING_DIARY_VERBOSE === '1';
}

export function devLog(...args) {
  if (isDevVerbose()) console.log(...args);
}

export function devWarn(...args) {
  if (isDevVerbose()) console.warn(...args);
}
