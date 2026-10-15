import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import next from 'next';

async function start() {
  const distDir = process.argv[2];
  if (!distDir || !distDir.startsWith('quote-runs/private-server-')) {
    throw new Error('견적 서버의 임시 폴더가 지정되지 않았습니다.');
  }
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const config = require(path.join(process.cwd(), 'next.config.js'));
  await mkdir(distDir, { recursive: true, mode: 0o700 });
  const tsconfigPath = `${distDir}/tsconfig.json`;
  await writeFile(tsconfigPath, JSON.stringify({
    extends: path.relative(distDir, 'tsconfig.json'),
    include: [path.resolve('next-env.d.ts'), path.resolve('src/**/*.ts'), path.resolve('src/**/*.tsx')],
  }), { flag: 'wx', mode: 0o600 });
  const app = next({ dev: true, dir: process.cwd(), conf: {
    ...config, distDir, typescript: { ...config.typescript, tsconfigPath },
  } });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      process.send?.({ type: 'ready', port: address.port });
    }
  });
  const stop = async () => {
    server.close();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.once('disconnect', stop);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
