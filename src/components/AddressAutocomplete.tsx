'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePoiCache } from '@/hooks/usePoiCache'

export type AddressSelection = {
  name: string
  address: string
  latitude: number
  longitude: number
}

interface Props {
  label: string
  placeholder?: string
  value?: AddressSelection | null
  onSelect: (v: AddressSelection | null) => void
}

type InputState = 'idle' | 'searching' | 'ready' | 'ambiguous' | 'committed'

type SuggestionMatchType = 'name_prefix' | 'address_prefix' | 'name_contains' | 'address_contains' | 'fuzzy' | 'unknown'

type SuggestionSource = 'cache' | 'network'

type SearchStatus = 'ok' | 'no_results' | 'rate_limited' | 'error'

type SearchSuggestion = AddressSelection & {
  label?: string
  confidence?: number
  matchType?: SuggestionMatchType
  normalizedQuery?: string
}

const MIN_QUERY_LENGTH = 2
const HIGH_CONFIDENCE_THRESHOLD = 0.88
const MID_CONFIDENCE_THRESHOLD = 0.7
const MAX_QUICK_PICK_COUNT = 3
const DEV_MODE = process.env.NODE_ENV === 'development'

export default function AddressAutocomplete({ label, placeholder, value, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inputState, setInputState] = useState<InputState>('idle')
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('ok')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [armedByEnter, setArmedByEnter] = useState(false)
  const [pendingEnterCommit, setPendingEnterCommit] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightQueryRef = useRef<string | null>(null)
  const requestTokenRef = useRef(0)
  const queryStartAtRef = useRef<number | null>(null)
  const firstSuggestionMsRef = useRef<number | null>(null)
  const enterCountRef = useRef(0)
  const autoCommitCountRef = useRef(0)
  const [highlight, setHighlight] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const listboxId = useId()
  const statusId = useId()

  const { getFromCache, getFromPrefixCache, setCache, checkRateLimit, recordApiCall } = usePoiCache()

  const debouncedQuery = useAdaptiveDebounce(query)
  const selectedLabel = value ? (value.name || value.address) : ''
  const visibleSuggestions = useMemo(
    () => (inputState === 'ambiguous' ? suggestions.slice(0, MAX_QUICK_PICK_COUNT) : suggestions),
    [inputState, suggestions]
  )

  const setFirstSuggestionMetric = () => {
    if (firstSuggestionMsRef.current !== null || queryStartAtRef.current === null) {
      return
    }
    firstSuggestionMsRef.current = Date.now() - queryStartAtRef.current
  }

  const reportMetrics = (commitMs: number | null) => {
    if (typeof window === 'undefined') return
    const metricsStore = ((window as any).__addressAutocompleteMetrics ??= {
      sessions: 0,
      totalEnterCount: 0,
      totalAutoCommitCount: 0,
      firstSuggestionMsSamples: [] as number[],
      commitMsSamples: [] as number[],
    })

    metricsStore.sessions += 1
    metricsStore.totalEnterCount = enterCountRef.current
    metricsStore.totalAutoCommitCount = autoCommitCountRef.current
    if (firstSuggestionMsRef.current !== null) {
      metricsStore.firstSuggestionMsSamples.push(firstSuggestionMsRef.current)
    }
    if (commitMs !== null) {
      metricsStore.commitMsSamples.push(commitMs)
    }
  }

  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '').trim()

  const estimateConfidence = (candidate: SearchSuggestion, rawQuery: string): number => {
    const normalizedQuery = normalize(rawQuery)
    const normalizedName = normalize(candidate.name || '')
    const normalizedAddress = normalize(candidate.address || '')
    if (!normalizedQuery) return 0

    if (normalizedName.startsWith(normalizedQuery)) return 0.93
    if (normalizedAddress.startsWith(normalizedQuery)) return 0.9
    if (normalizedName.includes(normalizedQuery)) return 0.82
    if (normalizedAddress.includes(normalizedQuery)) return 0.74
    return 0.58
  }

  const getCandidateConfidence = (candidate: SearchSuggestion, rawQuery: string): number => {
    if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
      return Math.max(0, Math.min(1, candidate.confidence))
    }
    return estimateConfidence(candidate, rawQuery)
  }

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < MIN_QUERY_LENGTH) {
      controllerRef.current?.abort()
      setLoading(false)
      setSuggestions([])
      setSearchStatus('ok')
      setStatusMessage('')
      setInputState(value ? 'committed' : 'idle')
      setArmedByEnter(false)
      return
    }

    if (!isEditing && selectedLabel && q === selectedLabel) {
      return
    }

    queryStartAtRef.current = Date.now()
    firstSuggestionMsRef.current = null
    setInputState('searching')
    setSearchStatus('ok')
    setStatusMessage('')

    const exactCachedResults = getFromCache(q) as SearchSuggestion[] | null
    const prefixCachedResults = exactCachedResults ? null : (getFromPrefixCache(q) as SearchSuggestion[] | null)
    const cachedResults = exactCachedResults ?? prefixCachedResults

    if (cachedResults) {
      setSuggestions(cachedResults)
      setFirstSuggestionMetric()
      setSearchStatus(cachedResults.length > 0 ? 'ok' : 'no_results')
      setInputState(cachedResults.length > 0 ? 'ready' : 'idle')
      if (isEditing) setOpen(true)
      return
    }

    if (checkRateLimit()) {
      setSuggestions([])
      setSearchStatus('rate_limited')
      setStatusMessage('요청이 많습니다. 잠시 후 다시 시도해 주세요.')
      setInputState('idle')
      return
    }

    if (inFlightQueryRef.current === q) {
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    inFlightQueryRef.current = q
    setLoading(true)

    const currentToken = requestTokenRef.current + 1
    requestTokenRef.current = currentToken

    fetch(`/api/poi-search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: { 'x-address-source': 'route-panel' },
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (currentToken !== requestTokenRef.current) {
          return null
        }

        if (!r.ok) {
          const status: SearchStatus = r.status === 429 ? 'rate_limited' : 'error'
          setSearchStatus(status)
          setStatusMessage(
            status === 'rate_limited' ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : '검색 중 문제가 발생했습니다.'
          )
          setSuggestions([])
          setInputState('idle')
          return null
        }
        return body
      })
      .then((d) => {
        if (!d) return
        const fetchedSuggestions = Array.isArray(d.suggestions) ? (d.suggestions as SearchSuggestion[]) : []
        const status = (d.status as SearchStatus | undefined) ?? (fetchedSuggestions.length > 0 ? 'ok' : 'no_results')
        setSearchStatus(status)
        setStatusMessage(getStatusMessage(status))
        setSuggestions(fetchedSuggestions)
        setInputState(fetchedSuggestions.length > 0 ? 'ready' : 'idle')

        if (fetchedSuggestions.length > 0) {
          setFirstSuggestionMetric()
          setCache(q, fetchedSuggestions)
          recordApiCall()
          if (isEditing) setOpen(true)
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || currentToken !== requestTokenRef.current) {
          return
        }
        if (DEV_MODE) {
          console.warn('[AddressAutocomplete] suggestion fetch failed:', err)
        }
        setSuggestions([])
        setSearchStatus('error')
        setStatusMessage('검색 중 문제가 발생했습니다.')
        setInputState('idle')
      })
      .finally(() => {
        if (currentToken === requestTokenRef.current) {
          inFlightQueryRef.current = null
          setLoading(false)
        }
      })
  }, [debouncedQuery, getFromCache, getFromPrefixCache, isEditing, selectedLabel, setCache, checkRateLimit, recordApiCall, value])

  const handleSelect = (s: SearchSuggestion, source: SuggestionSource | 'enter-auto' | 'enter-confirm' | 'enter-pending') => {
    onSelect(s)

    let label = s.name && s.name.trim().length > 0 ? s.name : (s.address || '')

    if (label.endsWith('역') && label.length > 1) {
      const withoutLast = label.slice(0, -1)
      if (withoutLast.endsWith('역')) {
        label = withoutLast
      }
    }

    setQuery(label)
    setOpen(false)
    setSuggestions([])
    setHighlight(0)
    setIsEditing(false)
    setInputState('committed')
    setArmedByEnter(false)
    setPendingEnterCommit(false)
    setStatusMessage('')

    if (source === 'enter-auto' || source === 'enter-pending') {
      autoCommitCountRef.current += 1
    }

    const commitMs = queryStartAtRef.current ? Date.now() - queryStartAtRef.current : null
    reportMetrics(commitMs)

    if (DEV_MODE) {
      const autoCommitRate =
        enterCountRef.current > 0 ? Math.round((autoCommitCountRef.current / enterCountRef.current) * 100) : 0
      console.debug('[AddressAutocomplete][metrics]', {
        firstSuggestionMs: firstSuggestionMsRef.current,
        commitMs,
        autoCommitRatePercent: autoCommitRate,
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (visibleSuggestions.length === 0) return
      e.preventDefault()
      setOpen(true)
      setArmedByEnter(false)
      setHighlight((h) => Math.min(h + 1, visibleSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      if (visibleSuggestions.length === 0) return
      e.preventDefault()
      setOpen(true)
      setArmedByEnter(false)
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (query.trim().length < MIN_QUERY_LENGTH) return
      e.preventDefault()
      enterCountRef.current += 1

      if (visibleSuggestions.length === 0) {
        setOpen(true)
        setPendingEnterCommit(true)
        setStatusMessage('검색 중입니다. 결과가 도착하면 자동 확정합니다.')
        return
      }

      const safeIndex = Math.max(0, Math.min(highlight, visibleSuggestions.length - 1))
      const selectedCandidate = visibleSuggestions[safeIndex]
      const confidence = getCandidateConfidence(selectedCandidate, query)

      if (armedByEnter || inputState === 'ambiguous') {
        handleSelect(selectedCandidate, 'enter-confirm')
        return
      }

      if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        handleSelect(selectedCandidate, 'enter-auto')
        return
      }

      if (confidence >= MID_CONFIDENCE_THRESHOLD) {
        setInputState('ambiguous')
        setArmedByEnter(true)
        setOpen(true)
        setHighlight(0)
        setStatusMessage('유사 결과입니다. Enter 한 번 더 누르면 상단 결과로 확정됩니다.')
        return
      }

      setOpen(true)
      setInputState('ready')
      setPendingEnterCommit(false)
      setStatusMessage('정확한 항목을 선택해 주세요.')
    } else if (e.key === 'Escape') {
      setOpen(false)
      setArmedByEnter(false)
      setPendingEnterCommit(false)
    }
  }

  useEffect(() => {
    if (!pendingEnterCommit) return

    // "새 입력 후 바로 Enter" UX 우선:
    // 결과가 도착하면 신뢰도와 무관하게 1순위를 우선 확정한다.
    if (suggestions.length > 0) {
      handleSelect(suggestions[0], 'enter-pending')
      return
    }

    // 결과가 없고 검색이 끝난 경우에는 pending 상태를 해제하고 안내한다.
    if (!loading && (searchStatus === 'no_results' || searchStatus === 'error' || searchStatus === 'rate_limited')) {
      setPendingEnterCommit(false)
      setInputState('ready')
      setOpen(true)
      setStatusMessage(getStatusMessage(searchStatus) || '정확한 항목을 선택해 주세요.')
    }
  }, [pendingEnterCommit, suggestions, loading, searchStatus, query])

  useEffect(() => {
    if (isEditing && (loading || suggestions.length > 0)) {
      setOpen(true)
      if (highlight >= visibleSuggestions.length) {
        setHighlight(0)
      }
    } else {
      setOpen(false)
    }
  }, [suggestions, isEditing, loading, highlight, visibleSuggestions.length])

  useEffect(() => {
    if (value) {
      const newQuery = value.name || value.address
      if (query !== newQuery) {
        setQuery(newQuery)
      }
      setInputState('committed')
    } else {
      setInputState(query.trim().length >= MIN_QUERY_LENGTH ? 'searching' : 'idle')
    }
  }, [value, query])

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  return (
    <div className="w-full relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && visibleSuggestions[highlight] ? `${listboxId}-option-${highlight}` : undefined}
        aria-describedby={statusMessage ? statusId : undefined}
        aria-busy={loading}
        value={query}
        onChange={(e) => {
          const newValue = e.target.value
          setQuery(newValue)
          setArmedByEnter(false)
          setPendingEnterCommit(false)
          setStatusMessage('')
          setSearchStatus('ok')
          if (newValue.trim().length >= MIN_QUERY_LENGTH) {
            setInputState('searching')
          }

          if (value && newValue !== (value.name || value.address)) {
            onSelect(null)
          }
          setIsEditing(newValue.trim().length >= MIN_QUERY_LENGTH)
        }}
        onFocus={() => {
          if (query.trim().length >= MIN_QUERY_LENGTH && (isEditing || suggestions.length > 0 || loading)) {
            setOpen(true)
          }
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-11 border rounded px-3"
        role="combobox"
      />
      {loading && <div className="absolute right-2 top-9 text-xs text-gray-500">검색중...</div>}
      {open && (
        <ul id={listboxId} className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto" role="listbox">
          {visibleSuggestions.map((s, i) => (
            <li
              id={`${listboxId}-option-${i}`}
              key={`${s.address}-${i}-${s.name}`}
              role="option"
              aria-selected={i === highlight}
              onPointerDown={(e) => {
                e.preventDefault()
                handleSelect(s, 'network')
              }}
              className={`px-3 py-2 cursor-pointer ${i === highlight ? 'bg-gray-100' : ''}`}
            >
              <div className="text-sm font-medium">{s.name || s.label || s.address}</div>
              {s.name && (
                <div className="text-xs text-gray-600">{s.address}</div>
              )}
            </li>
          ))}
          {visibleSuggestions.length === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-gray-500">{getStatusMessage(searchStatus)}</li>
          )}
        </ul>
      )}
      {statusMessage && (
        <div id={statusId} className="mt-1 text-[11px] text-gray-500" aria-live="polite">
          {statusMessage}
        </div>
      )}
      {value && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-700 flex-nowrap min-w-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">확정됨</span>
          <span className="flex-1 min-w-0 truncate" title={`${value.address} (${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)})`}>
            {value.address}
          </span>
          <button
            type="button"
            className="ml-auto px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 whitespace-nowrap"
            title="주소 복사"
            onClick={() => navigator.clipboard?.writeText(value.address).catch(() => { })}
          >
            복사
          </button>
        </div>
      )}
    </div>
  )
}

function getStatusMessage(status: SearchStatus): string {
  if (status === 'rate_limited') return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  if (status === 'error') return '검색 중 문제가 발생했습니다.'
  if (status === 'no_results') return '검색 결과 없음'
  return ''
}

function getDebounceDelay(query: string): number {
  const len = query.trim().length
  if (len <= 2) return 230
  if (len <= 4) return 180
  return 140
}

function useAdaptiveDebounce(val: string) {
  const delay = getDebounceDelay(val)
  return useDebounce(val, delay)
}

function useDebounce<T>(val: T, ms: number) {
  const [v, setV] = useState(val)
  useEffect(() => {
    const t = setTimeout(() => setV(val), ms)
    return () => clearTimeout(t)
  }, [val, ms])
  return v
}
