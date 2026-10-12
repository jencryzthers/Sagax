// A change asked from a widget (a ticket's status, a note). The widget never
// writes to ConnectWise itself: the server shows an approval card, and once
// the person allows it, asks the bot to make that one change with its own
// ConnectWise tool. The bot's write is then let through once, for that
// record only (server/cw-widget-actions.ts).

import { clip, clipBlock, isRecord } from "./read.ts";

export const CW_STATUS_MAX = 80;
export const CW_ACTION_NOTE_MAX = 4000;

export type CwAction =
  | { kind: "ticket.status"; ticketId: number; status: string; from?: string }
  | { kind: "ticket.note"; ticketId: number; text: string; internal: boolean };

export type CwActionKind = CwAction["kind"];

function positiveId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e12 ? value : undefined;
}

function oneLine(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const line = clip(value, max + 1);
  return line && line.length <= max ? line : undefined;
}

/** A well-formed action, or null. */
export function parseCwAction(value: unknown): CwAction | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "ticket.status": {
      const ticketId = positiveId(value.ticketId);
      const status = oneLine(value.status, CW_STATUS_MAX);
      if (!ticketId || !status) return null;
      const from = oneLine(value.from, CW_STATUS_MAX);
      if (from === status) return null;
      return { kind: "ticket.status", ticketId, status, ...(from ? { from } : {}) };
    }
    case "ticket.note": {
      const ticketId = positiveId(value.ticketId);
      const text = typeof value.text === "string" ? clipBlock(value.text, CW_ACTION_NOTE_MAX + 1) : "";
      if (!ticketId || !text || text.length > CW_ACTION_NOTE_MAX) return null;
      return { kind: "ticket.note", ticketId, text, internal: value.internal === true };
    }
    default:
      return null;
  }
}

/** The `cw_psa__write` arguments that make the change. */
export function cwActionWrite(action: CwAction): { resource: string; operation: string; body: unknown } {
  switch (action.kind) {
    case "ticket.status":
      return {
        resource: `service/tickets/${action.ticketId}`,
        operation: "patch",
        body: [{ op: "replace", path: "status", value: { name: action.status } }],
      };
    case "ticket.note":
      return {
        resource: `service/tickets/${action.ticketId}/notes`,
        operation: "create",
        body: {
          text: action.text,
          detailDescriptionFlag: !action.internal,
          internalAnalysisFlag: action.internal,
        },
      };
  }
}

/** The record ids the bot's write must name to be the change allowed. */
export function cwActionAnchors(action: CwAction): number[] {
  return [action.ticketId];
}

export type CwLanguage = "fr" | "en";

function quoted(text: string, max = 80): string {
  return `« ${clip(text, max)} »`;
}

/** One line for the approval card and the chat. */
export function cwActionSummary(action: CwAction, language: CwLanguage): string {
  const fr = language === "fr";
  switch (action.kind) {
    case "ticket.status":
      return fr
        ? `Changer le statut du billet #${action.ticketId}${action.from ? ` de ${quoted(action.from)}` : ""} à ${quoted(action.status)}`
        : `Change ticket #${action.ticketId} status${action.from ? ` from "${clip(action.from, 80)}"` : ""} to "${clip(action.status, 80)}"`;
    case "ticket.note":
      return fr
        ? `Ajouter une note ${action.internal ? "interne" : "à la discussion"} au billet #${action.ticketId}`
        : `Add ${action.internal ? "an internal" : "a discussion"} note to ticket #${action.ticketId}`;
  }
}

/** The message the person sends the bot once they allow the change. It
 * carries the exact write, so the bot makes that change and nothing else. */
export function cwActionInstruction(action: CwAction, language: CwLanguage): string {
  const summary = cwActionSummary(action, language);
  const write = JSON.stringify(cwActionWrite(action));
  const detail = action.kind === "ticket.note"
    ? language === "fr" ? `\n\nNote :\n${action.text}` : `\n\nNote:\n${action.text}`
    : "";
  return language === "fr"
    ? `${summary}. Approuvé dans le widget ConnectWise.${detail}\n\nFais ce changement maintenant avec ton outil ConnectWise (cw_psa__write), une seule fois, puis confirme en une phrase. Arguments : ${write}`
    : `${summary}. Approved in the ConnectWise widget.${detail}\n\nMake this change now with your ConnectWise tool (cw_psa__write), once, then confirm in one sentence. Arguments: ${write}`;
}
