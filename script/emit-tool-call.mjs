import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const SERVER_SECRET = process.env.CONVEX_SERVER_SECRET;

if (!CONVEX_URL || !SERVER_SECRET) {
  console.error("ERROR: Define CONVEX_URL y CONVEX_SERVER_SECRET en el entorno.");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

export async function emitToolCallCompleted({
  tenantId = "AVRIL_QA_SANDBOX",
  workspaceId = "ws_qa_sandbox",
  runId,
  extension,
  harnessType,
  tool,
  requestId,
  httpStatus,
  rawResponse = "",
  responseHash,
  credentialRef,
  isMock = false,
  sandbox = true,
}) {
  const computedHash =
    responseHash ||
    crypto
      .createHash("sha256")
      .update(typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse))
      .digest("hex");

  return await client.mutation(api.serverOrchestration.ingestEvent, {
    serverSecret: SERVER_SECRET,
    version: "v1.0",
    tenantId,
    workspaceId,
    runId,
    eventType: "tool.call.completed",
    payload: {
      extension,
      harnessType,
      tool,
      requestId,
      httpStatus,
      responseHash: computedHash,
      credentialRef,
      isMock,
      sandbox,
    },
    idempotencyKey: `tool_${runId}_${requestId}`,
    humanApprovalRequired: false,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suffix = Date.now();
  const res = await emitToolCallCompleted({
    tenantId: process.env.TOOL_TENANT_ID || "AVRIL_QA_SANDBOX",
    workspaceId: process.env.TOOL_WORKSPACE_ID || "ws_qa_sandbox",
    runId: process.env.TOOL_RUN_ID || `run_qa_${suffix}`,
    extension: process.env.TOOL_EXTENSION || "github-mcp-server",
    harnessType: process.env.TOOL_HARNESS_TYPE || "openclaw",
    tool: process.env.TOOL_NAME || "get_file_contents",
    requestId: process.env.TOOL_REQUEST_ID || `req_${suffix}`,
    httpStatus: Number(process.env.TOOL_HTTP_STATUS || 200),
    rawResponse: process.env.TOOL_RAW_RESPONSE || "sandbox_ok",
    responseHash: process.env.TOOL_RESPONSE_HASH,
    credentialRef: process.env.TOOL_CREDENTIAL_REF || "SANDBOX_READONLY_REF",
    isMock: process.env.TOOL_IS_MOCK === "true",
    sandbox: process.env.TOOL_SANDBOX !== "false",
  });
  console.log("Resultado emitToolCallCompleted:", res);
}