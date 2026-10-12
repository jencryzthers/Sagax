// A widget that arrives as text (a ```cw fence, a Claude-style artifact of
// type application/vnd.sagax.cw+json, a stored message) is read field by
// field: only the known fields, with their types, clipped. Anything else is
// dropped, so a model's output can never put markup, a script or a foreign
// link in a widget.

import {
  CW_MAX_NOTES,
  CW_MAX_RECORDS,
  CW_NOTE_MAX,
  CW_WIDGET_VERSION,
  type CwSite,
  type CwTicket,
  type CwTicketNote,
  type CwWidget,
} from "./types.ts";
import { bool, clipBlock, date, id, isRecord, num, text, type CwRecord } from "./read.ts";
import { cwRecordLink, cwSite, safeCwLink } from "./links.ts";
import { looksLikeTicket, orderNotes, ticketFrom } from "./ticket.ts";

function siteOf(value: unknown): CwSite | undefined {
  return isRecord(value) ? cwSite(value.host, value.company) : undefined;
}

function noteOf(value: unknown): CwTicketNote | undefined {
  if (!isRecord(value) || typeof value.text !== "string") return undefined;
  const body = clipBlock(value.text, CW_NOTE_MAX);
  if (!body) return undefined;
  const note: CwTicketNote = { text: body };
  const noteId = id(value);
  if (noteId) note.id = noteId;
  const by = text(value, "by");
  if (by) note.by = by;
  const at = date(value, "at");
  if (at) note.at = at;
  if (bool(value, "internal")) note.internal = true;
  if (bool(value, "resolution")) note.resolution = true;
  return note;
}

const TICKET_TEXT = ["status", "priority", "company", "contact", "board", "type", "owner", "resources"] as const;
const TICKET_DATES = ["entered", "updated", "due"] as const;

export function sanitizeTicket(value: unknown, site: CwSite | undefined): CwTicket | undefined {
  if (!isRecord(value)) return undefined;
  const record: CwRecord = value;
  // Raw ConnectWise records are welcome too: the normalizer reads them.
  if (looksLikeTicket(record) && (isRecord(record.status) || isRecord(record.board) || isRecord(record.company))) {
    return ticketFrom(record, site);
  }
  const ticketId = id(record);
  if (!ticketId) return undefined;
  const ticket: CwTicket = { id: ticketId, summary: text(record, "summary") ?? "" };
  for (const key of TICKET_TEXT) {
    const found = text(record, key);
    if (found) ticket[key] = found;
  }
  for (const key of TICKET_DATES) {
    const found = date(record, key);
    if (found) ticket[key] = found;
  }
  const budget = num(record, "budgetHours");
  if (budget !== undefined && budget >= 0) ticket.budgetHours = budget;
  const actual = num(record, "actualHours");
  if (actual !== undefined && actual >= 0) ticket.actualHours = actual;
  const closed = bool(record, "closed");
  if (closed !== undefined) ticket.closed = closed;
  if (record.recordType === "ServiceTicket" || record.recordType === "ProjectTicket") ticket.recordType = record.recordType;
  if (Array.isArray(record.notes)) {
    const notes = record.notes.slice(0, CW_MAX_NOTES * 2).map(noteOf).filter((note): note is CwTicketNote => Boolean(note));
    if (notes.length) ticket.notes = orderNotes(notes);
  }
  const link = safeCwLink(record.link) ?? cwRecordLink(site, "ServiceFv", ticketId);
  if (link) ticket.link = link;
  return ticket;
}

export function sanitizeCwWidget(value: unknown): CwWidget | null {
  if (!isRecord(value)) return null;
  if (value.v !== undefined && value.v !== CW_WIDGET_VERSION) return null;
  if (!Array.isArray(value.records)) return null;
  const site = siteOf(value.site);
  const total = num(value, "total");
  switch (value.family) {
    case "ticket": {
      const records = value.records.slice(0, CW_MAX_RECORDS)
        .map((record) => sanitizeTicket(record, site))
        .filter((ticket): ticket is CwTicket => Boolean(ticket));
      if (records.length === 0) return null;
      const view = value.view === "card" || value.view === "list" ? value.view : records.length === 1 ? "card" : "list";
      const widget: CwWidget = { v: CW_WIDGET_VERSION, family: "ticket", view, records };
      if (site) widget.site = site;
      if (total !== undefined && Number.isInteger(total) && total > records.length) widget.total = total;
      return widget;
    }
    default:
      return null;
  }
}

/** A ```cw fence's text, or an artifact's content. */
export function parseCwWidgetText(source: string): CwWidget | null {
  if (source.length > 1_000_000) return null;
  try {
    return sanitizeCwWidget(JSON.parse(source));
  } catch {
    return null;
  }
}
