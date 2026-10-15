import { loadEnvConfig } from '@next/env';
import { writeTeamQuoteEnvironment } from '../src/domains/quote/team/environment';

async function main() {
  if (process.argv.length > 2) throw new Error('이 명령은 인수를 받지 않습니다. 저장 위치는 quote-runs/team-onboarding/.env.local입니다.');
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const destination = await writeTeamQuoteEnvironment(process.cwd(), process.env);
  console.log(`팀원 설정 파일: ${destination}`);
  console.log('포함 항목: TMAP_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '팀원 설정 파일을 준비하지 못했습니다.');
  process.exitCode = 1;
});
