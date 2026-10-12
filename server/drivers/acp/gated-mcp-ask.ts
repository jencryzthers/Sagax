// Grok's own permission ask about a call the Sagax approval gate already
// guards (docs/grok-approval-gate.md).
//
// In `--permission-mode default` Grok runs a client-supplied MCP tool it
// calls directly without asking. With many tools mounted (production:
// 158) it defers them behind its `use_tool` meta tool, and that tool is not
// read-only to Grok, so it asks first: a card for every call, reads
// included. On a gated turn every MCP server Grok can reach was mounted by
// Sagax through the MCP gate, which itself holds every call that is not on
// the reviewed read-only list until the person approves it. Grok's ask
// about such a call is therefore answered "allow once" by the driver, and
// the real decision stays with the gate.
//
// Only a call whose every name resolves to one of THIS turn's gated mounts
// qualifies. Anything else (a built-in tool, a command, a file change, an
// unknown or unmounted server, a use_tool without its target) keeps its
// card, exactly as without the gate.

/** ACP tool kinds that are never an MCP tool call. */
const NOT_MCP_KINDS = new Set(["execute", "edit", "delete", "move", "read", "search", "fetch", "think", "switch_mode"]);
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

function mountedName(raw: unknown, gatedServers: ReadonlySet<string>): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^mcp__/, "");
  for (const server of gatedServers) {
    if (!server || !name.startsWith(`${server}__`)) continue;
    const tool = name.slice(server.length + 2);
    if (tool && TOOL_NAME.test(tool)) return `${server}__${tool}`;
  }
  return null;
}

/** The `<server>__<tool>` this ask is about when it is an MCP call to one of
 * the turn's gated mounts, else null (the ask keeps its card). */
export function gatedMcpAsk(toolCall: unknown, gatedServers: ReadonlySet<string> | undefined): string | null {
  if (!gatedServers?.size || !toolCall || typeof toolCall !== "object") return null;
  const call = toolCall as { kind?: unknown; title?: unknown; rawInput?: unknown; _meta?: unknown };
  const kind = typeof call.kind === "string" ? call.kind : "";
  if (NOT_MCP_KINDS.has(kind)) return null;
  const raw = call.rawInput && typeof call.rawInput === "object" ? (call.rawInput as Record<string, unknown>) : undefined;
  const meta = call._meta && typeof call._meta === "object"
    ? (call._meta as Record<string, unknown>)["x.ai/tool"] as { kind?: unknown; name?: unknown } | undefined
    : undefined;
  const useTool = raw?.variant === "UseTool" || meta?.kind === "use_tool" || meta?.name === "use_tool";
  const names: string[] = [];
  if (useTool) {
    // the meta tool must name its target, and that target must be ours
    const target = mountedName(raw?.tool_name, gatedServers);
    if (!target) return null;
    names.push(target);
    // a title that looks like a tool name must agree with the target
    if (typeof call.title === "string" && /__/.test(call.title)) {
      const titled = mountedName(call.title, gatedServers);
      if (titled !== target) return null;
    }
  } else {
    const titled = mountedName(call.title, gatedServers);
    if (!titled) return null;
    names.push(titled);
  }
  return names[0] ?? null;
}
