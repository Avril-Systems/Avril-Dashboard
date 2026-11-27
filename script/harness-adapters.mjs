/**
 * Adaptadores REALES de los 4 arneses.
 *
 * Cada función hace trabajo verificable y devuelve `{ summary, items, ... }`:
 *   - prospecting: consulta la API pública de GitHub, verifica perfiles y prioriza.
 *   - b2b:          hace HTTP real a los sitios y califica señales públicas.
 *   - marketing:    descarga una página real y audita contenido/SEO.
 *   - support:      lee eventos y actividades fallidas persistidos en Convex.
 *
 * Sin datos precargados ni resultados inventados: si una fuente falla, la
 * actividad falla o devuelve el fallo explícito en sus items.
 */

import { normalizePublicUrl } from '../src/lib/harnessInput.ts';

export class AdapterBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdapterBlockedError';
  }
}

const USER_AGENT = 'Avril-Swarmy-Harness/1.0 (+https://avril.systems)';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 600_000;

export const PROSPECTING_DEFAULT_QUERIES = [
  'topic:openclaw fork:false pushed:>2026-01-01',
  'topic:mcp-server fork:false pushed:>2026-01-01',
  'topic:ai-agents location:mexico fork:false',
  'agent workflow location:mexico fork:false',
  'claude-code integration fork:false pushed:>2026-01-01',
  'supabase ai automation fork:false',
  'n8n workflow automation fork:false',
];

export const PROSPECTING_HISTORY_CICLO_1 = [
  'goldmar', 'being-gojo', 'will-assistant', 'guillermoscript',
  'HelpCodeai', 'shenhao-stu', 'the911fund', 'mauricioperera',
  'andynadal', 'diegotepichin', 'acbri', 'robinsonmirandaco',
];

const SIGNAL_TERMS = ['agent', 'mcp', 'workflow', 'api', 'bot', 'rag', 'docker', 'supabase', 'automation', 'llm', 'openai', 'claude'];
const B2B_TERMS = ['erp', 'crm', 'supabase', 'database', 'automation', 'webhook', 'b2b', 'enterprise', 'workflow'];
const TECH_SIGNALS = [
  { label: 'Supabase', needle: 'supabase' },
  { label: 'Stripe', needle: 'stripe' },
  { label: 'HubSpot', needle: 'hubspot' },
  { label: 'Salesforce', needle: 'salesforce' },
  { label: 'Shopify', needle: 'shopify' },
  { label: 'Webflow', needle: 'webflow' },
  { label: 'Calendly', needle: 'calendly' },
  { label: 'Intercom', needle: 'intercom' },
  { label: 'Zendesk', needle: 'zendesk' },
  { label: 'Segment', needle: 'segment.com' },
  { label: 'Mixpanel', needle: 'mixpanel' },
  { label: 'PostHog', needle: 'posthog' },
  { label: 'Next.js', needle: '/_next/' },
  { label: 'Vercel', needle: 'vercel' },
];

// ---------------------------------------------------------------------------
// helpers de red / HTML
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(value) {
  return decodeEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function resolveHref(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function collectHeadings(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    const text = stripTags(m[1]);
    if (text) out.push(text.slice(0, 180));
  }
  return out;
}

function collectLinks(html, baseUrl) {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < 200) {
    const href = resolveHref(m[1].trim(), baseUrl);
    const label = stripTags(m[2]).slice(0, 120);
    if (href) out.push({ href, label });
  }
  return out;
}

/** Extrae señales verificables de una página. Exportada para pruebas unitarias. */
export function extractHtmlSignals(html, baseUrl) {
  const raw = String(html ?? '');
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? '').trim()).slice(0, 300);
  const description = metaContent(raw, 'description') ?? metaContent(raw, 'og:description') ?? '';
  const canonical = metaContent(raw, 'canonical') ?? (/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(raw)?.[1] ?? '');
  const lang = /<html[^>]+lang=["']([^"']+)["']/i.exec(raw)?.[1] ?? '';
  const h1 = collectHeadings(raw, 'h1');
  const h2 = collectHeadings(raw, 'h2');
  const links = collectLinks(raw, baseUrl);
  const contactLinks = links.filter((l) => /^mailto:/i.test(l.href) || /contact|contacto|soporte|support/i.test(l.label) || /contact|soporte|support/i.test(l.href));
  const ctaLinks = links.filter((l) => /demo|prueba|trial|empezar|start|agenda|reservar|comprar|precio|pricing|contratar|hablar/i.test(l.label)).slice(0, 12);
  const text = stripTags(raw);
  const lower = raw.toLowerCase();
  const tech = TECH_SIGNALS.filter((s) => lower.includes(s.needle)).map((s) => s.label);
  const social = [...new Set(
    links
      .map((l) => {
        try {
          return new URL(l.href).hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      })
      .filter((host) => /^(x|twitter|linkedin|github|youtube|instagram|facebook)\.com$/i.test(host))
  )];
  return {
    title,
    description,
    canonical: canonical ? resolveHref(canonical, baseUrl) : '',
    lang,
    h1,
    h2,
    links,
    contactLinks,
    ctaLinks,
    text,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    tech,
    social,
    hasForm: /<form\b/i.test(raw),
    ogTitle: metaContent(raw, 'og:title') ?? '',
    ogImage: (() => { const v = metaContent(raw, 'og:image'); return v ? resolveHref(v, baseUrl) : ''; })(),
  };
}

async function fetchPage(url) {
  // Seguimos redirecciones a mano para validar cada salto: un sitio público no
  // puede redirigir a localhost/red privada (SSRF). El input ya viene validado,
  // pero el Location de una respuesta es dato externo.
  let current = normalizePublicUrl(url);
  for (let hop = 0; hop < 6; hop += 1) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`Redirección HTTP ${res.status} sin Location en ${current}.`);
      current = normalizePublicUrl(new URL(location, current).toString());
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = (await res.text()).slice(0, MAX_HTML_BYTES);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || current,
      contentType,
      body,
      fetchedAt: new Date().toISOString(),
    };
  }
  throw new Error(`Demasiadas redirecciones al consultar ${url}.`);
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// B2B: calificación de cuentas con HTTP real
// ---------------------------------------------------------------------------

function scoreB2B(signals) {
  let score = 0;
  const reasons = [];
  const copy = `${signals.title} ${signals.description} ${signals.text.slice(0, 4000)}`.toLowerCase();

  if (/\b(b2b|enterprise|empresa|business|operations|operaciones)\b/.test(copy)) {
    score += 2;
    reasons.push('Mensaje orientado a empresas/operaciones');
  }
  if (signals.tech.some((t) => ['Supabase', 'Stripe', 'HubSpot', 'Salesforce', 'Segment'].includes(t))) {
    score += 2;
    reasons.push('Stack con señales de automatización/ventas');
  }
  if (signals.ctaLinks.length > 0) {
    score += 1;
    reasons.push('CTA comercial visible');
  }
  if (signals.contactLinks.length > 0 || signals.hasForm) {
    score += 1;
    reasons.push('Canal de contacto o formulario');
  }
  if (/\b(pricing|precios|planes|demo)\b/.test(copy)) {
    score += 1;
    reasons.push('Menciona precios/demo');
  }
  if (signals.wordCount >= 250) {
    score += 1;
    reasons.push('Contenido sustancial (>250 palabras)');
  }
  if (signals.h1.length === 1) {
    score += 1;
    reasons.push('Jerarquía H1 clara');
  }

  return { score: Math.min(score, 10), reasons };
}

export async function runB2B(input, ctx) {
  if (ctx.signal?.aborted) throw new Error('Ejecución cancelada.');
  const targets = Array.isArray(input?.targets) ? input.targets.slice(0, 20) : [];
  if (!targets.length) throw new Error('La actividad B2B requiere al menos un dominio o URL.');

  const items = [];
  for (const target of targets) {
    ctx.log(`HTTP GET ${target}`);
    try {
      const page = await fetchPage(target);
      if (!page.ok) {
        items.push({
          name: hostLabel(page.finalUrl || target),
          url: target,
          finalUrl: page.finalUrl,
          httpStatus: page.status,
          reachable: false,
          error: `HTTP ${page.status}`,
          fetchedAt: page.fetchedAt,
        });
        continue;
      }
      const signals = extractHtmlSignals(page.body, page.finalUrl);
      const { score, reasons } = scoreB2B(signals);
      items.push({
        name: signals.title || hostLabel(page.finalUrl),
        url: target,
        finalUrl: page.finalUrl,
        httpStatus: page.status,
        reachable: true,
        title: signals.title,
        description: signals.description,
        tech: signals.tech,
        cta: signals.ctaLinks.slice(0, 5),
        contact: signals.contactLinks.slice(0, 5),
        hasForm: signals.hasForm,
        wordCount: signals.wordCount,
        score,
        fit: score >= 6 ? 'alto' : score >= 3 ? 'medio' : 'bajo',
        reasons,
        fetchedAt: page.fetchedAt,
      });
    } catch (err) {
      items.push({
        name: hostLabel(target),
        url: target,
        httpStatus: null,
        reachable: false,
        error: err instanceof Error ? err.message : 'Error de red',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  const reachable = items.filter((i) => i.reachable);
  if (!reachable.length) {
    throw new Error(`Ningún objetivo respondió correctamente: ${items.map((i) => `${i.name} (${i.error})`).join('; ')}`.slice(0, 900));
  }
  const average = reachable.reduce((sum, i) => sum + i.score, 0) / reachable.length;
  return {
    kind: 'b2b',
    summary: {
      targets: targets.length,
      reachable: reachable.length,
      unreachable: items.length - reachable.length,
      qualified: reachable.filter((i) => i.fit !== 'bajo').length,
      averageScore: Math.round(average * 10) / 10,
    },
    items: items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
  };
}

// ---------------------------------------------------------------------------
// Marketing: auditoría de una página real
// ---------------------------------------------------------------------------

export async function runMarketing(input, ctx) {
  const url = typeof input?.url === 'string' ? input.url : 'https://avril.systems';
  const keywords = Array.isArray(input?.keywords) ? input.keywords.slice(0, 10) : [];
  ctx.log(`HTTP GET ${url}`);
  const page = await fetchPage(url);
  if (!page.ok) throw new Error(`La página respondió HTTP ${page.status} (${page.finalUrl}).`);

  const signals = extractHtmlSignals(page.body, page.finalUrl);
  const findings = [];
  const add = (severity, area, message, recommendation) => findings.push({ severity, area, message, recommendation });

  if (!signals.title) add('high', 'SEO', 'Falta <title>.', 'Añade un título único de 20–65 caracteres.');
  else if (signals.title.length < 20 || signals.title.length > 65) {
    add('medium', 'SEO', `El title tiene ${signals.title.length} caracteres.`, 'Mantenlo entre 20 y 65 caracteres.');
  }
  if (!signals.description) add('high', 'SEO', 'Falta meta description.', 'Añade una descripción de 70–160 caracteres.');
  else if (signals.description.length < 70 || signals.description.length > 160) {
    add('medium', 'SEO', `La meta description tiene ${signals.description.length} caracteres.`, 'Ajusta a 70–160 caracteres.');
  }
  if (signals.h1.length !== 1) {
    add('medium', 'Contenido', `Se encontraron ${signals.h1.length} H1.`, 'Deja exactamente un H1 por página.');
  }
  if (signals.wordCount < 300) {
    add('medium', 'Contenido', `Solo ${signals.wordCount} palabras visibles.`, 'Amplía la propuesta de valor y las pruebas.');
  }
  if (!signals.ctaLinks.length) {
    add('high', 'Conversión', 'No se detectó un CTA claro.', 'Añade un CTA principal (demo, prueba o contacto).');
  }
  if (!signals.ogTitle || !signals.ogImage) {
    add('low', 'Distribución', 'Faltan metadatos Open Graph completos.', 'Añade og:title y og:image para compartir en redes.');
  }
  if (keywords.length) {
    const text = signals.text.toLowerCase();
    const missing = keywords.filter((k) => !text.includes(String(k).toLowerCase()));
    if (missing.length) add('low', 'Contenido', `Palabras clave ausentes: ${missing.join(', ')}.`, 'Inclúyelas de forma natural en el contenido visible.');
  }

  const weight = { high: 15, medium: 8, low: 4 };
  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + (weight[f.severity] ?? 0), 0));

  return {
    kind: 'marketing',
    summary: {
      url,
      finalUrl: page.finalUrl,
      httpStatus: page.status,
      title: signals.title,
      description: signals.description,
      wordCount: signals.wordCount,
      h1: signals.h1.length,
      h2: signals.h2.length,
      cta: signals.ctaLinks.length,
      tech: signals.tech,
      findings: findings.length,
      score,
      fetchedAt: page.fetchedAt,
    },
    items: findings,
  };
}

// ---------------------------------------------------------------------------
// Soporte: triaje de datos reales del tenant
// ---------------------------------------------------------------------------

export async function runSupport(input, ctx) {
  const lookbackHours = Math.min(168, Math.max(1, Number(input?.lookbackHours) || 24));
  const severity = typeof input?.severity === 'string' ? input.severity.trim().toLowerCase() : '';
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;

  const events = await ctx.convex.query(ctx.anyApi.serverOrchestration.listEventsByTenant, {
    serverSecret: ctx.serverSecret,
    tenantId: ctx.tenantId,
    limit: 500,
  });
  const [failed, blocked] = await Promise.all([
    ctx.convex.query(ctx.anyApi.serverOrchestration.listHarnessActivities, {
      serverSecret: ctx.serverSecret,
      tenantId: ctx.tenantId,
      status: 'failed',
      includeResult: false,
      limit: 100,
    }),
    ctx.convex.query(ctx.anyApi.serverOrchestration.listHarnessActivities, {
      serverSecret: ctx.serverSecret,
      tenantId: ctx.tenantId,
      status: 'blocked',
      includeResult: false,
      limit: 100,
    }),
  ]);

  const errors = (events ?? []).filter((e) => {
    if (e.type !== 'error.reported') return false;
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at < cutoff) return false;
    if (!severity) return true;
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
    return String(payload.severity ?? '').toLowerCase() === severity;
  });

  const inWindow = (a) => {
    const at = Date.parse(a.finishedAt || a.updatedAt || a.createdAt);
    return Number.isFinite(at) && at >= cutoff;
  };
  const failedInWindow = (failed ?? []).filter(inWindow);
  const blockedInWindow = (blocked ?? []).filter(inWindow);
  const activityFailures = [...failedInWindow, ...blockedInWindow];

  const groups = new Map();
  for (const event of errors) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const step = typeof payload.step === 'string' && payload.step ? payload.step : 'general';
    const current = groups.get(step) ?? { key: step, count: 0, lastAt: event.createdAt, examples: [] };
    current.count += 1;
    if (Date.parse(event.createdAt) > Date.parse(current.lastAt)) current.lastAt = event.createdAt;
    if (current.examples.length < 3) {
      current.examples.push({
        runId: event.runId,
        message: String(payload.message ?? 'Error sin mensaje').slice(0, 300),
        severity: payload.severity,
        at: event.createdAt,
      });
    }
    groups.set(step, current);
  }
  for (const activity of activityFailures) {
    const key = `${activity.harnessType}: ${activity.activity}`;
    const current = groups.get(key) ?? { key, count: 0, lastAt: activity.finishedAt || activity.updatedAt, examples: [] };
    current.count += 1;
    const lastAt = activity.finishedAt || activity.updatedAt;
    if (Date.parse(lastAt) > Date.parse(current.lastAt)) current.lastAt = lastAt;
    if (current.examples.length < 3) {
      current.examples.push({
        activityId: activity.activityId,
        runId: activity.runId,
        message: String(activity.error ?? activity.status).slice(0, 300),
        at: lastAt,
      });
    }
    groups.set(key, current);
  }

  const items = [...groups.values()].sort((a, b) => b.count - a.count || Date.parse(b.lastAt) - Date.parse(a.lastAt));
  const latestAt = items.reduce((latest, g) => (!latest || Date.parse(g.lastAt) > Date.parse(latest) ? g.lastAt : latest), '');
  return {
    kind: 'support',
    summary: {
      windowHours: lookbackHours,
      severity: severity || null,
      errorEvents: errors.length,
      failedActivities: failedInWindow.length,
      blockedActivities: blockedInWindow.length,
      groups: items.length,
      latestAt: latestAt || null,
      scannedEvents: (events ?? []).length,
    },
    items,
    findings: items.length
      ? items.slice(0, 5).map((g) => ({
          severity: 'medium',
          area: 'Soporte',
          message: `${g.key}: ${g.count} incidente(s). Último: ${g.examples[0]?.message ?? 'sin mensaje'}`,
          recommendation: 'Revisar el run asociado y reejecutar la actividad cuando el recurso esté disponible.',
        }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// Prospección: GitHub real + gate de verificación
// ---------------------------------------------------------------------------

function githubHeaders(token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function githubRequest(path, token, state) {
  state.requests += 1;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (remaining !== null) state.remaining = Number(remaining);
  if (res.status === 403 || res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const message = String(body?.message ?? `HTTP ${res.status}`);
    throw new AdapterBlockedError(
      `GitHub limitó las peticiones (${message}). Define GITHUB_TOKEN o espera al reset; no se inventaron resultados.`
    );
  }
  if (res.status === 404) return { ok: false, status: 404, data: null };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return { ok: true, status: res.status, data: await res.json() };
}

async function profileExists(login) {
  const res = await fetch(`https://github.com/${encodeURIComponent(login)}`, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res.status === 200;
}

function buildProspect(candidate, user, repos) {
  const login = candidate.handle;
  const languages = [...new Set((repos ?? []).map((r) => r.language).filter(Boolean))];
  const repoText = (repos ?? [])
    .map((r) => `${r.name ?? ''} ${r.description ?? ''} ${(r.topics ?? []).join(' ')}`)
    .join(' ')
    .toLowerCase();
  const candidateText = `${candidate.description ?? ''} ${(candidate.topics ?? []).join(' ')}`.toLowerCase();
  const combined = `${repoText} ${candidateText}`;
  const b2b = B2B_TERMS.some((term) => combined.includes(term));
  const publicRepos = Number(user?.public_repos ?? 0);

  const tipo = b2b ? 'B2B Ops & Tech Lead' : 'Indie Builder / AI Developer (Lab Seat)';
  const oferta = b2b ? '$15 Trial de 7 Días / Solución B2B ($200+ USD)' : '$6 Day Pass / $15 Trial';
  const fit = b2b
    ? `Mantiene '${candidate.repo_name}', con señales de integración/automatización B2B.`
    : `Mantenedor de '${candidate.repo_name}'. Requiere staging hosted 24/7.`;
  const confidence = publicRepos >= (b2b ? 5 : 4) ? 'Alto' : 'Medio';
  const score = b2b ? 3 : confidence === 'Alto' ? 2 : 1;

  return {
    handle: login,
    canal: 'GitHub',
    url_perfil: candidate.profile_url,
    fecha_consulta: new Date().toISOString().slice(0, 10),
    url_exacta_evidencia: candidate.repo_url || candidate.profile_url,
    cita_textual_fuente: `"${String(candidate.description ?? user?.bio ?? 'Sin descripción textual').slice(0, 240)}"`,
    estado_verificacion: 'VERIFICADO_OK',
    criterios_cumplidos: [
      'Verificación HTTP 200 OK en perfil',
      `Posee ${publicRepos} repositorios públicos (Mínimo 3)`,
      'Demuestra stack activo de IA/agentes/integración',
      `Señal comercial clara para ${tipo}`,
    ],
    tipo_comprador: tipo,
    repos_publicos: publicRepos,
    stack_detectado: languages,
    por_que_compraria: fit,
    objecion_esperada: 'Prefiero ejecutar localmente en mi PC o servidor personal [HIPÓTESIS].',
    oferta_sugerida: oferta,
    nivel_confianza: confidence,
    mejor_siguiente_accion: b2b
      ? 'Presentar propuesta de orquestación cloud para eliminar mantenimiento en VPS.'
      : 'Ofrecer Day Pass ($6) para aislar ejecuciones sin agotar RAM local.',
    _score_prioridad: score,
  };
}

export async function runProspecting(input, ctx) {
  const token = process.env.GITHUB_TOKEN?.trim() || '';
  const state = { remaining: null, requests: 0, usedToken: Boolean(token) };
  const history = new Set(
    [...PROSPECTING_HISTORY_CICLO_1, ...(Array.isArray(ctx.history) ? ctx.history : [])].map((h) => String(h).toLowerCase())
  );
  const requestedQueries = Array.isArray(input?.queries) && input.queries.length ? input.queries : PROSPECTING_DEFAULT_QUERIES;
  const queries = requestedQueries.slice(0, token ? 7 : 2);
  const maxCandidates = Math.min(Number(input?.maxCandidates) || 20, token ? 40 : 8);

  const discovered = [];
  const seen = new Set();
  for (const query of queries) {
    ctx.log(`GitHub search: ${query}`);
    const res = await githubRequest(
      `/search/repositories?q=${encodeURIComponent(query)}&per_page=15&sort=updated`,
      token,
      state
    );
    for (const repo of res.data?.items ?? []) {
      const login = repo?.owner?.login;
      if (!login || seen.has(login.toLowerCase()) || history.has(login.toLowerCase())) continue;
      seen.add(login.toLowerCase());
      discovered.push({
        handle: login,
        profile_url: `https://github.com/${login}`,
        repo_name: repo.name,
        repo_url: repo.html_url,
        description: repo.description ?? '',
        topics: Array.isArray(repo.topics) ? repo.topics : [],
        query_origen: query,
        fecha_descubrimiento: new Date().toISOString(),
      });
      if (discovered.length >= maxCandidates) break;
    }
    if (discovered.length >= maxCandidates) break;
  }

  if (!discovered.length) {
    return {
      summary: { queries: queries.length, discovered: 0, rejected: 0, verified: 0, top5: 0, usedToken: state.usedToken },
      items: [],
      rejections: [],
      note: 'No hubo candidatos nuevos que no estuvieran ya en el historial.',
    };
  }

  const verified = [];
  const rejections = [];
  for (const candidate of discovered) {
    const login = candidate.handle;
    try {
      const alive = await profileExists(login);
      if (!alive) {
        rejections.push({ handle: login, motivo: 'El perfil no respondió HTTP 200.' });
        continue;
      }
      const userRes = await githubRequest(`/users/${encodeURIComponent(login)}`, token, state);
      const publicRepos = Number(userRes.data?.public_repos ?? 0);
      if (publicRepos < 3) {
        rejections.push({ handle: login, motivo: `Solo ${publicRepos} repositorio(s) público(s). Mínimo 3.` });
        continue;
      }
      const reposRes = await githubRequest(`/users/${encodeURIComponent(login)}/repos?per_page=10&sort=updated`, token, state);
      const repos = Array.isArray(reposRes.data) ? reposRes.data : [];
      const repoText = repos.map((r) => `${r.name ?? ''} ${r.description ?? ''} ${(r.topics ?? []).join(' ')}`).join(' ').toLowerCase();
      const candidateText = `${candidate.description ?? ''} ${candidate.topics.join(' ')}`.toLowerCase();
      if (!SIGNAL_TERMS.some((term) => `${repoText} ${candidateText}`.includes(term))) {
        rejections.push({ handle: login, motivo: 'Sin señales de agentes/MCP/automatización en repos recientes.' });
        continue;
      }
      verified.push(buildProspect(candidate, userRes.data, repos));
    } catch (err) {
      if (err instanceof AdapterBlockedError) throw err;
      rejections.push({ handle: login, motivo: err instanceof Error ? err.message : 'Error al verificar.' });
    }
    await sleep(state.usedToken ? 100 : 300);
  }

  const ordered = verified.sort((a, b) => b._score_prioridad - a._score_prioridad);
  // Se conservan todos los verificados; los 5 primeros quedan marcados como top 5.
  const all = ordered.map(({ _score_prioridad, ...rest }, index) => ({ ...rest, prioridad: index + 1 }));
  const top5 = all.slice(0, 5);
  return {
    kind: 'prospecting',
    summary: {
      queries: queries.length,
      discovered: discovered.length,
      rejected: rejections.length,
      verified: all.length,
      top5: top5.length,
      rateRatio: discovered.length ? Math.round((all.length / discovered.length) * 100) : 0,
      usedToken: state.usedToken,
      githubRequests: state.requests,
      rateLimitRemaining: state.remaining,
    },
    items: all,
    top5Handles: top5.map((p) => p.handle),
    rejections: rejections.slice(0, 20),
    note: state.usedToken
      ? undefined
      : 'Sin GITHUB_TOKEN se limitó a 2 búsquedas y 8 candidatos para respetar el rate limit anónimo.',
  };
}
