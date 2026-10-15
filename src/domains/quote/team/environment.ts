import { chmod, lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { isPublicSupabaseKey } from '../services/publicSupabaseKey';

type EnvironmentSource = Record<string, string | undefined>;
export interface TeamQuoteEnvironment {
  TMAP_API_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

function setting(source: EnvironmentSource, name: string, fallback?: string): string {
  const value = source[name] || (fallback ? source[fallback] : undefined);
  if (!value?.trim()) throw new Error(`${name} 설정이 필요합니다.`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${name}에 줄바꿈 또는 제어문자를 사용할 수 없습니다.`);
  return value.trim();
}

export function selectTeamQuoteEnvironment(source: EnvironmentSource): TeamQuoteEnvironment {
  const tmapKey = setting(source, 'TMAP_API_KEY', 'NEXT_PUBLIC_TMAP_API_KEY');
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(tmapKey)) throw new Error('TMAP_API_KEY 형식을 확인해 주세요.');
  const rawUrl = setting(source, 'NEXT_PUBLIC_SUPABASE_URL');
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL 형식을 확인해 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL은 인증정보·경로·쿼리 없는 HTTPS 주소여야 합니다.');
  }
  const anonKey = setting(source, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!isPublicSupabaseKey(anonKey)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY에는 anon 또는 publishable 키만 사용할 수 있습니다.');
  }
  return { TMAP_API_KEY: tmapKey, NEXT_PUBLIC_SUPABASE_URL: url.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey };
}

export async function writeTeamQuoteEnvironment(projectRoot: string, source: EnvironmentSource): Promise<string> {
  const settings = selectTeamQuoteEnvironment(source);
  const runs = path.resolve(projectRoot, 'quote-runs');
  const directory = path.join(runs, 'team-onboarding');
  for (const target of [runs, directory]) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    if (!(await lstat(target)).isDirectory()) throw new Error('설정 저장 디렉터리는 심볼릭 링크일 수 없습니다.');
  }
  await chmod(directory, 0o700);
  const destination = path.join(directory, '.env.local');
  let file: Awaited<ReturnType<typeof open>>;
  try { file = await open(destination, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('팀원 설정 파일이 이미 존재합니다. 덮어쓰지 않았습니다.');
    throw new Error('팀원 설정 파일을 만들지 못했습니다. 저장 폴더의 권한을 확인해 주세요.');
  }
  try {
    await file.writeFile(Object.entries(settings).map(([name, value]) => `${name}=${value}\n`).join(''));
  } finally { await file.close(); }
  return destination;
}
