import { supabase } from './supabase-client';
import type { DispatchRoute, Driver, DeliveryTracking } from './supabase-client';

// 실시간 이벤트 타입
export type RealtimeEvent =
  | 'driver_location_update'
  | 'route_status_change'
  | 'delivery_status_update'
  | 'quote_status_change';

// 실시간 콜백 타입
export type RealtimeCallback<T = any> = (payload: T) => void;

// 실시간 구독 관리자
export class RealtimeManager {
  private subscriptions: Map<string, any> = new Map();

  // 기사 위치 업데이트 구독
  subscribeToDriverLocation(driverId: string, callback: RealtimeCallback<Driver>) {
    const channel = supabase
      .channel(`driver_location_${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          filter: `id=eq.${driverId}`,
        },
        (payload) => {
          callback(payload.new as Driver);
        }
      )
      .subscribe();

    this.subscriptions.set(`driver_location_${driverId}`, channel);
    return () => this.unsubscribe(`driver_location_${driverId}`);
  }

  // 배차 경로 상태 변경 구독
  subscribeToRouteStatus(routeId: string, callback: RealtimeCallback<DispatchRoute>) {
    const channel = supabase
      .channel(`route_status_${routeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatch_routes',
          filter: `id=eq.${routeId}`,
        },
        (payload) => {
          callback(payload.new as DispatchRoute);
        }
      )
      .subscribe();

    this.subscriptions.set(`route_status_${routeId}`, channel);
    return () => this.unsubscribe(`route_status_${routeId}`);
  }

  // 배송 추적 업데이트 구독
  subscribeToDeliveryTracking(routeId: string, callback: RealtimeCallback<DeliveryTracking>) {
    const channel = supabase
      .channel(`delivery_tracking_${routeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_tracking',
          filter: `route_id=eq.${routeId}`,
        },
        (payload) => {
          callback(payload.new as DeliveryTracking);
        }
      )
      .subscribe();

    this.subscriptions.set(`delivery_tracking_${routeId}`, channel);
    return () => this.unsubscribe(`delivery_tracking_${routeId}`);
  }

  // 견적 상태 변경 구독
  subscribeToQuoteStatus(quoteId: string, callback: RealtimeCallback<any>) {
    const channel = supabase
      .channel(`quote_status_${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${quoteId}`,
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    this.subscriptions.set(`quote_status_${quoteId}`, channel);
    return () => this.unsubscribe(`quote_status_${quoteId}`);
  }

  // 모든 활성 기사 위치 구독
  subscribeToAllDriverLocations(callback: RealtimeCallback<Driver>) {
    const channel = supabase
      .channel('all_driver_locations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          filter: 'is_active=eq.true',
        },
        (payload) => {
          callback(payload.new as Driver);
        }
      )
      .subscribe();

    this.subscriptions.set('all_driver_locations', channel);
    return () => this.unsubscribe('all_driver_locations');
  }

  // 모든 배차 경로 상태 구독
  subscribeToAllRouteStatuses(callback: RealtimeCallback<DispatchRoute>) {
    const channel = supabase
      .channel('all_route_statuses')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatch_routes',
        },
        (payload) => {
          callback(payload.new as DispatchRoute);
        }
      )
      .subscribe();

    this.subscriptions.set('all_route_statuses', channel);
    return () => this.unsubscribe('all_route_statuses');
  }

  // 구독 해제
  unsubscribe(channelName: string) {
    const subscription = this.subscriptions.get(channelName);
    if (subscription) {
      supabase.removeChannel(subscription);
      this.subscriptions.delete(channelName);
    }
  }

  // 모든 구독 해제
  unsubscribeAll() {
    this.subscriptions.forEach((subscription, channelName) => {
      supabase.removeChannel(subscription);
    });
    this.subscriptions.clear();
  }

  // 구독 상태 확인
  isSubscribed(channelName: string): boolean {
    return this.subscriptions.has(channelName);
  }

  // 활성 구독 목록 가져오기
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}

// 전역 실시간 관리자 인스턴스
export const realtimeManager = new RealtimeManager();

// React 훅: 기사 위치 구독
export const useDriverLocation = (driverId: string) => {
  const [location, setLocation] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => {
    const unsubscribe = realtimeManager.subscribeToDriverLocation(driverId, (driver) => {
      if (driver.current_location_lat && driver.current_location_lng) {
        setLocation({
          lat: driver.current_location_lat,
          lng: driver.current_location_lng,
        });
      }
    });

    return unsubscribe;
  }, [driverId]);

  return location;
};

// React 훅: 배차 경로 상태 구독
export const useRouteStatus = (routeId: string) => {
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubscribe = realtimeManager.subscribeToRouteStatus(routeId, (route) => {
      setStatus(route.status);
    });

    return unsubscribe;
  }, [routeId]);

  return status;
};

// React 훅: 배송 추적 구독
export const useDeliveryTracking = (routeId: string) => {
  const [tracking, setTracking] = React.useState<DeliveryTracking | null>(null);

  React.useEffect(() => {
    const unsubscribe = realtimeManager.subscribeToDeliveryTracking(routeId, (trackingData) => {
      setTracking(trackingData);
    });

    return unsubscribe;
  }, [routeId]);

  return tracking;
};

// React 훅: 모든 기사 위치 구독
export const useAllDriverLocations = () => {
  const [driverLocations, setDriverLocations] = React.useState<Map<string, { lat: number; lng: number }>>(new Map());

  React.useEffect(() => {
    const unsubscribe = realtimeManager.subscribeToAllDriverLocations((driver) => {
      if (driver.current_location_lat && driver.current_location_lng) {
        setDriverLocations(prev => new Map(prev).set(driver.id, {
          lat: driver.current_location_lat,
          lng: driver.current_location_lng,
        }));
      }
    });

    return unsubscribe;
  }, []);

  return driverLocations;
};

// 컴포넌트 언마운트 시 자동 정리
React.useEffect(() => {
  return () => {
    realtimeManager.unsubscribeAll();
  };
}, []); 