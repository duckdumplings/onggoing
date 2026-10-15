import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { selectTeamQuoteEnvironment, writeTeamQuoteEnvironment } from './environment';

const anonKey = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"anon"}').toString('base64url')}.test_signature`;
const source = {
  TMAP_API_KEY: 'test-tmap-key', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
};
const directories: string[] = [];
async function temporaryProject() {
  const directory = await mkdtemp(path.join(tmpdir(), 'team-quote-env-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('selectTeamQuoteEnvironment', () => {
  it('includes only the three calculation credentials, excluding elevated and unrelated values', () => {
    expect(selectTeamQuoteEnvironment({ ...source, SUPABASE_SERVICE_ROLE_KEY: 'never-export-admin',
      ANTHROPIC_API_KEY: 'never-export-llm', PATH: '/private/path' })).toEqual(source);
  });

  it('uses the public Tmap fallback only when the server key is absent', () => {
    expect(selectTeamQuoteEnvironment({ ...source, TMAP_API_KEY: undefined,
      NEXT_PUBLIC_TMAP_API_KEY: 'fallback-key' }).TMAP_API_KEY).toBe('fallback-key');
    expect(selectTeamQuoteEnvironment({ ...source, NEXT_PUBLIC_TMAP_API_KEY: 'fallback-key' }).TMAP_API_KEY).toBe('test-tmap-key');
  });

  it('accepts a publishable Supabase key and normalizes a trailing URL slash', () => {
    expect(selectTeamQuoteEnvironment({ ...source, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test-only' })).toEqual({
      ...source, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test-only',
    });
  });

  it.each(['service_role', 'authenticated', undefined])('rejects a legacy JWT whose role is %s', (role) => {
    const key = `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
    expect(() => selectTeamQuoteEnvironment({ ...source, NEXT_PUBLIC_SUPABASE_ANON_KEY: key })).toThrow(/anon|publishable/);
  });

  it.each(['sb_secret_test-only', 'random-key', 'header.invalid.signature'])('rejects a non-public Supabase key without echoing it', (key) => {
    let failure: unknown;
    try { selectTeamQuoteEnvironment({ ...source, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(key);
  });

  it.each(['http://example.supabase.co', 'https://user:pass@example.supabase.co',
    'https://example.supabase.co?key=secret', 'https://example.supabase.co#secret',
    'https://example.supabase.co/rest/v1'])('rejects a URL with unsafe base configuration: %s', (url) => {
    expect(() => selectTeamQuoteEnvironment({ ...source, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(/URL/);
  });

  it.each(['TMAP_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const)(
    'rejects missing %s', (name) => {
      expect(() => selectTeamQuoteEnvironment({ ...source, [name]: '' })).toThrow(name);
    },
  );

  it.each(['TMAP_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const)(
    'rejects newline injection in %s before writing a dotenv file', (name) => {
      expect(() => selectTeamQuoteEnvironment({ ...source, [name]: `${source[name]}\nINJECTED=1` })).toThrow(/줄바꿈|제어문자/);
    },
  );

  it.each(['key$EXPANSION', 'key#comment', 'key"quote', 'key\u0000null'])(
    'rejects a Tmap value that would change meaning in dotenv: %s', (key) => {
      expect(() => selectTeamQuoteEnvironment({ ...source, TMAP_API_KEY: key })).toThrow(/TMAP_API_KEY/);
    },
  );
});

describe('writeTeamQuoteEnvironment', () => {
  it('writes only the narrow settings to the fixed private onboarding path', async () => {
    const project = await temporaryProject();
    const result = await writeTeamQuoteEnvironment(project, { ...source, SUPABASE_SERVICE_ROLE_KEY: 'admin-only' });
    expect(result).toBe(path.join(project, 'quote-runs/team-onboarding/.env.local'));
    expect(await readFile(result, 'utf8')).toBe(`TMAP_API_KEY=test-tmap-key\nNEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}\n`);
    expect((await stat(result)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(result))).mode & 0o777).toBe(0o700);
  });

  it('does not overwrite an existing handoff file', async () => {
    const project = await temporaryProject();
    const output = await writeTeamQuoteEnvironment(project, source);
    await writeFile(output, 'preserve-this-file');
    await expect(writeTeamQuoteEnvironment(project, source)).rejects.toThrow(/존재|덮어/);
    expect(await readFile(output, 'utf8')).toBe('preserve-this-file');
  });

  it('makes an existing onboarding directory private before exporting', async () => {
    const project = await temporaryProject();
    const directory = path.join(project, 'quote-runs/team-onboarding');
    await mkdir(directory, { recursive: true });
    await chmod(directory, 0o755);
    await writeTeamQuoteEnvironment(project, source);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });

  it('refuses an onboarding directory redirected outside the ignored path', async () => {
    const project = await temporaryProject();
    const outside = await temporaryProject();
    await mkdir(path.join(project, 'quote-runs'));
    await symlink(outside, path.join(project, 'quote-runs/team-onboarding'));
    await expect(writeTeamQuoteEnvironment(project, source)).rejects.toThrow(/디렉터리|링크/);
  });

  it('prints only the output path and allowed variable names, never their values', async () => {
    const project = await temporaryProject();
    const require = createRequire(import.meta.url);
    const output = execFileSync(process.execPath, [require.resolve('tsx/cli'), path.resolve('scripts/team-quote-env.ts')], {
      cwd: project, env: { ...source, NODE_ENV: 'test', PATH: process.env.PATH }, encoding: 'utf8',
    });
    expect(output).toContain(path.join(project, 'quote-runs/team-onboarding/.env.local'));
    for (const name of Object.keys(source)) expect(output).toContain(name);
    for (const value of Object.values(source)) expect(output).not.toContain(value);
  });
});
