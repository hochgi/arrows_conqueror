/**
 * Local BYOK turn orchestrator — plan → commit → validate (no LangGraph).
 *
 * Browser keeps keys; this process only runs on loopback for playtest.
 * Discard with: git checkout main && git branch -D feat/byok-turn-orchestrator
 */

import { createServer } from 'node:http';
import { pickMove, parseMoveIndex } from './orchestrate.mjs';

const PORT = Number(process.env.BYOK_TURN_PORT ?? 4010);
const HOST = process.env.BYOK_TURN_HOST ?? '127.0.0.1';

const readJson = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw.length === 0 ? {} : JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

const send = (res, status, body) => {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(json);
};

const isLoopbackUpstream = (urlString) => {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
};

const isHttpsUpstream = (urlString) => {
  try {
    return new URL(urlString).protocol === 'https:';
  } catch {
    return false;
  }
};

const server = createServer((req, res) => {
  void (async () => {
    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }
    const url = new URL(req.url ?? '/', `http://${HOST}:${String(PORT)}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true, service: 'byok-turn-runner', port: PORT });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/pick') {
      let body;
      try {
        body = await readJson(req);
      } catch {
        send(res, 400, { ok: false, error: 'invalid JSON body' });
        return;
      }

      const upstream = typeof body.upstream === 'string' ? body.upstream.trim() : '';
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const seat = typeof body.seat === 'string' ? body.seat : '?';
      const moveCount = Number(body.moveCount);
      const system = typeof body.system === 'string' ? body.system : '';
      const user = typeof body.user === 'string' ? body.user : '';
      const plan = body.plan !== false;

      if (!upstream || (!isLoopbackUpstream(upstream) && !isHttpsUpstream(upstream))) {
        send(res, 403, {
          ok: false,
          error: 'upstream must be loopback http(s) or https (SSRF guard)',
        });
        return;
      }
      if (!apiKey || !model || !Number.isInteger(moveCount) || moveCount <= 0) {
        send(res, 400, {
          ok: false,
          error: 'need apiKey, model, moveCount>=1, upstream',
        });
        return;
      }

      const result = await pickMove({
        upstream,
        apiKey,
        model,
        seat,
        moveCount,
        system,
        user,
        plan,
      });
      send(res, result.ok ? 200 : 422, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/parse') {
      let body;
      try {
        body = await readJson(req);
      } catch {
        send(res, 400, { ok: false, error: 'invalid JSON body' });
        return;
      }
      const text = typeof body.text === 'string' ? body.text : '';
      const moveCount = Number(body.moveCount);
      const index = parseMoveIndex(text, moveCount);
      send(res, 200, { ok: index !== undefined, move: index ?? null });
      return;
    }

    send(res, 404, { ok: false, error: 'not found' });
  })().catch((err) => {
    send(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'internal error',
    });
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `byok-turn-runner listening on http://${HOST}:${String(PORT)}  (POST /v1/pick)\n`,
  );
});
