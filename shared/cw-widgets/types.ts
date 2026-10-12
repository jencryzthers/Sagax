// The in-chat ConnectWise PSA widget format. A widget is data only: plain
// strings, numbers and booleans read from a ConnectWise record, never markup
// or code, so every client draws it with its own components (web, iPhone,
// iPad) and nothing in it can run. The same JSON is what a ```cw fence or a
// Claude-style artifact of type `application/vnd.sagax.cw+json` carries.

export const CW_WIDGET_VERSION = 1;
export const CW_ARTIFACT_TYPE = "application/vnd.sagax.cw+json";
export const CW_FENCE = "cw";

/** At most this many records in one list widget; `total` keeps the count. */
export const CW_MAX_RECORDS = 50;
export const CW_MAX_NOTES = 20;
export const CW_TEXT_MAX = 300;
export const CW_NOTE_MAX = 1500;

/** The ConnectWise Manage site a deep link opens: its host (na.myconnectwise.net,
 * or an on-premises name) and the company id typed at sign-in. */
export interface CwSite {
  host: string;
  company?: string;
}

export interface CwTicketNote {
  id?: number;
  text: string;
  by?: string;
  at?: string;
  internal?: boolean;
  resolution?: boolean;
}

export interface CwTicket {
  id: number;
  summary: string;
  status?: string;
  priority?: string;
  company?: string;
  contact?: string;
  board?: string;
  type?: string;
  owner?: string;
  resources?: string;
  entered?: string;
  updated?: string;
  due?: string;
  budgetHours?: number;
  actualHours?: number;
  closed?: boolean;
  /** "ServiceTicket" or "ProjectTicket", for a time entry charged to it */
  recordType?: "ServiceTicket" | "ProjectTicket";
  /** newest first */
  notes?: CwTicketNote[];
  link?: string;
}

export interface CwWidgetBase {
  v: typeof CW_WIDGET_VERSION;
  /** one record: a card; several: the family's list view */
  view: "card" | "list";
  /** records the query returned when the widget holds fewer */
  total?: number;
  site?: CwSite;
}

export interface CwTicketWidget extends CwWidgetBase {
  family: "ticket";
  records: CwTicket[];
}

export type CwWidget = CwTicketWidget;
export type CwFamily = CwWidget["family"];
export type CwRecordOf<F extends CwFamily> = Extract<CwWidget, { family: F }>["records"][number];
