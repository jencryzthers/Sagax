# The agent-to-agent API

Ten tools let one agent find, prompt and read another agent, with the same
names, parameters and limits as Grok Bot's agent tools. One core
(`server/agent-api.ts`) serves two transports:

- **Bots**: the agents MCP server offers the tools in a bot's direct turns
  (`SAGAX_AGENT_API=1`, set when the bot holds at least one scope; `create_agent` only for a Primary Bot; never in a
  room or an external runtime). Calls go to `POST /api/internal/agent-api/<tool>`
  behind the per-turn capability.
- **People's AI clients** (Perspicax): `POST /api/org/member/agents/{tool}`,
  acting as the person (see [org-member-api.md](org-member-api.md)).

## Tools

| Tool | Kind | Scope | What |
|---|---|---|---|
| `list_agents` | read | `agents.read` | every agent the caller can reach, with status `running`/`idle` |
| `find_agents` | read | `agents.read` | `query`, optional `status` (`running`/`idle`), `limit` ≤ 64 (default 8) |
| `create_agent` | admin | `agents.create` | one agent per call, `name` (≤ 80 chars, one line), optional `description`; it greets the person itself. Only on the person's explicit ask |
| `send_prompt` | write | `agents.send` | `agent_id`, `prompt` (≤ 32,000 chars), `mode` `fire_and_forget` (default) / `blocking` / `async`, `timeout_ms` (1 s to 10 min, default 120 s), `on_busy` `supersede` (default) / `reject` / `queue`, up to 8 `files` (workspace-relative, 25 MiB each). Answers a `handle` |
| `await_turn` | read | `agents.read` | `agent_id`, `handle`, `timeout_ms`. Never send the prompt again: wait again with the same handle |
| `read_transcript` | read | `agents.read` | the whole transcript (the newest 2,000 entries; `truncated` says when there were more) |
| `read_transcript_page` | read | `agents.read` | one bounded page: `limit` (1 to 200) and `before_ms` required, `after_ms` optional (inclusive unix ms), `cursor` for the next older page |
| `read_latest_page` | read | `agents.read` | the newest page: `limit` ≤ 200 (default 20), `cursor` |
| `read_latest_page_with_threads` | read | `agents.read` | the newest page and the conversations it spans, with their status |
| `read_transcript_cold` | read | `agents.read` | the stored transcript only: pages of 50 by `cursor`; never reads live state, never wakes a computer or sandbox |

Results: `await_turn` and a `blocking` send answer `{finished, reply,
status}`. An empty `reply` with `finished: true` means the turn ended without
text. `finished: false` comes with `next`, telling the caller to wait again
with the same handle. Entries are `{cursor, id, thread_id, role, at, from,
kind, text}`, oldest first. Here `at` is unix milliseconds and `kind` is
`text`, `note` or `tool`. Tool steps carry only the tool's name, never its
input or output, and reasoning is never included. A page's `next_cursor`
reads the entries just before it.

## Guarantees

- **Hidden conversations**: every prompt lands in a hidden conversation owned
  by the caller (#291/#302), never in the person's own chat with the agent. A
  caller's later sends continue the same conversation. `supersede` interrupts
  only that conversation.
- **Isolation**: a bot reaches only its peers. That means the same team and
  scope, the per-pair allow-list, and never a hidden bot. A person reaches
  what `GET /api/bots` shows them, and nothing else exists for them (404
  `unknown_agent`).
- **Handles** are HMAC-signed with a server key (`agent-api.key`, mode 0600)
  and bound to the caller and the agent. They expire after 7 days.
- **One hop**: a prompt a bot received from another agent cannot be passed on
  (409 `too_deep`).
- **Approval gate**: a bot whose peer contact needs review raises the
  `delegate_bot` card before its prompt goes out.
- **Scopes**:
  - Bots hold `agents.read` and `agents.send`. A Primary Bot that is not
    read-only also holds `agents.create`.
  - `agent-api-grants.json` in the data directory narrows this per bot:
    `{"bots": {"<id>": ["agents.read"]}}`. An empty list removes the tools.
  - For people, the scopes come from `clients.botsRead`, `clients.botsMessage`
    and `clients.agentsCreate`, which is off by default.
- **Rate limits** are per caller and tool, over a sliding minute or hour:

  | Tools | Limit |
  |---|---|
  | reads | 240 per minute |
  | `send_prompt` | 30 per minute |
  | `create_agent` | 5 per hour |

  Going over answers 429 with `retry_after_ms`.
- **Audit**: every call is written to the admin activity log (`category:
  client`, action `agents.<tool>`). Each entry records the outcome, the
  agent and the mode, but never the prompt, the reply or a file.
- **No delete tool**: the owner deletes an agent in Sagax.

## Files

A bot names files relative to its workspace or conversation folder. Paths
are resolved with realpath and confined to those roots. An AI client sends
the bytes (`{path, content_base64}`), and the request can be up to 64 MiB.
The files are copied to the target's workspace under `inbox/<sender>/`, and
the prompt names them.
