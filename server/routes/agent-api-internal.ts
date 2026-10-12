// The bot transport of the agent-to-agent API (docs/agent-api.md):
//
//   POST /api/internal/agent-api/<tool>   behind the per-turn agents capability
//
// The capability check, the sender and the source thread come from the
// internal block of server/index.ts. That block calls this matcher and then
// hands the call to server/agent-api.ts.
const INTERNAL_AGENT_API = /^\/api\/internal\/agent-api\/([a-z_]{1,40})$/;

/** The tool a request names, or null when it is not an agent API call. */
export function internalAgentApiTool(method: string, path: string): string | null {
  if (method !== "POST") return null;
  return INTERNAL_AGENT_API.exec(path)?.[1] ?? null;
}
