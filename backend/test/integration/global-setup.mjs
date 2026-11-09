import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Starts a throwaway PostgreSQL 16 (real server binaries from `embedded-postgres`, no Docker)
 * on a free port, applies the committed migrations with `prisma migrate deploy`, and exports
 * DATABASE_URL to the test workers. Each run gets its own data dir and port, so concurrent runs
 * don't collide. Plain ESM because `embedded-postgres` is ESM-only.
 */
const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

export default async function globalSetup() {
    const port = await freePort();
    const postgres = new EmbeddedPostgres({
        databaseDir: mkdtempSync(join(tmpdir(), 'brigadeiro-int-')),
        port,
        user: 'postgres',
        password: 'postgres',
        persistent: false,
        // Without these, initdb inherits the OS locale (WIN1252 on a pt-BR Windows) and any
        // character outside it, such as an emoji in a product name, fails with 22P05. The
        // postgres:16 image used in docker-compose.yml is UTF8 too.
        initdbFlags: ['--encoding=UTF8', '--locale=C'],
        onLog: () => undefined,
    });

    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('brigadeiro_int');

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/brigadeiro_int?schema=public`;
    process.env.DATABASE_URL = databaseUrl;

    const prismaCli = createRequire(join(backendRoot, 'package.json')).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
    });

    globalThis.__EMBEDDED_POSTGRES__ = postgres;
}
