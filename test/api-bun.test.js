import { describe, it, expect, afterAll } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const freePort = () => new Promise(resolve => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => {
    const port = s.address().port;
    s.close(() => resolve(port));
  });
});

describe('API Server Native Bun Runtime (Slice 4 Done-When)', () => {
  let child = null;
  let dataDir = null;

  afterAll(() => {
    if (child) {
      child.kill('SIGKILL');
    }
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('spawns server.js directly using bun runtime and answers /api/health with 200 OK', async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'gym-api-bun-test-'));
    writeFileSync(path.join(dataDir, 'secret'), 'b'.repeat(64), { mode: 0o600 });
    writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
      users: [{ id: 'u_bun_1', name: 'BunTester', created: new Date().toISOString() }],
      creds: [], subs: [], invites: []
    }));

    const port = await freePort();
    const apiPath = path.resolve('api');

    child = spawn(process.execPath, ['server.js'], {
      cwd: apiPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        ORIGIN: 'http://localhost:8080',
        RP_ID: 'localhost'
      }
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    // Poll /api/health until up
    let up = false;
    let healthData = null;
    const url = `http://127.0.0.1:${port}/api/health`;

    for (let i = 0; i < 50 && !up; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          up = true;
          healthData = await res.json();
        }
      } catch {
        // server still warming up
      }
      if (!up) await new Promise(r => setTimeout(r, 100));
    }

    expect(up).toBe(true);
    expect(healthData).toBeDefined();
    expect(healthData.ok).toBe(true);
  });
});
