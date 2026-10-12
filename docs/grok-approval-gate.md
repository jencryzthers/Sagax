# Grok approval gate (Sagax gates MCP calls; Grok runs in default mode)

## Why
In `--permission-mode auto`, Grok runs its safety classifier before **every** MCP tool call. On GOX this measured 4–9 s (up to 17 s, and once an approval card for the read-only `agents__list_bots`) for tools that answer in under 0.5 s. Allow rules do not skip it over ACP (repro below). In `default` mode Grok runs MCP tools supplied by the ACP client with no prompt at all, so Sagax gates them itself.

## How it works
- **Flag:** `DATA_DIR/grok-approval-gate.json`, either `{"bots": ["<botId>"]}` or `{"bots": "all"}`. A missing, empty or invalid file means off, and Grok runs in auto mode as before. The file is read on every turn; the next turn of each bot respawns Grok in the new mode.
- **Scope:** only Auto turns (`approvalMode: "auto"`, not Full access). Ask, Edits and Full access are unchanged.
- **When the flag is on:**
  - Grok starts with `--permission-mode default`. Its built-in tools still prompt through ACP, and their cards are unchanged.
  - Every MCP server, built-in or not, is mounted through `mcp-gate` with an approval socket (`server/mcp-gate-approval.ts`).
  - Only reviewed read-only tools run unasked:
    - agents: `READ_ONLY_AGENT_TOOL_NAMES`
    - harness-spawned Perspicax bridges: `PERSPICAX_READ_ONLY_TOOLS`
  - Every other call, including unknown, new and third-party tools, waits for a canonical approval card. A server's own `readOnlyHint` is ignored.
- **Fail closed:** a decline, the 15 min timeout, a stopped turn, no running turn, a closed or unreachable socket, an answer other than an explicit allow, a corrupt config, and JSON-RPC batches or unreadable frames all mean the call never reaches the server.
- **No replay:** each call is its own card. An "always" answer is not reused.

## Rollback
Remove the bot from the flag file (or delete the file). That needs no deploy.

## Grok bug: allow rules do not skip the auto classifier over ACP
xAI has no public issue tracker (`xai-org/grok-build` has issues disabled), so the repro lives here.

**Docs claim** (user guide 22-permissions-and-safety, "How a tool call is authorized"): rules (`--allow`, `[permission] allow`) are evaluated before the mode's prompt policy, where the auto classifier runs.

**Observed** with grok 1.0.46 (server) and 1.0.50 (Mac), `grok --permission-mode auto [rules] agent stdio`:
1. The client is `initialize` with `clientInfo: {name: "openmausbot"}`.
2. `session/new` passes one stdio MCP server `clock` with one tool, `query_time`.
3. The prompt is "call clock__query_time once".

The classifier gap is the time between `pending_interaction kind=permission` and `interaction_resolved`:

| Mode / rule | Gap | Card |
|---|---|---|
| auto, no rule | 4.5 s | none |
| auto, `--allow 'MCPTool(clock__query_time)'` | 7.9 s | none |
| auto, project `.grok/config.toml` `[permission] allow = ["MCPTool(clock__query_time)"]` | 6.7 s | none |
| auto, `--allow MCPTool` | 7.3 s | none |
| auto, `--allow mcp__clock__query_time` | 6.1 s | none |
| auto, `--allow '*'` | 6.8 s | none |
| default, any rule or none | 0 s | none (the tool runs) |

On GOX, the live ACP wire log shows `pending_interaction` for `agents__list_bots` from 00:25:43.001 to 00:25:51.474 UTC, with `--allow MCPTool(agents__list_bots)` on argv.

PreToolUse hooks cannot pre-approve: per the docs, a hook "allow" only means "not blocked".
