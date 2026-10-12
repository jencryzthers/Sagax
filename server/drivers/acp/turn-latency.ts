// One line per ACP turn with the server's own stages, so a slow answer can be
// pinned to a stage from the logs alone (docs/grok-latency.md):
//
//   [turn-latency] grok thread=800b207c path=pooled queue=99ms setup=21ms ttfa=1150ms ttft=1150ms tools=1 total=2111ms prompt=1655ch full=no in=18225 cached=16000 ok
//
// queue: the person's message was stored -> the engine took the turn
// (context, recall, place); setup: the engine took it -> the prompt was sent
// (spawn, handshake, session/new|load, mode and model); ttfa: prompt -> the
// first thing the model streamed (thought, text or tool call); ttft: prompt ->
// first answer text; total: the engine took it -> settled. path: pooled (live
// session prompted as is), load (pooled process, session re-established),
// spawn (a new process). Ids, sizes and milliseconds only: never the words.

export type TurnLatencyPath = "pooled" | "load" | "spawn";

export interface TurnLatency {
  /** sendTurn took the turn (epoch ms) */
  start: number;
  /** the person's message was stored (epoch ms), when the caller knows it */
  receivedAt?: number;
  path?: TurnLatencyPath;
  promptAt?: number;
  firstActivityAt?: number;
  firstTextAt?: number;
  tools: number;
  promptChars?: number;
  /** the prompt carried the full system block */
  full?: boolean;
  inputTokens?: number;
  cachedTokens?: number;
  /** the stall guard cancelled a silent prompt and asked again */
  stallRetried?: boolean;
  stallMs?: number;
}

export function newTurnLatency(start: number, receivedAt?: number): TurnLatency {
  return { start, tools: 0, ...(typeof receivedAt === "number" && Number.isFinite(receivedAt) && receivedAt > 0 && receivedAt <= start ? { receivedAt } : {}) };
}

/** Record a streamed update of the running prompt. */
export function noteTurnActivity(trace: TurnLatency | undefined, kind: string, at: number): void {
  if (!trace || trace.promptAt === undefined) return;
  if (kind !== "agent_message_chunk" && kind !== "agent_thought_chunk" && kind !== "tool_call") return;
  trace.firstActivityAt ??= at;
  if (kind === "agent_message_chunk") trace.firstTextAt ??= at;
  if (kind === "tool_call") trace.tools += 1;
}

export function turnLatencyLine(driver: string, threadId: string, trace: TurnLatency, end: number, outcome: string): string {
  const ms = (from: number | undefined, to: number | undefined) =>
    from === undefined || to === undefined ? "?" : `${Math.max(0, Math.round(to - from))}ms`;
  const parts = [
    `[turn-latency] ${driver} thread=${threadId.slice(0, 8)}`,
    `path=${trace.path ?? "?"}`,
    `queue=${ms(trace.receivedAt, trace.start)}`,
    `setup=${ms(trace.start, trace.promptAt)}`,
    `ttfa=${ms(trace.promptAt, trace.firstActivityAt)}`,
    `ttft=${ms(trace.promptAt, trace.firstTextAt)}`,
    `tools=${trace.tools}`,
    `total=${ms(trace.start, end)}`,
    `prompt=${trace.promptChars ?? "?"}ch`,
    `full=${trace.full === undefined ? "?" : trace.full ? "yes" : "no"}`,
    `in=${trace.inputTokens ?? "?"}`,
    `cached=${trace.cachedTokens ?? "?"}`,
  ];
  if (trace.stallMs !== undefined) parts.push(`stallGuard=${trace.stallMs}ms${trace.stallRetried ? " retried" : ""}`);
  parts.push(outcome);
  return parts.join(" ");
}
