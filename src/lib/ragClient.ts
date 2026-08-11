import 'server-only';

const RAG_BASE_URL = process.env.RAG_SERVICE_BASE_URL;

type RagBlueprintRaw = {
  id: string;
  nombre_empresa: string;
  categoria: string;
  score: number;
  cliente_ideal: string;
  problema: string;
  oferta_inicial: string;
  agentes_necesarios: string[];
};

type RagRandomResponse = {
  status: string;
  data: RagBlueprintRaw[];
};

type RagDocumentoIdentidadResponse = {
  status: string;
  data: {
    id: string;
    nombre_empresa: string;
    documento_identidad: string;
  };
};

class RagServiceError extends Error {
  constructor(message: string, public code: string, public retryable: boolean) {
    super(message);
  }
}

function requireBaseUrl(): string {
  if (!RAG_BASE_URL) {
    throw new RagServiceError('RAG_SERVICE_BASE_URL is not configured', 'CONFIG_ERROR', false);
  }
  return RAG_BASE_URL;
}

export async function fetchRandomBlueprints(): Promise<RagBlueprintRaw[]> {
  const baseUrl = requireBaseUrl();
  const res = await fetch(`${baseUrl}/api/blueprints/random`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new RagServiceError(
      `RAG /random responded with ${res.status}`,
      'RAG_UPSTREAM_ERROR',
      res.status >= 500
    );
  }

  const json = (await res.json()) as RagRandomResponse;
  if (json.status !== 'success' || !Array.isArray(json.data)) {
    throw new RagServiceError('RAG /random returned an unexpected shape', 'RAG_INVALID_RESPONSE', true);
  }

  return json.data;
}

export async function fetchDocumentoIdentidad(uuid: string): Promise<string> {
  const baseUrl = requireBaseUrl();
  const res = await fetch(`${baseUrl}/api/blueprints/${encodeURIComponent(uuid)}/documento_identidad`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (res.status === 404) {
    throw new RagServiceError('Blueprint not found', 'BLUEPRINT_NOT_FOUND', false);
  }
  if (!res.ok) {
    throw new RagServiceError(
      `RAG /documento_identidad responded with ${res.status}`,
      'RAG_UPSTREAM_ERROR',
      res.status >= 500
    );
  }

  const json = (await res.json()) as RagDocumentoIdentidadResponse;
  if (json.status !== 'success' || typeof json.data?.documento_identidad !== 'string') {
    throw new RagServiceError('RAG /documento_identidad returned an unexpected shape', 'RAG_INVALID_RESPONSE', true);
  }

  return json.data.documento_identidad;
}

export { RagServiceError };
export type { RagBlueprintRaw };