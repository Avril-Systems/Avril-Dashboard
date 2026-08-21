import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { fetchDocumentoIdentidad, RagServiceError } from '@/src/lib/ragClient';
import { getMockOpportunities } from '@/components/flows/luck/mock-data';
import { isMarkdownBlueprint } from '@/components/flows/luck/types';
import { structuredBlueprintToMarkdown } from '@/src/lib/blueprintUtils';
import type { Language } from '@/lib/landing-copy';

function mockModeEnabled() {
  return process.env.MOCK_RAG_OPPORTUNITIES === 'true' || !process.env.RAG_SERVICE_BASE_URL;
}

function languageFromRequest(req: Request): Language {
  const accept = req.headers.get('accept-language') || '';
  return accept.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    if (hitRateLimit(`opportunities:blueprint:${ip}`, 40)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryable: true } },
        { status: 429 }
      );
    }

    if (mockModeEnabled()) {
      const mock = getMockOpportunities(languageFromRequest(req)).find((o) => o.id === params.id);
      const bp = mock?.blueprint;
      if (!mock || !bp || isMarkdownBlueprint(bp)) {
        return NextResponse.json(
          { ok: false, error: { code: 'BLUEPRINT_NOT_FOUND', message: 'Blueprint not found', retryable: false } },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, blueprint: { markdown: structuredBlueprintToMarkdown(bp) } });
    }

    const markdown = await fetchDocumentoIdentidad(params.id);

    return NextResponse.json({ ok: true, blueprint: { markdown } });
  } catch (err) {
    if (err instanceof RagServiceError) {
      const status = err.code === 'BLUEPRINT_NOT_FOUND' ? 404 : err.code === 'CONFIG_ERROR' ? 500 : 502;
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message, retryable: err.retryable } },
        { status }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch blueprint', retryable: true } },
      { status: 500 }
    );
  }
}