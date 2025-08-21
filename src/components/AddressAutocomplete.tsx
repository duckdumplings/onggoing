'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react'

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

export default function AddressAutocomplete({ label, placeholder, value, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<(AddressSelection & { label?: string })[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [isEditing, setIsEditing] = useState(false) // 수정 모드 상태 추가

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    const q = debouncedQuery.trim()
    console.log('[AddressAutocomplete] Query changed:', q) // 디버깅 로그
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    console.log('[AddressAutocomplete] Starting fetch for:', q) // 디버깅 로그
    fetch(`/api/poi-search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((r) => {
        console.log('[AddressAutocomplete] Fetch response:', r.status, r.ok) // 디버깅 로그
        return r.ok ? r.json() : Promise.reject(new Error('검색 실패'))
      })
      .then((d) => {
        console.log('[AddressAutocomplete] Fetch data:', d) // 디버깅 로그
        return Array.isArray(d.suggestions) ? setSuggestions(d.suggestions) : setSuggestions([])
      })
      .catch((err) => {
        console.log('[AddressAutocomplete] Fetch error:', err) // 디버깅 로그
        setSuggestions([])
      })
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  const handleSelect = (s: AddressSelection) => {
    console.log('[AddressAutocomplete] handleSelect called with:', s)
    onSelect(s)
    // 입력란에는 상호명이 있으면 상호명 우선 표시
    const label = s.name && s.name.trim().length > 0 ? s.name : (s.address || '')
    console.log('[AddressAutocomplete] Setting query to:', label)
    setQuery(label)
    setOpen(false)
    setSuggestions([]) // 선택 후 제안 목록 비우기
    setHighlight(0) // 하이라이트 초기화
    setIsEditing(false) // 수정 모드 해제
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      console.log('[AddressAutocomplete] Enter pressed:', {
        highlight,
        suggestionsLength: suggestions.length,
        selectedItem: suggestions[highlight]
      })

      // 안전한 인덱스 체크
      if (highlight >= 0 && highlight < suggestions.length && suggestions[highlight]) {
        handleSelect(suggestions[highlight])
      } else {
        console.warn('[AddressAutocomplete] Invalid highlight index or empty suggestion')
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    // 수정 모드일 때만 드롭다운 열기 (재열림 방지)
    if (suggestions.length > 0 && isEditing) {
      setOpen(true)
      setHighlight(0) // 드롭다운이 열릴 때만 하이라이트 초기화
      console.log('[AddressAutocomplete] Dropdown opened with suggestions:', suggestions.length)
    } else {
      setOpen(false)
    }
  }, [suggestions, isEditing])

  useEffect(() => {
    console.log('[AddressAutocomplete] value changed:', value)
    if (value) {
      const newQuery = value.name || value.address
      console.log('[AddressAutocomplete] Setting query from value:', newQuery)
      setQuery(newQuery)
    } else {
      // value가 null로 변경되는 것을 방지
      console.log('[AddressAutocomplete] Ignoring null value change to prevent UI reset')
      // setQuery('') // 주석 처리하여 query 상태 유지
    }
  }, [value])

  return (
    <div className="w-full relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={query}
        onChange={(e) => {
          const newValue = e.target.value
          setQuery(newValue)

          // 입력값이 기존 선택과 다르면 수정 모드 활성화
          if (value && newValue !== (value.name || value.address)) {
            setIsEditing(true)
            onSelect(null) // 선택 초기화
          } else if (!value && newValue.length >= 2) {
            // 새로운 검색 시작
            setIsEditing(true)
          }
        }}
        onFocus={() => {
          // 수정 모드일 때만 드롭다운 열기
          if (suggestions.length > 0 && isEditing) {
            setOpen(true)
          }
        }}
        onBlur={() => {
          // 약간의 지연을 두어 클릭 이벤트가 처리될 시간을 줌
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-11 border rounded px-3"
      />
      {loading && <div className="absolute right-2 top-9 text-xs text-gray-500">검색중...</div>}
      {open && (
        <ul className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={`${s.address}-${i}`}
              role="option"
              onPointerDown={(e) => { e.preventDefault(); handleSelect(s) }}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              onClick={(e) => { e.preventDefault(); handleSelect(s) }}
              className={`px-3 py-2 cursor-pointer ${i === highlight ? 'bg-gray-100' : ''}`}
            >
              <div className="text-sm font-medium">{s.name || s.label || s.address}</div>
              {s.name && (
                <div className="text-xs text-gray-600">{s.address}</div>
              )}
            </li>
          ))}
          {suggestions.length === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-gray-500">검색 결과 없음</li>
          )}
        </ul>
      )}
      {value && (
        <div className="mt-2 text-xs text-gray-600">
          확정: {value.address} ({value.latitude.toFixed(5)}, {value.longitude.toFixed(5)})
        </div>
      )}
    </div>
  )
}

function useDebounce<T>(val: T, ms: number) {
  const [v, setV] = useState(val)
  useEffect(() => {
    const t = setTimeout(() => setV(val), ms)
    return () => clearTimeout(t)
  }, [val, ms])
  return v
}




