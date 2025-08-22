'use client';

import { useState, useEffect, useCallback } from 'react';

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
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간
const DAILY_LIMIT = 1000; // Tmap 무료 API 일일 제한
const HOURLY_LIMIT = 100; // 시간당 제한

export function usePoiCache() {
  const [cache, setCache] = useState<Map<string, CachedPoiResult>>(new Map());
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

        setCache(validCache);
      }

      const rateLimitData = localStorage.getItem(RATE_LIMIT_KEY);
      if (rateLimitData) {
        const parsed = JSON.parse(rateLimitData);
        setRateLimit({
          ...parsed,
          lastReset: new Date(parsed.lastReset),
        });
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
  const getFromCache = useCallback((query: string): any[] | null => {
    const cacheKey = query.toLowerCase().trim();
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      console.log('[usePoiCache] Cache hit for:', query);
      return cached.suggestions;
    }

    console.log('[usePoiCache] Cache miss for:', query);
    return null;
  }, [cache]);

  // 캐시에 저장
  const setCacheData = useCallback((query: string, suggestions: any[]) => {
    const cacheKey = query.toLowerCase().trim();
    const newCache = new Map(cache);

    newCache.set(cacheKey, {
      query: cacheKey,
      suggestions,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });

    setCache(newCache);
    saveCache(newCache);
  }, [cache, saveCache]);

  // 레이트리밋 체크
  const checkRateLimit = useCallback((): boolean => {
    const now = new Date();
    const lastReset = rateLimit.lastReset;

    // 일일 리셋 체크
    if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      const newRateLimit: RateLimitInfo = {
        dailyCount: 0,
        hourlyCount: 0,
        lastReset: now,
        limitReached: false,
      };
      setRateLimit(newRateLimit);
      saveRateLimit(newRateLimit);
      return false;
    }

    // 시간별 리셋 체크
    if (now.getHours() !== lastReset.getHours()) {
      const newRateLimit: RateLimitInfo = {
        ...rateLimit,
        hourlyCount: 0,
        lastReset: now,
        limitReached: false,
      };
      setRateLimit(newRateLimit);
      saveRateLimit(newRateLimit);
      return false;
    }

    return rateLimit.limitReached;
  }, [rateLimit, saveRateLimit]);

  // API 호출 기록
  const recordApiCall = useCallback(() => {
    const newRateLimit: RateLimitInfo = {
      ...rateLimit,
      dailyCount: rateLimit.dailyCount + 1,
      hourlyCount: rateLimit.hourlyCount + 1,
      limitReached: (rateLimit.dailyCount + 1) >= DAILY_LIMIT || (rateLimit.hourlyCount + 1) >= HOURLY_LIMIT,
    };

    setRateLimit(newRateLimit);
    saveRateLimit(newRateLimit);
  }, [rateLimit, saveRateLimit]);

  // 캐시 통계
  const getCacheStats = useCallback(() => {
    return {
      size: cache.size,
      hitRate: 0, // TODO: 히트율 계산 로직 추가
      rateLimit: rateLimit,
    };
  }, [cache, rateLimit]);

  return {
    getFromCache,
    setCache: setCacheData,
    checkRateLimit,
    recordApiCall,
    getCacheStats,
    cache,
    rateLimit,
  };
}
