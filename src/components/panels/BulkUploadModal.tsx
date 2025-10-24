'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { AddressSelection } from '@/components/AddressAutocomplete';

export type BulkRow = {
  role?: 'start' | 'stop' | 'end';
  address?: string;
  deliveryTime?: string; // HH:mm (stop/end)
  departureTime?: string; // HH:mm (start)
  dwellMinutes?: number;
  name?: string;
  memo?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rows: Array<{ role: 'start' | 'stop' | 'end'; selection: AddressSelection | null; dwellTime: number; deliveryTime?: string; departureTime?: string; meta?: Record<string, string> }>) => void;
};

const headerAliases: Record<string, keyof BulkRow | 'meta'> = {
  // role/address
  role: 'role', 유형: 'role', 구분: 'role', 구분값: 'role',
  address: 'address', 주소: 'address', 위치: 'address', place: 'address', address1: 'address',
  // delivery/departure
  delivery: 'deliveryTime', deliverytime: 'deliveryTime', duetime: 'deliveryTime', due: 'deliveryTime', 배송완료시간: 'deliveryTime', 도착시간: 'deliveryTime', 완료시간: 'deliveryTime',
  departure: 'departureTime', departuretime: 'departureTime', 출발시간: 'departureTime',
  // dwell
  dwell: 'dwellMinutes', dwellminutes: 'dwellMinutes', 체류시간: 'dwellMinutes', 대기시간: 'dwellMinutes',
  // meta-like common columns
  name: 'name', 고객명: 'name', memo: 'memo', 메모: 'memo'
};

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
}

async function parseFile(file: File): Promise<{ headers: string[]; rows: any[] } | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === 'csv') {
    const Papa = (await import('papaparse')).default;
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res: any) => {
          const rows = res.data as any[];
          const headers = res.meta?.fields ?? Object.keys(rows[0] || {});
          resolve({ headers, rows });
        }
      });
    });
  }
  if (['xlsx', 'xls'].includes(ext)) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
    const headers = Object.keys(json[0] || {});
    return { headers, rows: json };
  }
  return null;
}

async function geocodeAddress(address: string): Promise<AddressSelection | null> {
  try {
    const res = await fetch(`/api/poi-search?q=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const s = data?.suggestions?.[0];
    if (!s) return null;
    return { latitude: s.latitude, longitude: s.longitude, address: s.address || address, name: s.name || address };
  } catch {
    return null;
  }
}

export default function BulkUploadModal({ isOpen, onClose, onApply }: Props) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, keyof BulkRow | ''>>({});
  const [loading, setLoading] = useState(false);
  const [aiSuggest, setAiSuggest] = useState<{ mapping: Record<string, string>; reasons: Record<string, string> } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const downloadTemplateXlsx = useCallback(async () => {
    const XLSX = await import('xlsx');
    const headers = ['role(start|stop|end)', 'address(주소)', 'departureTime(HH:mm)', 'deliveryTime(HH:mm)', 'dwellMinutes(분)', 'name(고객명,메타)', 'memo(메모,메타)'];
    const sample = [
      { 'role(start|stop|end)': 'start', 'address(주소)': '서울특별시 종로구 세종대로 175', 'departureTime(HH:mm)': '09:00', 'deliveryTime(HH:mm)': '', 'dwellMinutes(분)': 10, 'name(고객명,메타)': '출발지', 'memo(메모,메타)': '' },
      { 'role(start|stop|end)': 'stop', 'address(주소)': '서울특별시 중구 을지로 100', 'departureTime(HH:mm)': '', 'deliveryTime(HH:mm)': '14:30', 'dwellMinutes(분)': 10, 'name(고객명,메타)': '고객A', 'memo(메모,메타)': '문 앞 보관' },
      { 'role(start|stop|end)': 'stop', 'address(주소)': '', 'departureTime(HH:mm)': '', 'deliveryTime(HH:mm)': '', 'dwellMinutes(분)': 10, 'name(고객명,메타)': '', 'memo(메모,메타)': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'ongoing_waypoints_template.xlsx');
  }, []);

  const downloadTemplateCsv = useCallback(() => {
    const headers = ['role(start|stop|end)', 'address(주소)', 'departureTime(HH:mm)', 'deliveryTime(HH:mm)', 'dwellMinutes(분)', 'name(고객명,메타)', 'memo(메모,메타)'];
    const rows = [
      ['start', '서울특별시 종로구 세종대로 175', '09:00', '', '10', '출발지', ''],
      ['stop', '서울특별시 중구 을지로 100', '', '14:30', '10', '고객A', '문 앞 보관'],
      ['stop', '', '', '', '10', '', '']
    ];
    const csv = [headers.join(','), ...rows.map(row => row.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ongoing_waypoints_template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const autoMap = useCallback((hdrs: string[]) => {
    const m: Record<string, keyof BulkRow | ''> = {};
    hdrs.forEach(h => {
      const key = headerAliases[normalizeHeader(h)];
      if (key) m[h] = key;
      else m[h] = '';
    });
    return m;
  }, []);

  const handleFile = useCallback(async (f: File | null) => {
    if (!f) return;
    const parsed = await parseFile(f);
    if (!parsed) return;
    const max = 1000;
    const limited = parsed.rows.slice(0, max);
    if (parsed.rows.length > max) alert(`행이 ${parsed.rows.length}개입니다. 1,000행까지만 로드합니다(지오코딩 비용/시간 보호).`);
    setHeaders(parsed.headers);
    setRows(limited);
    setMapping(autoMap(parsed.headers));
    setAiSuggest(null);
  }, [autoMap]);

  const preview: BulkRow[] = useMemo(() => {
    if (!headers.length) return [];
    return rows.slice(0, 50).map(r => {
      const obj: BulkRow = {};
      headers.forEach(h => {
        const key = mapping[h];
        if (!key) return;
        const v = r[h];
        if (key === 'dwellMinutes') obj[key] = Number(v);
        else obj[key] = typeof v === 'string' ? v.trim() : String(v);
      });
      return obj;
    });
  }, [headers, rows, mapping]);

  const apply = useCallback(async () => {
    // build rows and geocode if needed
    setLoading(true);
    const out: Array<{ role: 'start' | 'stop' | 'end'; selection: AddressSelection | null; dwellTime: number; deliveryTime?: string; departureTime?: string; meta?: Record<string, string> }> = [];
    for (const r of preview) {
      const role = (r.role as any) || 'stop';
      let selection: AddressSelection | null = null;
      if (r.address) {
        selection = await geocodeAddress(r.address);
      }
      const meta: Record<string, string> = {};
      if (r.name) meta.name = r.name;
      if (r.memo) meta.memo = r.memo;
      out.push({ role: role as any, selection, dwellTime: Number.isFinite(r.dwellMinutes as number) ? Math.max(5, r.dwellMinutes as number) : 10, deliveryTime: r.deliveryTime, departureTime: r.departureTime, meta });
    }
    setLoading(false);
    onApply(out);
    onClose();
  }, [preview, onApply, onClose]);

  const askAI = useCallback(async () => {
    if (!headers.length) return;
    setLoading(true);
    try {
      const body = { headers, rows: rows.slice(0, 20) };
      const res = await fetch('/api/bulk-analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data?.mapping) {
        // 제안만 표시, 적용은 사용자가 클릭
        setAiSuggest({ mapping: data.mapping, reasons: data.reasons || {} });
      }
    } finally {
      setLoading(false);
    }
  }, [headers, rows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white w-[720px] max-w-[95vw] rounded-xl shadow-xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">경유지 일괄 업로드</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-sm border rounded" onClick={onClose}>닫기</button>
            <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50" disabled={!headers.length || loading} onClick={apply}>{loading ? '적용 중…' : '적용'}</button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleFile(e.target.files?.[0] || null)} className="hidden" />
        <div className="p-3 bg-gray-50 rounded border border-gray-200 mb-3 text-sm">
          <div className="flex items-center justify-between">
            <span>CSV 또는 Excel(xlsx) 파일을 업로드하세요</span>
            <div className="flex gap-2">
              {headers.length > 0 && (
                <button className="px-3 py-1 border rounded bg-white" onClick={askAI} disabled={loading}>{loading ? '분석 중…' : 'AI 매핑 제안'}</button>
              )}
              <button className="px-3 py-1 border rounded bg-white" onClick={downloadTemplateXlsx}>템플릿(xlsx)</button>
              <button className="px-3 py-1 border rounded bg-white" onClick={downloadTemplateCsv}>샘플(csv)</button>
              <button className="px-3 py-1 border rounded bg-white" onClick={openPicker}>파일 선택</button>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">필수 규칙: 주소 또는 (위도+경도) 중 하나는 반드시 포함. 배송완료시간은 HH:mm, 체류시간은 분 단위.</div>
        </div>

        {headers.length > 0 && (
          <div className="space-y-3">
            <div className="overflow-auto">
              <table className="w-full text-xs border">
                <thead>
                  <tr>
                    {headers.map(h => (
                      <th key={h} className="p-2 border bg-gray-50 text-left">
                        <div className="flex items-center gap-2">
                          <span>{h}</span>
                          <select
                            className="border rounded px-1 py-0.5"
                            value={mapping[h] ?? ''}
                            onChange={(e) => setMapping(prev => ({ ...prev, [h]: e.target.value as any }))}
                          >
                            <option value="">(무시)</option>
                            <option value="address">주소</option>
                            <option value="latitude">위도</option>
                            <option value="longitude">경도</option>
                            <option value="deliveryTime">배송완료시간(HH:mm)</option>
                            <option value="dwellMinutes">체류시간(분)</option>
                            <option value="meta">메타로 보존</option>
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      {headers.map(h => (
                        <td key={h} className="p-1 border text-gray-700">{String(rows[i]?.[h] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {aiSuggest && (
              <div className="text-xs bg-blue-50 border border-blue-100 p-2 rounded">
                <div className="font-medium text-blue-900 mb-1">AI 매핑 제안</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {headers.map(h => (
                    <div key={h} className="flex items-center justify-between gap-2">
                      <span className="text-gray-700">{h}</span>
                      <span className="text-blue-800">→ {aiSuggest.mapping[h] || '(제안없음)'}{aiSuggest.reasons[h] ? ` · ${aiSuggest.reasons[h]}` : ''}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="px-2 py-1 border rounded bg-white" onClick={() => setAiSuggest(null)}>닫기</button>
                  <button className="px-2 py-1 border rounded bg-blue-600 text-white" onClick={() => {
                    const m: Record<string, any> = { ...mapping };
                    headers.forEach(h => { if (aiSuggest.mapping[h]) m[h] = aiSuggest.mapping[h] as any; });
                    setMapping(m);
                  }}>제안 적용</button>
                </div>
              </div>
            )}
            <div className="text-xs text-gray-500">미리보기: {Math.min(preview.length, 10)} / {rows.length}행</div>
          </div>
        )}
      </div>
    </div>
  );
}


