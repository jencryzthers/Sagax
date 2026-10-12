// An AI client's hidden conversations (#291).
//
// When an AI client attached to Perspicax (the `sagax_send` MCP tool, the
// member API in ./org-member-routes.ts) works with a bot for a person, it
// works in a hidden thread, the way Grok Bot keeps its subagents'
// conversations out of the chat: the person's sidebar, previews, typing
// dots, unread counts and notifications never show it, and it is still
// reached from the bot's Activity panel or its thread link.
//
// Before this rule, `newThread: true` opened an ordinary thread and made it
// the bot's selected one, so a client's tests lit the person's sidebar and
// kept unread dots nobody could clear. `planHiddenAgentThreads` finds those
// threads once, from the admin activity rows the member API wrote
// (`client.message` with `newThread: true`), so the server can hide them.
import type { AdminActionRow } from "./admin-activity.ts";

export interface HiddenAgentThread {
  botId: string;
  threadId: string;
}

/** The threads an AI client opened with `newThread` that are still shown.
 * `taskOf` answers the stored thread (undefined when it is gone). Each
 * thread at most once. */
export function planHiddenAgentThreads(
  rows: readonly AdminActionRow[],
  taskOf: (botId: string, threadId: string) => { hidden?: true } | undefined,
): HiddenAgentThread[] {
  const seen = new Set<string>();
  const out: HiddenAgentThread[] = [];
  for (const row of rows) {
    if (row.category !== "client" || row.action !== "client.message") continue;
    if (row.actor?.kind !== "person" || row.actor.via !== "perspicax-mcp") continue;
    const after = row.after ?? {};
    if (after.newThread !== true) continue;
    const botId = row.target?.kind === "bot" ? row.target.id : undefined;
    const threadId = typeof after.threadId === "string" ? after.threadId : undefined;
    if (!botId || !threadId || seen.has(threadId)) continue;
    seen.add(threadId);
    const task = taskOf(botId, threadId);
    if (!task || task.hidden === true) continue;
    out.push({ botId, threadId });
  }
  return out;
}
