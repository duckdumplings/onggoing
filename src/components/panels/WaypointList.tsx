'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';

// 배송완료시간 검증 함수들 (자동 다음날 배송 추론 고려)
function isValidDeliveryTime(timeString: string, hasAnyDeliveryTime: boolean = false): boolean {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const inputTimeInMinutes = hours * 60 + minutes;

  // 자동 다음날 배송 추론: 일부 경유지에 배송완료시간이 있으면 모든 경유지를 다음날 배송으로 판단
  if (hasAnyDeliveryTime) {
    // 다음날 배송이므로 24시간 후까지 허용
    if (inputTimeInMinutes > currentTimeInMinutes + 24 * 60) {
      return false;
    }
    return true;
  }

  // 당일 배송인 경우: 과거 시간 체크 (현재 시간보다 30분 이전)
  if (inputTimeInMinutes < currentTimeInMinutes - 30) {
    return false;
  }

  // 비현실적인 시간 체크 (24시간 후)
  if (inputTimeInMinutes > currentTimeInMinutes + 24 * 60) {
    return false;
  }

  return true;
}

function getDeliveryTimeValidationMessage(timeString: string, hasAnyDeliveryTime: boolean = false): string {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const inputTimeInMinutes = hours * 60 + minutes;

  // 자동 다음날 배송 추론: 일부 경유지에 배송완료시간이 있으면 모든 경유지를 다음날 배송으로 판단
  if (hasAnyDeliveryTime) {
    if (inputTimeInMinutes > currentTimeInMinutes + 24 * 60) {
      return '24시간 이후의 시간입니다. 현실적인 시간으로 설정해주세요.';
    }
    return '';
  }

  // 당일 배송인 경우
  if (inputTimeInMinutes < currentTimeInMinutes - 30) {
    return '과거 시간입니다. 현재 시간 이후로 설정해주세요.';
  }

  if (inputTimeInMinutes > currentTimeInMinutes + 24 * 60) {
    return '24시간 이후의 시간입니다. 현실적인 시간으로 설정해주세요.';
  }

  return '';
}

export interface Waypoint {
  id: string;
  selection: AddressSelection | null;
  dwellTime: number;
  deliveryTime?: string; // 배송완료시간 (24시간 형식: "14:30")
  isNextDay?: boolean; // 다음날 배송 여부
}

interface WaypointListProps {
  waypoints: Waypoint[];
  onWaypointsChange: (waypoints: Waypoint[]) => void;
  hasAnyDeliveryTime?: boolean; // 자동 다음날 배송 추론을 위한 플래그
  errorByIndex?: Record<number, string>; // 인라인 에러 표시용
}

interface SortableWaypointItemProps {
  waypoint: Waypoint;
  index: number;
  onUpdate: (id: string, updates: Partial<Waypoint>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  hasAnyDeliveryTime?: boolean; // 자동 다음날 배송 추론을 위한 플래그
  errorByIndex?: Record<number, string>;
}

function SortableWaypointItem({ waypoint, index, onUpdate, onDelete, onDuplicate, hasAnyDeliveryTime = false, errorByIndex }: SortableWaypointItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: waypoint.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 bg-white rounded-xl border transition-all duration-200 group ${isDragging
        ? 'shadow-xl border-indigo-300 ring-2 ring-indigo-100'
        : 'border-slate-200 hover:border-indigo-200 hover:shadow-md'
        }`}
    >
      <div className="flex items-start gap-3">
        {/* 드래그 핸들 */}
        <div
          {...attributes}
          {...listeners}
          className="w-6 h-6 mt-1 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 transition-colors"
          title="드래그하여 순서 변경"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {/* 주소 입력 */}
        <div className="flex-1 space-y-2">
          <AddressAutocomplete
            label={`경유지 ${index + 1}`}
            placeholder="목적지를 검색하세요"
            value={waypoint.selection}
            onSelect={(selection) => onUpdate(waypoint.id, { selection })}
          />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
              <label className="text-[10px] font-semibold text-slate-500">체류</label>
              <input
                type="number"
                min="0"
                step="5"
                value={waypoint.dwellTime}
                onChange={(e) => {
                  const value = Math.max(0, parseInt(e.target.value || '10', 10));
                  onUpdate(waypoint.id, { dwellTime: value });
                }}
                className="w-12 h-6 bg-transparent text-xs text-center focus:outline-none border-b border-transparent focus:border-indigo-500 transition-colors font-medium text-slate-700"
              />
              <span className="text-[10px] text-slate-400">분</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
              <label className="text-[10px] font-semibold text-slate-500">도착</label>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  value={waypoint.deliveryTime || ''}
                  onChange={(e) => {
                    const timeValue = e.target.value || undefined;
                    onUpdate(waypoint.id, { deliveryTime: timeValue });
                  }}
                  className={`w-20 h-6 bg-transparent text-xs focus:outline-none border-b border-transparent focus:border-indigo-500 transition-colors font-medium ${waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime)
                    ? 'text-rose-600'
                    : 'text-slate-700'
                    }`}
                  placeholder="선택"
                />
                {waypoint.deliveryTime && (
                  <button
                    type="button"
                    onClick={() => onUpdate(waypoint.id, { deliveryTime: undefined, isNextDay: false })}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                    title="시간 초기화"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 에러 메시지 */}
          {(waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime)) || (errorByIndex && errorByIndex[index]) ? (
            <div className="text-[10px] text-rose-600 font-medium bg-rose-50 px-2 py-1 rounded border border-rose-100 animate-in fade-in slide-in-from-top-1">
              {waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime)
                ? getDeliveryTimeValidationMessage(waypoint.deliveryTime, hasAnyDeliveryTime)
                : errorByIndex?.[index]}
            </div>
          ) : null}
        </div>

        {/* 액션 버튼들 */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
            onClick={() => onDuplicate(waypoint.id)}
            aria-label="경유지 추가"
            title="아래에 추가"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-colors"
            onClick={() => onDelete(waypoint.id)}
            aria-label="경유지 삭제"
            title="삭제"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WaypointList({ waypoints, onWaypointsChange, hasAnyDeliveryTime = false, errorByIndex }: WaypointListProps) {
  // 클라이언트 전용 렌더링을 위한 상태
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = waypoints.findIndex(w => w.id === active.id);
      const newIndex = waypoints.findIndex(w => w.id === over?.id);

      const newWaypoints = arrayMove(waypoints, oldIndex, newIndex);
      onWaypointsChange(newWaypoints);
    }
  }, [waypoints, onWaypointsChange]);

  const handleUpdate = useCallback((id: string, updates: Partial<Waypoint>) => {
    const newWaypoints = waypoints.map(w =>
      w.id === id ? { ...w, ...updates } : w
    );
    onWaypointsChange(newWaypoints);
  }, [waypoints, onWaypointsChange]);

  const handleDelete = useCallback((id: string) => {
    const newWaypoints = waypoints.filter(w => w.id !== id);
    onWaypointsChange(newWaypoints);
  }, [waypoints, onWaypointsChange]);

  const handleDuplicate = useCallback((id: string) => {
    // 복제 대신 "빈 경유지 추가" 동작으로 변경
    const insertIndex = waypoints.findIndex(w => w.id === id) + 1;
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      selection: null,
      dwellTime: 10,
      deliveryTime: undefined,
      isNextDay: false,
    };
    const newWaypoints = [
      ...waypoints.slice(0, insertIndex),
      newWaypoint,
      ...waypoints.slice(insertIndex)
    ];
    onWaypointsChange(newWaypoints);
  }, [waypoints, onWaypointsChange]);

  const handleAddWaypoint = useCallback(() => {
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      selection: null,
      dwellTime: 10,
      deliveryTime: undefined,
      isNextDay: false,
    };

    onWaypointsChange([...waypoints, newWaypoint]);
  }, [waypoints, onWaypointsChange]);

  // 서버사이드 렌더링 시 기본 UI만 표시 (기능 없이)
  if (!isClient) {
    return (
      <div className="space-y-3">
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="p-3 bg-white rounded-xl border border-slate-200">
            {/* SSR Fallback Content */}
            Loading...
          </div>
        ))}
      </div>
    );
  }

  // 클라이언트에서만 드래그 앤 드롭 기능 활성화
  return (
    <div className="space-y-3">
      {waypoints.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group" onClick={handleAddWaypoint}>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </div>
          <p className="text-sm font-bold text-slate-600">경유지가 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">클릭하여 첫 번째 경유지를 추가하세요</p>
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={waypoints.map(w => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {waypoints.map((waypoint, index) => (
                <SortableWaypointItem
                  key={waypoint.id}
                  waypoint={waypoint}
                  index={index}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  hasAnyDeliveryTime={hasAnyDeliveryTime}
                  errorByIndex={errorByIndex}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          <button
            type="button"
            onClick={handleAddWaypoint}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 text-xs font-bold group"
          >
            <span className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">＋</span>
            경유지 추가하기
          </button>
        </>
      )}
    </div>
  );
}
