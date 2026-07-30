/**
 * Small shared in-memory cache for Next.js API routes (single process, so a
 * module-level Map is enough). Exists so a write in one route (e.g. an
 * assignment PATCH) can invalidate reads served by another route (e.g.
 * /api/clusters) instead of each route keeping its own private, unreachable
 * cache variable.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(key: string): void {
  store.delete(key);
}
