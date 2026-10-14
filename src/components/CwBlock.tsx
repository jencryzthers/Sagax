// ConnectWise records from a ```cw fence, drawn as a card. Display only: the
// records are what the bot already read, so the card makes no request and
// offers no action that writes to ConnectWise. Every value is parsed into
// plain text first, so model output never becomes markup.
import { memo, useMemo, useState } from "react";
import { Building2, CalendarDays, Clock, Code, FileText, Table2, Ticket } from "lucide-react";

import { t } from "@/lib/i18n";
import { parseCwCard, type CwCard, type CwFamily, type CwField, type CwRecord } from "@/lib/rich-blocks";
import { BlockFrame, BlockHeader, ToolButton } from "./rich-ui";
import { RichTable, type TableModel } from "./RichTable";

const FAMILY_ICON: Record<CwFamily, typeof Ticket> = {
  tickets: Ticket,
  timeEntries: Clock,
  schedule: CalendarDays,
  agreements: FileText,
  companies: Building2,
};

function fieldText(field: CwField): string {
  if (!field.date) return field.value;
  const date = new Date(field.value);
  return Number.isNaN(date.getTime()) ? field.value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const fieldLabel = (field: Pick<CwField, "key">) => t(`rich.cw.field.${field.key}`);

export function cwTableModel(card: CwCard): TableModel {
  const header = ["#", t("rich.cw.column.title"), t("rich.cw.column.status"), ...card.columns.map((key) => fieldLabel({ key }))];
  return {
    header: header.map((text) => ({ content: text, text })),
    rows: card.records.map((record) => {
      const byKey = new Map(record.fields.map((field) => [field.key, fieldText(field)]));
      const text = [record.id ?? "", record.title, record.status ?? "", ...card.columns.map((key) => byKey.get(key) ?? "")];
      return { cells: text, text };
    }),
    align: header.map(() => null),
  };
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span className="shrink-0 rounded border border-hairline/40 bg-raised px-1.5 py-0.5 text-[11px] text-ink-secondary">{status}</span>
  );
}

function RecordRow({ record }: { record: CwRecord }) {
  const meta = record.fields.slice(0, 3).map(fieldText).join(" · ");
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      {record.id && <span className="shrink-0 pt-px text-[11.5px] tabular-nums text-ink-secondary">#{record.id}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{record.title}</span>
        {meta && <span className="block truncate text-[11.5px] text-ink-secondary">{meta}</span>}
      </span>
      <StatusChip status={record.status} />
    </li>
  );
}

function RecordDetail({ record }: { record: CwRecord }) {
  return (
    <section className="px-3 py-2.5">
      <div className="mb-1.5 flex items-start gap-2">
        {record.id && <span className="shrink-0 pt-px text-[11.5px] tabular-nums text-ink-secondary">#{record.id}</span>}
        <h4 className="m-0 min-w-0 flex-1 text-[13px] font-medium text-ink">{record.title}</h4>
        <StatusChip status={record.status} />
      </div>
      {record.fields.length > 0 && (
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          {record.fields.map((field) => (
            <div key={field.key} className="contents">
              <dt className="text-ink-secondary">{fieldLabel(field)}</dt>
              <dd className="m-0 min-w-0 break-words text-ink">{fieldText(field)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function CwBlockComponent({ code, pending = false }: { code: string; pending?: boolean }) {
  const parsed = useMemo(() => (pending ? null : parseCwCard(code)), [code, pending]);
  const card = parsed && !("error" in parsed) ? parsed : null;
  // "auto" follows the fence's view; the toolbar overrides it
  const [view, setView] = useState<"auto" | "table" | "cards" | "source">("auto");
  const title = card?.title ?? (card ? t(`rich.cw.family.${card.family}`) : t("rich.cw.title"));
  const Icon = card ? FAMILY_ICON[card.family] : Ticket;
  const asked = card?.view ?? "list";
  const layout = view === "table" ? "table" : view === "cards" && asked === "table" ? "list" : asked;

  return (
    <BlockFrame label={title}>
      <BlockHeader icon={<Icon size={13} aria-hidden="true" className="text-ink-secondary" />} title={title}>
        {card && <span className="text-[11px] text-ink-secondary">{t("rich.cw.count", { count: card.records.length + card.truncated })}</span>}
        <ToolButton onClick={() => setView(layout === "table" && view !== "source" ? "cards" : "table")} pressed={layout === "table" && view !== "source"} label={t("rich.chart.table")} disabled={!card}>
          <Table2 size={12} aria-hidden="true" />
        </ToolButton>
        <ToolButton onClick={() => setView(view === "source" ? "auto" : "source")} pressed={view === "source"} label={view === "source" ? t("rich.hideSource") : t("rich.viewSource")}>
          <Code size={12} aria-hidden="true" />
        </ToolButton>
      </BlockHeader>
      {pending ? (
        <p role="status" className="px-3 py-6 text-center text-[12px] text-ink-secondary">{t("rich.cw.pending")}</p>
      ) : !card ? (
        <p role="alert" className="px-3 pt-2 text-[12px] text-danger">{t("rich.cw.invalid", { reason: parsed && "error" in parsed ? parsed.error : "" })}</p>
      ) : view === "source" ? null : card.records.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] text-ink-secondary">{t("rich.cw.empty")}</p>
      ) : layout === "table" ? (
        <div className="p-2"><RichTable model={cwTableModel(card)} caption={title} /></div>
      ) : layout === "detail" ? (
        <div className="divide-y divide-hairline/30">
          {card.records.map((record, index) => <RecordDetail key={record.id ?? index} record={record} />)}
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-hairline/30 p-0">
          {card.records.map((record, index) => <RecordRow key={record.id ?? index} record={record} />)}
        </ul>
      )}
      {card && card.truncated > 0 && view !== "source" && (
        <p className="px-3 pb-2 text-[11px] text-ink-secondary">{t("rich.cw.truncated", { count: card.truncated })}</p>
      )}
      {(view === "source" || (!card && !pending)) && (
        <pre className="max-h-80 overflow-auto border-t border-hairline/30 p-3 text-[12px] leading-[18px] text-ink">{code}</pre>
      )}
    </BlockFrame>
  );
}

export const CwBlock = memo(CwBlockComponent);
