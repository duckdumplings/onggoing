// 외부 모듈 타입 정의
declare module 'https://deno.land/std@0.208.0/http/server.ts' {
  export function serve(handler: (req: Request) => Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.39.0' {
  export function createClient(url: string, key: string, options?: any): any;
} 