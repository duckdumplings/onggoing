import { createClient } from '@supabase/supabase-js';

// 환경 변수 타입 정의
interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

// 환경 변수에서 Supabase 설정 가져오기
const getSupabaseConfig = (): SupabaseConfig => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
};

// 클라이언트 사이드 Supabase 클라이언트
export const createSupabaseClient = () => {
  const config = getSupabaseConfig();
  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
};

// 서버 사이드 Supabase 클라이언트 (서비스 롤 키 사용)
export const createSupabaseServerClient = () => {
  const config = getSupabaseConfig();

  if (!config.serviceRoleKey) {
    throw new Error('Missing Supabase service role key for server-side operations');
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// Edge Functions용 Supabase 클라이언트
export const createSupabaseEdgeClient = () => {
  const config = getSupabaseConfig();

  if (!config.serviceRoleKey) {
    throw new Error('Missing Supabase service role key for Edge Functions');
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// 기본 설정
export const supabaseConfig = {
  // 데이터베이스 설정
  database: {
    schema: 'public',
    connectionPoolSize: 10,
  },

  // 인증 설정
  auth: {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    cookieOptions: {
      name: 'sb-auth-token',
      lifetime: 60 * 60 * 8, // 8 hours
      domain: process.env.NEXT_PUBLIC_SITE_URL,
      sameSite: 'lax',
      path: '/',
    },
  },

  // 실시간 설정
  realtime: {
    eventsPerSecond: 10,
    heartbeatIntervalMs: 30000,
  },

  // 스토리지 설정
  storage: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    ],
  },
};

export default supabaseConfig; 