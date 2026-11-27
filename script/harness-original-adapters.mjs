/**
 * Adaptadores de las actividades ORIGINALES de los cuatro arneses.
 *
 * No reimplementan la lógica: invocan el código vendorizado en
 * `harness/original/` en un directorio temporal y normalizan su salida para
 * `harnessActivities` (summary + items + artefactos legibles).
 *
 * Reglas:
 *   - El código original se ejecuta tal cual (solo se agregaron timeouts de red
 *     en marketing para que el worker no quede colgado).
 *   - Nada se envía a clientes ni se publica.
 *   - Si falta una dependencia/llave, la actividad se marca `blocked` con un
 *     mensaje accionable; no se simula el resultado.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdapterBlockedError } from './harness-adapters.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINALS = path.join(REPO_ROOT, 'harness', 'original');
const MAX_CAPTURE = 4 * 1024 * 1024;

function pythonCommand() {
  if (process.env.HARNESS_PYTHON) return process.env.HARNESS_PYTHON;
  const venv = path.join(REPO_ROOT, '.harness-venv', 'bin', 'python');
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function stripAnsi(value) {
  return String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

function tail(value, max = 5000) {
  const text = stripAnsi(value).trim();
  return text.length > max ? text.slice(-max) : text;
}

function logsOf(stdout, stderr) {
  return tail([stdout, stderr].filter(Boolean).join('\n'), 4000)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-40);
}

function runProcess({ command, args, cwd, env = {}, timeoutMs = 180_000, stdin }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(5_000, timeoutMs));

    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      return next.length > MAX_CAPTURE ? next.slice(-MAX_CAPTURE) : next;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr, durationMs: Date.now() - started });
    });

    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'avril-harness-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return undefined;
    throw new Error(`No se pudo leer ${path.basename(file)}: ${err instanceof Error ? err.message : err}`);
  }
}

function runFailure(label, result) {
  const detail = tail(result.stderr || result.stdout, 1200) || 'sin salida';
  if (result.timedOut) return `${label} agotó el tiempo límite (${Math.round(result.durationMs / 1000)} s).`;
  return `${label} terminó con código ${result.code ?? result.signal}: ${detail}`;
}

// ---------------------------------------------------------------------------
// Prospección original
// ---------------------------------------------------------------------------

export async function runOriginalProspecting(input, ctx) {
  return withTempDir(async (dir) => {
    const history = Array.isArray(ctx.history) ? ctx.history.filter((h) => typeof h === 'string') : [];
    if (history.length) {
      await writeFile(path.join(dir, 'prospectos_historicos.json'), JSON.stringify(history, null, 2), 'utf8');
    }
    ctx.log(`prospector original · ${history.length} handles en histórico · GITHUB_TOKEN=${process.env.GITHUB_TOKEN ? 'sí' : 'no'}`);
    const result = await runProcess({
      command: pythonCommand(),
      args: [path.join(ORIGINALS, 'prospecting', 'prototipo.py')],
      cwd: dir,
      timeoutMs: 300_000,
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '' },
    });

    const raw = (await readJsonIfExists(path.join(dir, 'raw_candidates.json'))) ?? [];
    const rejected = (await readJsonIfExists(path.join(dir, 'log_rechazos.json'))) ?? [];
    const verified = (await readJsonIfExists(path.join(dir, 'prospectos_avril_lab.json'))) ?? [];
    const top5 = (await readJsonIfExists(path.join(dir, 'top_5_priorizados.json'))) ?? [];
    const historyOut = (await readJsonIfExists(path.join(dir, 'prospectos_historicos.json'))) ?? history;

    if (!raw.length && result.code !== 0) throw new Error(runFailure('prospector original', result));
    const queries = new Set(raw.map((r) => r?.query_origen).filter(Boolean)).size;
    return {
      kind: 'prospecting_original',
      summary: {
        mode: 'original',
        queries,
        discovered: raw.length,
        rejected: rejected.length,
        verified: verified.length,
        top5: top5.length,
        ratio: raw.length ? Math.round((verified.length / raw.length) * 100) : 0,
        usedToken: Boolean(process.env.GITHUB_TOKEN),
        historySize: Array.isArray(historyOut) ? historyOut.length : 0,
        durationMs: result.durationMs,
      },
      items: top5,
      verified,
      rejections: rejected,
      rawCandidates: raw,
      history: historyOut,
      artifacts: ['raw_candidates.json', 'log_rechazos.json', 'prospectos_avril_lab.json', 'top_5_priorizados.json', 'prospectos_historicos.json'],
      logs: logsOf(result.stdout, result.stderr),
    };
  });
}

// ---------------------------------------------------------------------------
// B2B original
// ---------------------------------------------------------------------------

export async function runOriginalB2B(input, ctx) {
  const modo = input?.modo === 'modelo' ? 'modelo' : 'reglas';
  if (modo === 'modelo' && !process.env.ANTHROPIC_API_KEY) {
    throw new AdapterBlockedError('El modo modelo del arnés B2B requiere ANTHROPIC_API_KEY; usa modo reglas o configura la llave.');
  }

  return withTempDir(async (dir) => {
    const defaultSolicitudes = await readJsonIfExists(path.join(ORIGINALS, 'b2b', 'data', 'solicitudes.json'));
    const defaultSector = await readJsonIfExists(path.join(ORIGINALS, 'b2b', 'config', 'sector.json'));
    const solicitudes = Array.isArray(input?.solicitudes) && input.solicitudes.length ? input.solicitudes : defaultSolicitudes;
    const sector = input?.sector && typeof input.sector === 'object' ? input.sector : defaultSector;
    if (!Array.isArray(solicitudes)) throw new Error('No hay solicitudes B2B para procesar.');

    const solicitudesPath = path.join(dir, 'solicitudes.json');
    const sectorPath = path.join(dir, 'sector.json');
    await writeFile(solicitudesPath, JSON.stringify(solicitudes, null, 2), 'utf8');
    await writeFile(sectorPath, JSON.stringify(sector, null, 2), 'utf8');

    const args = [
      path.join(ORIGINALS, 'b2b', 'run.py'),
      '--config', sectorPath,
      '--solicitudes', solicitudesPath,
      '--salida', path.join(dir, 'crm'),
    ];
    if (modo === 'modelo') args.push('--modo', 'modelo', '--cliente', 'anthropic');

    ctx.log(`arnés B2B original · modo ${modo} · ${solicitudes.length} solicitudes`);
    const result = await runProcess({
      command: pythonCommand(),
      args,
      cwd: dir,
      timeoutMs: 120_000,
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
    });
    if (result.code !== 0) throw new Error(runFailure('arnés B2B original', result));

    const leads = (await readJsonIfExists(path.join(dir, 'crm', 'leads.json'))) ?? [];
    const csv = await readFile(path.join(dir, 'crm', 'leads.csv'), 'utf8').catch(() => '');
    const count = (estado) => leads.filter((l) => l?.estado === estado).length;
    return {
      kind: 'b2b_original',
      summary: {
        mode: modo,
        requests: leads.length,
        ready: count('listo_para_validar'),
        missingData: count('faltan_datos'),
        outOfScope: count('fuera_de_alcance'),
        duplicates: count('duplicado'),
        draftsNotSent: leads.every((l) => l?.enviado === false),
        durationMs: result.durationMs,
      },
      items: leads,
      csv,
      logs: logsOf(result.stdout, result.stderr),
    };
  });
}

// ---------------------------------------------------------------------------
// Soporte original
// ---------------------------------------------------------------------------

export async function runOriginalSupport(input, ctx) {
  const ticket = input?.ticket;
  if (!ticket) throw new Error('Falta el SupportTicketRecord.');
  return withTempDir(async (dir) => {
    ctx.log(`support harness original · ${Array.isArray(ticket) ? `${ticket.length} tickets` : '1 ticket'}`);
    const result = await runProcess({
      command: process.execPath,
      args: [path.join(ORIGINALS, 'support', 'src', 'cli.js'), '-'],
      cwd: dir,
      timeoutMs: 60_000,
      stdin: JSON.stringify(ticket),
    });
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(runFailure('support harness original', result));
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const errors = items.filter((item) => item && typeof item === 'object' && 'error' in item).length;
    const valid = items.filter((item) => item && typeof item === 'object' && !('error' in item));
    const count = (fn) => valid.filter(fn).length;
    return {
      kind: 'support_original',
      summary: {
        tickets: items.length,
        valid: valid.length,
        errors,
        escalated: count((t) => t.mustEscalate === true),
        faqResolved: count((t) => t.mustEscalate === false),
        critical: count((t) => t.severity === 'critical'),
        high: count((t) => t.severity === 'high'),
        durationMs: result.durationMs,
      },
      items,
      logs: logsOf(result.stdout, result.stderr),
    };
  });
}

// ---------------------------------------------------------------------------
// Marketing original
// ---------------------------------------------------------------------------

export async function runOriginalMarketing(input, ctx) {
  if (!process.env.NVIDIA_API_KEY) {
    throw new AdapterBlockedError(
      'El arnés de marketing original requiere NVIDIA_API_KEY. Configúrala en el entorno del worker (no en el input de la actividad).'
    );
  }

  return withTempDir(async (dir) => {
    const defaultBriefing = await readJsonIfExists(path.join(ORIGINALS, 'marketing', 'briefing_ejemplo.json'));
    const briefing = input?.briefing && typeof input.briefing === 'object' ? input.briefing : defaultBriefing;
    if (!briefing) throw new Error('No hay briefing de marketing para ejecutar.');
    await writeFile(path.join(dir, 'briefing.json'), JSON.stringify(briefing, null, 2), 'utf8');

    const model = typeof input?.modelo === 'string' && input.modelo.trim() ? input.modelo.trim() : process.env.MODELO_LLM;
    ctx.log(`arnés marketing original · modelo ${model || 'default'} · obra(s) ${Array.isArray(briefing.piezas) ? briefing.piezas.length : 1}`);
    const result = await runProcess({
      command: pythonCommand(),
      args: [path.join(ORIGINALS, 'marketing', 'agente.py'), '--marketing', 'briefing.json'],
      cwd: dir,
      timeoutMs: 300_000,
      env: {
        NVIDIA_API_KEY: process.env.NVIDIA_API_KEY ?? '',
        BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? '',
        ...(model ? { MODELO_LLM: model } : {}),
      },
    });

    if (result.code !== 0) {
      if (/ModuleNotFoundError|No module named/i.test(result.stderr)) {
        throw new AdapterBlockedError(
          'Faltan dependencias Python para el arnés de marketing. Crea .harness-venv e instala harness/original/marketing/requirements.txt (ver docs/SWARMY_ACTIVITIES.md).'
        );
      }
      throw new Error(runFailure('arnés marketing original', result));
    }

    const outputDir = path.join(dir, 'output_marketing');
    const files = await readdir(outputDir).catch(() => []);
    const materialFiles = files.filter((f) => f.endsWith('.md')).sort();
    const reportFile = files.find((f) => f.startsWith('reporte_ejecucion_') && f.endsWith('.json'));
    if (!materialFiles.length) throw new Error(runFailure('arnés marketing original', result));
    const materials = await Promise.all(
      materialFiles.map(async (file) => ({ file, content: await readFile(path.join(outputDir, file), 'utf8') }))
    );
    const report = reportFile ? await readJsonIfExists(path.join(outputDir, reportFile)) : undefined;
    const completed = report?.piezas_completadas ?? materials.length;
    const failed = report?.piezas_fallidas ?? 0;
    if (completed === 0 && failed > 0) throw new Error(runFailure('arnés marketing original', result));

    return {
      kind: 'marketing_original',
      summary: {
        pieces: report?.piezas_solicitadas ?? materials.length,
        completed,
        failed,
        materials: materials.length,
        durationSeconds: report?.duracion_total_segundos ?? Math.round(result.durationMs / 1000),
        tokens: report?.tokens_totales_estimados ?? null,
        model: model || 'default (NVIDIA)',
        requiresHumanReview: true,
      },
      items: materials,
      report,
      logs: logsOf(result.stdout, result.stderr),
    };
  });
}
