'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface CachedPoiResult {
  query: string;
  suggestions: any[];
  timestamp: number;
  ttl: number;
}

export interface RateLimitInfo {
  dailyCount: number;
  hourlyCount: number;
  lastReset: Date;
  limitReached: boolean;
}

const CACHE_KEY = 'poi_search_cache';
const RATE_LIMIT_KEY = 'poi_rate_limit';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간
const MAX_CACHE_ENTRIES = 600;
const DAILY_LIMIT = 1000; // Tmap 무료 API 일일 제한
const HOURLY_LIMIT = 100; // 시간당 제한

export function usePoiCache() {
  const cacheRef = useRef<Map<string, CachedPoiResult>>(new Map());
  const [cache, setCache] = useState<Map<string, CachedPoiResult>>(new Map());
  const hitCountRef = useRef(0);
  const missCountRef = useRef(0);

  const rateLimitRef = useRef<RateLimitInfo>({
    dailyCount: 0,
    hourlyCount: 0,
    lastReset: new Date(),
    limitReached: false,
  });
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({
    dailyCount: 0,
    hourlyCount: 0,
    lastReset: new Date(),
    limitReached: false,
  });

  // 캐시 초기화
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cacheMap = new Map(Object.entries(parsed));

        // 만료된 캐시 정리
        const now = Date.now();
        const validCache = new Map();
        for (const [key, value] of cacheMap.entries()) {
          if (value && typeof value === 'object' && 'timestamp' in value && 'ttl' in value) {
            const cacheEntry = value as CachedPoiResult;
            if (now - cacheEntry.timestamp < cacheEntry.ttl) {
              validCache.set(key, cacheEntry);
            }
          }
        }

        cacheRef.current = validCache;
        setCache(new Map(validCache));
      }

      const rateLimitData = localStorage.getItem(RATE_LIMIT_KEY);
      if (rateLimitData) {
        const parsed = JSON.parse(rateLimitData);
        const hydrated = {
          ...parsed,
          lastReset: new Date(parsed.lastReset),
        } as RateLimitInfo;
        rateLimitRef.current = hydrated;
        setRateLimit(hydrated);
      }
    } catch (error) {
      console.warn('[usePoiCache] Failed to load cache from localStorage:', error);
    }
  }, []);

  // 캐시 저장
  const saveCache = useCallback((newCache: Map<string, CachedPoiResult>) => {
    try {
      const cacheObj = Object.fromEntries(newCache);
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
    } catch (error) {
      console.warn('[usePoiCache] Failed to save cache to localStorage:', error);
    }
  }, []);

  // 레이트리밋 저장
  const saveRateLimit = useCallback((newRateLimit: RateLimitInfo) => {
    try {
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newRateLimit));
    } catch (error) {
      console.warn('[usePoiCache] Failed to save rate limit to localStorage:', error);
    }
  }, []);

  // 캐시에서 검색
  const isExpired = (entry: CachedPoiResult, now: number) => now - entry.timestamp >= entry.ttl;

  const getFromCache = useCallback((query: string): any[] | null => {
    const cacheKey = query.toLowerCase().trim();
    const cached = cacheRef.current.get(cacheKey);
    const now = Date.now();

    if (cached && !isExpired(cached, now)) {
      hitCountRef.current += 1;
      return cached.suggestions;
    }

    missCountRef.current += 1;
    return null;
  }, []);

  const getFromPrefixCache = useCallback((query: string): any[] | null => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return null;

    const now = Date.now();
    let selectedEntry: CachedPoiResult | null = null;
    let selectedKeyLength = 0;

    for (const [key, entry] of cacheRef.current.entries()) {
      if (isExpired(entry, now)) {
        cacheRef.current.delete(key);
        continue;
      }
      if (normalizedQuery.startsWith(key) || key.startsWith(normalizedQuery)) {
        if (key.length > selectedKeyLength) {
          selectedEntry = entry;
          selectedKeyLength = key.length;
        }
      }
    }

    if (!selectedEntry) {
      missCountRef.current += 1;
      return null;
    }

    const filtered = selectedEntry.suggestions.filter((item: any) => {
      const name = String(item?.name ?? '').toLowerCase().replace(/\s+/g, '');
      const address = String(item?.address ?? '').toLowerCase().replace(/\s+/g, '');
      const compactQuery = normalizedQuery.replace(/\s+/g, '');
      return name.includes(compactQuery) || address.includes(compactQuery);
    });

    const suggestions = filtered.length > 0 ? filtered : selectedEntry.suggestions;
    hitCountRef.current += 1;
    return suggestions.slice(0, 10);
  }, []);

  const pruneCache = useCallback((cacheMap: Map<string, CachedPoiResult>) => {
    if (cacheMap.size <= MAX_CACHE_ENTRIES) return cacheMap;
    const sortedByTime = [...cacheMap.entries()].sort((a, b) => b[1].timestamp - a[1].timestamp);
    return new Map(sortedByTime.slice(0, MAX_CACHE_ENTRIES));
  }, []);

  // 캐시에 저장
  const setCacheData = useCallback((query: string, suggestions: any[]) => {
    const cacheKey = query.toLowerCase().trim();
    const newCache = new Map(cacheRef.current);

    newCache.set(cacheKey, {
      query: cacheKey,
      suggestions,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });

    const pruned = pruneCache(newCache);
    cacheRef.current = pruned;
    setCache(new Map(pruned));
    saveCache(pruned);
  }, [pruneCache, saveCache]);

  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  const isSameHour = (a: Date, b: Date) => isSameDay(a, b) && a.getHours() === b.getHours();

  const syncRateLimit = useCallback((next: RateLimitInfo) => {
    rateLimitRef.current = next;
    setRateLimit(next);
    saveRateLimit(next);
  }, [saveRateLimit]);

  // 레이트리밋 체크
  const checkRateLimit = useCallback((): boolean => {
    const now = new Date();
    const current = rateLimitRef.current;

    if (!isSameDay(now, current.lastReset)) {
      syncRateLimit({
        dailyCount: 0,
        hourlyCount: 0,
        lastReset: now,
        limitReached: false,
      });
      return false;
    }

    if (!isSameHour(now, current.lastReset)) {
      syncRateLimit({
        ...current,
        hourlyCount: 0,
        lastReset: now,
        limitReached: false,
      });
      return false;
    }

    return current.limitReached;
  }, [syncRateLimit]);

  // API 호출 기록
  const recordApiCall = useCallback(() => {
    const current = rateLimitRef.current;
    const newRateLimit: RateLimitInfo = {
      ...current,
      dailyCount: current.dailyCount + 1,
      hourlyCount: current.hourlyCount + 1,
      limitReached: (current.dailyCount + 1) >= DAILY_LIMIT || (current.hourlyCount + 1) >= HOURLY_LIMIT,
    };
    syncRateLimit(newRateLimit);
  }, [syncRateLimit]);

  // 캐시 통계
  const getCacheStats = useCallback(() => {
    const total = hitCountRef.current + missCountRef.current;
    return {
      size: cacheRef.current.size,
      hitRate: total === 0 ? 0 : hitCountRef.current / total,
      hits: hitCountRef.current,
      misses: missCountRef.current,
      rateLimit: rateLimitRef.current,
    };
  }, []);

  return {
    getFromCache,
    getFromPrefixCache,
    setCache: setCacheData,
    checkRateLimit,
    recordApiCall,
    getCacheStats,
    cache,
    rateLimit,
  };
}
