'use client';

import React, { useId, useMemo } from 'react';
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

const ROLE_LABEL: Record<string, string> = {
  pickup: '상차',
  drop: '배송',
  return: '반납',
  waypoint: '경유',
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
  const arrowId = useId().replace(/:/g, '');
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
      nodes: nodes.map((point, index) => ({
        ...project(point),
        role: point.role,
        sequence: index + 1,
      })),
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
      aria-label={
        geometry.roadPath
          ? '운행 순서를 번호로 표시한 Tmap 실도로 경로 개략도'
          : '운행 순서를 번호로 표시한 직선 근사 경로 개략도'
      }
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-primary/60" />
        </marker>
      </defs>
      {geometry.roadPath ? (
        <path
          d={geometry.roadPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          className="text-primary/60"
          strokeLinejoin="round"
          strokeLinecap="round"
          markerEnd={`url(#${arrowId})`}
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
          markerEnd={`url(#${arrowId})`}
        />
      ) : null}
      {geometry.nodes.map((node, index) => (
        <g key={index} className={ROLE_DOT_CLASS[node.role] ?? 'text-muted-foreground'}>
          <title>{`${node.sequence}번 ${ROLE_LABEL[node.role] ?? '경유'}`}</title>
          <circle cx={node.x} cy={node.y} r={8.2} fill="currentColor" className="opacity-95" />
          <circle cx={node.x} cy={node.y} r={5.6} className="fill-card" />
          <text
            x={node.x}
            y={node.y + 0.4}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-[7px] font-bold tabular-nums"
          >
            {node.sequence}
          </text>
        </g>
      ))}
    </svg>
  );
}
