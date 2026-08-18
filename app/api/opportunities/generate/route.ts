import { NextResponse } from "next/server";
import { getClientIp, hitRateLimit } from "@/src/lib/apiSecurity";
import { fetchRandomBlueprints, RagServiceError } from "@/src/lib/ragClient";
import { mapRagBlueprintToOpportunity } from "@/src/lib/opportunityMapper";
import { getMockOpportunities } from "@/components/flows/luck/mock-data";
import type { Language } from "@/lib/landing-copy";

function mockModeEnabled() {
  return (
    process.env.MOCK_RAG_OPPORTUNITIES === "true" ||
    !process.env.RAG_SERVICE_BASE_URL
  );
}

function languageFromRequest(req: Request): Language {
  const accept = req.headers.get("accept-language") || "";
  return accept.toLowerCase().startsWith("es") ? "es" : "en";
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (hitRateLimit(`opportunities:generate:${ip}`, 20)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Rate limit exceeded",
            retryable: true,
          },
        },
        { status: 429 },
      );
    }

    // E2E simulation hook: force the "empty bank" outcome without touching the RAG.
    // Checked BEFORE mockModeEnabled() so the hook stays reachable even when the
    // offline mock (getMockOpportunities) is active. Only available in dev.
    const { searchParams } = new URL(req.url);
    if (
      process.env.NODE_ENV !== "production" &&
      searchParams.get('simulate') === 'empty-bank'
    ) {
      return NextResponse.json({
        ok: true,
        opportunities: [],
        bankEmpty: true,
        generatedAt: new Date().toISOString(),
      });
    }

    if (mockModeEnabled()) {
      return NextResponse.json({
        ok: true,
        opportunities: getMockOpportunities(languageFromRequest(req)),
        generatedAt: new Date().toISOString(),
      });
    }

    const raw = await fetchRandomBlueprints();
    const opportunities = raw.map(mapRagBlueprintToOpportunity).slice(0, 3);

    return NextResponse.json({
      ok: true,
      opportunities,
      bankEmpty: opportunities.length < 3,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof RagServiceError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            retryable: err.retryable,
          },
        },
        { status: err.code === "CONFIG_ERROR" ? 500 : 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNKNOWN_ERROR",
          message: "Failed to generate opportunities",
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}
