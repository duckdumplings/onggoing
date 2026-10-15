import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseTeamQuoteRequest } from '../src/domains/quote/team/input';

const help = `팀 배송라인 견적 — 부가세 별도, 기본 안전버퍼 20분

사용법: npm run quote:team -- input.json [옵션]
  --date YYYY-MM-DD  실제 운행일로 변경 (한국 시각)
  --check            입력만 검증. API 키·서버·외부 호출 불필요
  --base-url URL     이미 실행 중인 로컬 서버 사용 (HTTP 루프백만 허용)
  --out PREFIX       결과 파일 접두사. 기존 파일이 있으면 중단
  --help             이 도움말 표시

예: npm run quote:team -- examples/team-quote.example.json --date 2026-10-16 --check
    npm run quote:team -- quote-runs/request.json --out quote-runs/mapo

서버 주소를 생략하면 임시 로컬 서버를 시작하고 계산 후 종료합니다.
입력 스냅샷(.input.json), 계산 결과(.result.json), 안내문(.md)을 저장합니다.
준비와 입력 규칙: docs/team-quote-guide.md`;

function readOptions(args: string[]) {
  const options: { input?: string; date?: string; check?: boolean; baseUrl?: string; out?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') options.check = true;
    else if (['--date', '--base-url', '--out'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 뒤에 값을 입력해 주세요.`);
      if (arg === '--date') options.date = value;
      if (arg === '--base-url') options.baseUrl = localBaseUrl(value);
      if (arg === '--out') options.out = value;
    } else if (arg.startsWith('-')) throw new Error(`지원하지 않는 옵션: ${arg}. --help를 확인해 주세요.`);
    else if (options.input) throw new Error('입력 JSON 파일은 한 개만 지정해 주세요. 여러 라인은 cases에 넣습니다.');
    else options.input = arg;
  }
  if (!options.input) throw new Error('입력 JSON 파일이 필요합니다. --help를 확인해 주세요.');
  return options;
}

function localBaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('--base-url은 http://127.0.0.1:3101 형식으로 입력해 주세요.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('--base-url은 경로·인증정보 없는 로컬 HTTP 주소만 허용합니다. 예: http://127.0.0.1:3101');
  }
  return url.origin;
}

async function reserveOutputs(prefix: string) {
  await mkdir(path.dirname(prefix), { recursive: true, mode: 0o700 });
  const targets = ['input.json', 'result.json', 'md'].map((suffix) => `${prefix}.${suffix}`);
  for (const target of targets) {
    try { await access(target); throw new Error(`이미 존재하는 결과 파일입니다: ${target}. 다른 --out 값을 사용해 주세요.`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const files: Awaited<ReturnType<typeof open>>[] = [];
  try {
    for (const target of targets) files.push(await open(target, 'wx', 0o600));
    return { files, targets };
  } catch (error) {
    await Promise.all(files.map((file) => file.close()));
    throw error;
  }
}

let child: ChildProcess | undefined;
let stopping: Promise<void> | undefined;
function stopServer() {
  if (!child || stopping) return stopping ?? Promise.resolve();
  const ownChild = child;
  stopping = new Promise<void>((resolve) => {
    if (ownChild.exitCode !== null || ownChild.signalCode !== null) { resolve(); return; }
    const signal = (name: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && ownChild.pid) process.kill(-ownChild.pid, name);
        else ownChild.kill(name);
      } catch { /* The owned child may already have exited. */ }
    };
    const timer = setTimeout(() => { signal('SIGKILL'); resolve(); }, 5_000);
    ownChild.once('exit', () => { clearTimeout(timer); resolve(); });
    signal('SIGTERM');
  });
  return stopping;
}

async function startServer() {
  await mkdir('quote-runs', { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const logPath = `quote-runs/private-server-${id}.log`;
  const log = await open(logPath, 'wx', 0o600);
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  try {
    child = spawn(process.execPath, [require.resolve('tsx/cli'), path.resolve('scripts/team-quote-server.ts'), `quote-runs/private-server-${id}`], {
      cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      detached: process.platform !== 'win32', stdio: ['ignore', log.fd, log.fd, 'ipc'],
    });
  } finally { await log.close(); }
  const ownChild = child;
  return new Promise<string>((resolve, reject) => {
    const fail = () => reject(new Error(`계산용 서버를 시작하지 못했습니다. npm ci 후 다시 실행하거나 --base-url을 지정해 주세요. 진단 로그: ${logPath}`));
    const timer = setTimeout(fail, 90_000);
    ownChild.once('error', () => { clearTimeout(timer); fail(); });
    ownChild.once('exit', () => { clearTimeout(timer); fail(); });
    ownChild.on('message', (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready'
        && 'port' in message && typeof message.port === 'number') {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${message.port}`);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const options = readOptions(args);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(options.input!, 'utf8')); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('입력 파일이 올바른 JSON이 아닙니다. 쉼표·따옴표를 확인해 주세요.');
    throw new Error('입력 JSON 파일을 읽지 못했습니다. 경로와 읽기 권한을 확인해 주세요.');
  }
  if (options.date && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) raw = { ...raw, serviceDate: options.date };
  const request = parseTeamQuoteRequest(raw);
  if (options.check) {
    console.log('입력 검증 완료. 아래 기본값·시각·상차지 변경 가정을 확인해 주세요. 외부 조회는 실행하지 않았습니다.');
    console.log(JSON.stringify(request, null, 2));
    return;
  }
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  if (!process.env.TMAP_API_KEY && !process.env.NEXT_PUBLIC_TMAP_API_KEY) {
    throw new Error('Tmap 키가 없습니다. 팀에서 승인한 .env.local에 TMAP_API_KEY를 설정해 주세요. 키 값은 대화·결과물에 붙이지 마세요. 입력만 확인하려면 --check를 사용하세요.');
  }
  const prefix = path.resolve(options.out ?? `quote-runs/quote-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  const outputs = await reserveOutputs(prefix);
  try {
    await outputs.files[0].writeFile(`${JSON.stringify(request, null, 2)}\n`);
    console.log('운행일 교통·기업별 전달시간·안전버퍼를 계산합니다.');
    const baseUrl = options.baseUrl ?? await startServer();
    const { runTeamQuote } = await import('../src/domains/quote/team/run');
    const { formatTeamQuoteReport } = await import('../src/domains/quote/team/report');
    const report = await runTeamQuote(request, baseUrl);
    const markdown = formatTeamQuoteReport(report);
    await outputs.files[1].writeFile(`${JSON.stringify(report, null, 2)}\n`);
    await outputs.files[2].writeFile(markdown);
    console.log(markdown);
    console.log(`\n저장: ${outputs.targets.join('\n      ')}`);
    if (report.cases.some((route) => route.status === 'error')) process.exitCode = 1;
  } finally {
    await Promise.all(outputs.files.map((file) => file.close()));
    await stopServer();
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void stopServer().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143)); });
}
main().catch(async (error: unknown) => {
  let message = error instanceof Error ? error.message : '알 수 없는 오류입니다.';
  if (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues)) {
    message = `입력 항목을 확인해 주세요.\n${error.issues.map((issue) => `${issue.path.join('.') || '입력'}: ${issue.message}`).join('\n')}`;
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length > 6 && /KEY|TOKEN|SECRET|PASSWORD/i.test(name)) message = message.split(value).join('[비공개]');
  }
  console.error(`견적 생성 실패: ${message}`);
  await stopServer();
  process.exitCode = 1;
});
