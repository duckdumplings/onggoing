'use client';

import React, { useMemo } from 'react';
import type { CaseSchematicPoint } from '@/domains/dispatch/services/caseBoard';

interface CaseRouteSchematicProps {
  points?: CaseSchematicPoint[];
  polyline?: { lat: number; lng: number }[];
  className?: string;
}

const ROLE_DOT_CLASS: Record<string, string> = {
  pickup: 'text-primary',
  drop: 'text-success-600',
  return: 'text-warning',
  waypoint: 'text-muted-foreground',
};

/**
 * 견적책 경로 개략도. Tmap 실도로 좌표가 있으면 도로 모양을 그리고,
 * 없을 때만 직선 근사임을 명시한 점선으로 폴백한다.
 */
export default function CaseRouteSchematic({
  points,
  polyline,
  className = 'h-[84px]',
}: CaseRouteSchematicProps) {
  const geometry = useMemo(() => {
    const nodes = (points ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const road = (polyline ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const all = [...road, ...nodes];
    if (all.length === 0) return null;

    const width = 320;
    const height = 150;
    const padding = 16;
    const latitudes = all.map((point) => point.lat);
    const longitudes = all.map((point) => point.lng);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const latitudeSpan = maxLatitude - minLatitude || 1;
    const longitudeSpan = maxLongitude - minLongitude || 1;
    const singlePoint = all.length === 1;
    const project = (point: { lat: number; lng: number }) => ({
      x: singlePoint
        ? width / 2
        : padding + ((point.lng - minLongitude) / longitudeSpan) * (width - 2 * padding),
      y: singlePoint
        ? height / 2
        : padding + ((maxLatitude - point.lat) / latitudeSpan) * (height - 2 * padding),
    });
    const roadPath =
      road.length > 1
        ? road
            .map((point, index) => {
              const projected = project(point);
              return `${index === 0 ? 'M' : 'L'}${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
            })
            .join(' ')
        : null;

    return {
      width,
      height,
      roadPath,
      nodes: nodes.map((point) => ({ ...project(point), role: point.role })),
    };
  }, [points, polyline]);

  if (!geometry) {
    return (
      <div className={`flex w-full items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground ${className}`}>
        경로 미리보기 없음
      </div>
    );
  }

  const approximatePath =
    !geometry.roadPath && geometry.nodes.length > 1
      ? geometry.nodes
          .map((node, index) => `${index === 0 ? 'M' : 'L'}${node.x.toFixed(1)},${node.y.toFixed(1)}`)
          .join(' ')
      : null;

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={`w-full rounded-lg bg-muted ${className}`}
      role="img"
      aria-label={geometry.roadPath ? 'Tmap 실도로 경로 개략도' : '직선 근사 경로 개략도'}
      preserveAspectRatio="xMidYMid meet"
    >
      {geometry.roadPath ? (
        <path
          d={geometry.roadPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          className="text-primary/60"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : approximatePath ? (
        <path
          d={approximatePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeDasharray="5 4"
          className="text-primary/30"
          strokeLinejoin="round"
        />
      ) : null}
      {geometry.nodes.map((node, index) => (
        <g key={index} className={ROLE_DOT_CLASS[node.role] ?? 'text-muted-foreground'}>
          <circle cx={node.x} cy={node.y} r={index === 0 ? 4.6 : 3.7} fill="currentColor" />
          {index === 0 && (
            <circle
              cx={node.x}
              cy={node.y}
              r={7}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              className="opacity-50"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
