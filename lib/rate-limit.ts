export type RateState = {
  byKey: Map<string, number[]>;
  global: number[];
};

export type RateLimits = {
  perMinute: number;
  perHour: number;
  globalPerHour: number;
};

export const DEFAULT_LIMITS: RateLimits = {
  perMinute: 8,
  perHour: 30,
  globalPerHour: 300,
};

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export function createRateState(): RateState {
  return { byKey: new Map(), global: [] };
}

/** One budget for deadline reads and study reads on this server process. */
export const appRateState = createRateState();

export function allowRequest(state: RateState, key: string, now: number, limits: RateLimits = DEFAULT_LIMITS): boolean {
  state.global = state.global.filter((stamp) => now - stamp < HOUR);
  if (state.global.length >= limits.globalPerHour) return false;
  const stamps = (state.byKey.get(key) ?? []).filter((stamp) => now - stamp < HOUR);
  const recent = stamps.filter((stamp) => now - stamp < MINUTE);
  if (recent.length >= limits.perMinute || stamps.length >= limits.perHour) {
    state.byKey.set(key, stamps);
    return false;
  }
  stamps.push(now);
  state.global.push(now);
  state.byKey.set(key, stamps);
  if (state.byKey.size > 5000) {
    const oldest = state.byKey.keys().next().value;
    if (oldest) state.byKey.delete(oldest);
  }
  return true;
}
