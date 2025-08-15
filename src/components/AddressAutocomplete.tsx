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
  onSelect: (v: AddressSelection) => void
}

export default function AddressAutocomplete({ label, placeholder, value, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<(AddressSelection & { label?: string })[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const [highlight, setHighlight] = useState(0)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    fetch(`/api/poi-search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('검색 실패'))))
      .then((d) => Array.isArray(d.suggestions) ? setSuggestions(d.suggestions) : setSuggestions([]))
      .catch(() => { setSuggestions([]) })
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  const handleSelect = (s: AddressSelection) => {
    onSelect(s)
    // 입력란에는 상호명이 있으면 상호명 우선 표시
    const label = s.name && s.name.trim().length > 0 ? s.name : (s.address || '')
    setQuery(label)
    setOpen(false)
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
      handleSelect(suggestions[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    setOpen(suggestions.length > 0)
    setHighlight(0)
  }, [suggestions])

  useEffect(() => {
    if (value) setQuery(value.name || value.address)
  }, [value])

  return (
    <div className="w-full relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border rounded px-3 py-2"
        // 첫 클릭 시 즉시 선택 가능하도록: mousedown에서 blur 방지
        onMouseDown={(e) => {
          // 입력 클릭 시 드롭다운 유지
          if (open) e.preventDefault()
        }}
      />
      {loading && <div className="absolute right-2 top-9 text-xs text-gray-500">검색중...</div>}
      {open && (
        <ul className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto">
          {suggestions.map((s, i) => (
            <li
              key={`${s.address}-${i}`}
              // 항목 클릭 시 포커스/블러 타이밍 이슈 방지: mousedown에서 기본동작 막기
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
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




