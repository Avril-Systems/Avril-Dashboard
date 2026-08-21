#!/usr/bin/env node
/**
 * Mock RAG + Launch server for the E2E harness of the "generate opportunities"
 * flow (TAREA 9 · INT-005-E2E-FALLOS).
 *
 * Emulates:
 *   - RAG:    GET /api/blueprints/random                  (opportunities)
 *             GET /api/blueprints/:uuid/documento_identidad (blueprint)
 *   - Launch: POST /iniciar/:uuid                          (deploy start)
 *             GET  /api/companies/:id                      (deploy status)
 *
 * Modes are switched at runtime with POST /__control:
 *   { "rag":      "ok"|"empty"|"500"|"invalid-shape"|"down",
 *     "blueprint":"ok"|"404"|"500"|"down",
 *     "launch":   "ok"|"409"|"500"|"timeout"|"down",
 *     "status":   "pending"|"provisioning"|"ready"|"failed" }
 *
 * "down" destroys the socket immediately so the client sees a network error
 * (TypeError in fetch) — the same code path as a refused connection.
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_RL_PORT || 15999);

const state = {
  rag: 'ok',
  blueprint: 'ok',
  launch: 'ok',
  status: 'ready',
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function destroy(res) {
  res.socket.destroy();
}

function makeBlueprints(count) {
  const pool = ['Mozaik', 'CodeMote', 'Octolens', 'ScreenCI', 'AnySearch', 'Qbrin', 'Signal Desk', 'Creator Lab'];
  const cats = ['SaaS', 'B2B Services', 'Digital Content', 'Dev Tools', 'Marketplace'];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: crypto.randomUUID(),
      nombre_empresa: `E2E ${pool[Math.floor(Math.random() * pool.length)]} ${i + 1}`,
      categoria: cats[i % cats.length],
      score: 72 + Math.floor(Math.random() * 26),
      cliente_ideal: 'Solo founders y small teams que operan con agentes.',
      problema: 'No hay un operador integral que coordine agentes hacia un objetivo comercial.',
      oferta_inicial: 'Un control plane ejecutivo con agentes Scout, Operator y Auditor.',
      agentes_necesarios: ['Scout', 'Operator', 'Auditor'],
    });
  }
  return out;
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (pathname === '/__control' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        const patch = JSON.parse(raw);
        for (const key of ['rag', 'blueprint', 'launch', 'status']) {
          if (patch[key] !== undefined) state[key] = patch[key];
        }
      } catch {
        /* ignore malformed control payloads */
      }
      json(res, 200, { ok: true, state });
    });
    return;
  }

  if (pathname === '/' || pathname === '/health') {
    json(res, 200, { ok: true, service: 'mock-rl' });
    return;
  }

  // ---- RAG ----
  if (pathname === '/api/blueprints/random' && req.method === 'GET') {
    switch (state.rag) {
      case 'down':
        return destroy(res);
      case '500':
        return json(res, 500, { status: 'error', error: 'Internal Server Error' });
      case 'empty':
        return json(res, 200, { status: 'success', data: [] });
      case 'invalid-shape':
        return json(res, 200, { status: 'success', data: 'not-an-array' });
      case 'ok':
      default:
        return json(res, 200, { status: 'success', data: makeBlueprints(3) });
    }
  }

  const did = pathname.match(/^\/api\/blueprints\/([^/]+)\/documento_identidad$/);
  if (did && req.method === 'GET') {
    switch (state.blueprint) {
      case 'down':
        return destroy(res);
      case '404':
        return json(res, 404, { status: 'error', error: 'Blueprint not found' });
      case '500':
        return json(res, 500, { status: 'error', error: 'Internal Server Error' });
      case 'ok':
      default:
        return json(res, 200, {
          status: 'success',
          data: {
            id: decodeURIComponent(did[1]),
            nombre_empresa: 'E2E Mock Blueprint Co',
            documento_identidad:
              '# Documento de identidad\n\n## Resumen\nEmpresa E2E para pruebas de integración.\n\n## Pasos\n1. Fundar.\n2. Operar con agentes.\n\n## Riesgos\nRiesgo bajo (entorno de prueba).',
          },
        });
    }
  }

  // ---- Launch ----
  const start = pathname.match(/^\/iniciar\/(.+)$/);
  if (start && req.method === 'POST') {
    switch (state.launch) {
      case 'down':
        return destroy(res);
      case '409':
        return json(res, 409, {
          success: false,
          code: 'IDEA_NO_DISPONIBLE',
          error: 'La idea ya no está disponible. Elige otra empresa.',
          action: 'elegir_nueva_idea',
        });
      case '500':
        return json(res, 500, { success: false, error: 'Launch upstream exploded' });
      case 'timeout': {
        // Reply after 12s: the dashboard aborts at 10s → LAUNCH_TIMEOUT.
        setTimeout(() => {
          json(res, 202, {
            success: true,
            deploymentId: `dep-slow-${decodeURIComponent(start[1]).slice(0, 8)}`,
            companyId: `cmp-slow-${decodeURIComponent(start[1]).slice(0, 8)}`,
            status: 'pending',
            timestamps: { created: Date.now() },
          });
        }, 12_000).unref();
        return;
      }
      case 'ok':
      default: {
        const uuid = decodeURIComponent(start[1]);
        const deploymentId = `dep-e2e-${uuid.slice(0, 8)}`;
        return json(res, 202, {
          success: true,
          deploymentId,
          companyId: `cmp-e2e-${uuid.slice(0, 8)}`,
          status: 'pending',
          timestamps: { created: Date.now() },
        });
      }
    }
  }

  const stat = pathname.match(/^\/api\/companies\/(.+)$/);
  if (stat && req.method === 'GET') {
    if (state.status === 'down') return destroy(res);
    const id = decodeURIComponent(stat[1]);
    const payload = {
      success: state.status === 'ready',
      deploymentId: id,
      companyId: `cmp-${id.slice(-8)}`,
      status: state.status,
      url: state.status === 'ready' ? `https://runtime-${id.slice(-8)}.avril.test` : null,
      error: state.status === 'failed' ? 'VPS sin capacidad: no quedan nodos disponibles para el contenedor.' : null,
      logs: state.status === 'failed' ? ['bild de imagen OK', 'reservar vps falló: SIN_CAPACIDAD'] : [],
      timestamps: { created: Date.now(), updated: Date.now() },
    };
    return json(res, 200, payload);
  }

  json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-rl] listening on http://127.0.0.1:${PORT} state=${JSON.stringify(state)}`);
});