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
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 bg-gray-50/30 rounded-lg border border-gray-100 hover:bg-gray-50/50 hover:border-gray-200 hover:shadow-sm transition-all duration-200 ${isDragging ? 'shadow-lg' : ''
        }`}
    >
      <div className="flex items-start gap-2">
        {/* 드래그 핸들 */}
        <div
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors"
          title="드래그하여 순서 변경"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {/* 주소 입력 */}
        <div className="flex-1">
          <AddressAutocomplete
            label={`경유지 ${index + 1}`}
            placeholder="목적지를 검색하세요"
            value={waypoint.selection}
            onSelect={(selection) => onUpdate(waypoint.id, { selection })}
          />
          <div className="mt-1 flex gap-4">
            <div>
              <label className="text-xs text-gray-600 mr-2">체류시간</label>
              <input
                type="number"
                min="0"
                step="5"
                value={waypoint.dwellTime}
                onChange={(e) => {
                  const value = Math.max(0, parseInt(e.target.value || '10', 10));
                  onUpdate(waypoint.id, { dwellTime: value });
                }}
                className="w-24 h-8 border rounded px-2 text-sm"
              />
              <span className="ml-1 text-xs text-gray-500">분</span>
            </div>
            <div>
              <label className="text-xs text-gray-600 mr-2">배송완료시간</label>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  value={waypoint.deliveryTime || ''}
                  onChange={(e) => {
                    const timeValue = e.target.value || undefined;
                    onUpdate(waypoint.id, { deliveryTime: timeValue });
                  }}
                  className={`w-32 h-8 border rounded px-2 text-sm ${waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime)
                    ? 'border-red-300 bg-red-50'
                    : ''
                    }`}
                  placeholder="선택사항"
                />
                {waypoint.deliveryTime && (
                  <button
                    type="button"
                    onClick={() => onUpdate(waypoint.id, { deliveryTime: undefined, isNextDay: false })}
                    className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="시간 초기화"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* 다음날 체크박스 */}
              {waypoint.deliveryTime && (
                <div className="flex items-center gap-1 mt-1">
                </div>
              )}
              {waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime) && (
                <div className="text-xs text-red-600 mt-1">
                  {getDeliveryTimeValidationMessage(waypoint.deliveryTime, hasAnyDeliveryTime)}
                </div>
              )}
              {errorByIndex && errorByIndex[index] && (
                <div className="text-xs text-red-600 mt-1">
                  {errorByIndex[index]}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="w-20 flex justify-end pt-6 gap-1">
          <button
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 text-sm leading-none hover:bg-gray-50"
            onClick={() => onDuplicate(waypoint.id)}
            aria-label="경유지 추가"
            title="경유지 추가"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-300 bg-white text-red-600 text-sm leading-none hover:bg-red-50"
            onClick={() => onDelete(waypoint.id)}
            aria-label="경유지 삭제"
            title="삭제"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
      <div className="space-y-4">
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="p-3 bg-gray-50/30 rounded-lg border border-gray-100">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 flex items-center justify-center text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                </svg>
              </div>
              <div className="flex-1">
                <AddressAutocomplete
                  label={`경유지 ${index + 1}`}
                  placeholder="목적지를 검색하세요"
                  value={waypoint.selection}
                  onSelect={() => { }} // 서버사이드에서는 빈 함수
                />
                <div className="mt-1 flex gap-4">
                  <div>
                    <label className="text-xs text-gray-600 mr-2">체류시간</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={waypoint.dwellTime}
                      onChange={() => { }} // 서버사이드에서는 빈 함수
                      className="w-24 h-8 border rounded px-2 text-sm"
                    />
                    <span className="ml-1 text-xs text-gray-500">분</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mr-2">배송완료시간</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        value={waypoint.deliveryTime || ''}
                        onChange={() => { }} // 서버사이드에서는 빈 함수
                        className={`w-32 h-8 border rounded px-2 text-sm ${waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime)
                          ? 'border-red-300 bg-red-50'
                          : ''
                          }`}
                        placeholder="선택사항"
                      />
                      {waypoint.deliveryTime && (
                        <button
                          type="button"
                          onClick={() => { }} // 서버사이드에서는 빈 함수
                          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="시간 초기화"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* 다음날 체크박스 (서버사이드) */}
                    {waypoint.deliveryTime && (
                      <div className="flex items-center gap-1 mt-1">
                      </div>
                    )}
                    {waypoint.deliveryTime && !isValidDeliveryTime(waypoint.deliveryTime, hasAnyDeliveryTime) && (
                      <div className="text-xs text-red-600 mt-1">
                        {getDeliveryTimeValidationMessage(waypoint.deliveryTime, hasAnyDeliveryTime)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="w-20 flex justify-end pt-6 gap-1">
                <button
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 text-sm leading-none hover:bg-gray-50"
                  onClick={() => { }} // 서버사이드에서는 빈 함수
                  aria-label="경유지 복제"
                  title="복제"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-300 bg-white text-red-600 text-sm leading-none hover:bg-red-50"
                  onClick={() => { }} // 서버사이드에서는 빈 함수
                  aria-label="경유지 삭제"
                  title="삭제"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}

      </div>
    );
  }

  // 클라이언트에서만 드래그 앤 드롭 기능 활성화
  return (
    <div className="space-y-4">
      {waypoints.length === 0 ? (
        <div className="p-8 border-2 border-dashed rounded-xl text-center">
          <button
            type="button"
            onClick={handleAddWaypoint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-white hover:bg-gray-50 text-gray-900 shadow-sm"
          >
            <span className="text-base">＋</span>
            <span className="text-sm font-medium">경유지 추가</span>
          </button>
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
          {/* 하단 추가 버튼 제거: 경유지가 0개일 때만 노출 */}
        </>
      )}
    </div>
  );
}
