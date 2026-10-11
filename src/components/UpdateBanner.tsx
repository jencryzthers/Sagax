// Update prompt. Updates download by themselves (upstream #2342), so nothing
// shows while one checks or downloads. A downloaded update opens a small
// "Update ready" dialog (Not now, Update) whose release notes unfold under
// "What's new"; "Not now" leaves the sidebar's update button, which opens
// it again (openUpdatePrompt). Errors and the Linux package hand-off stay on
// the small bottom-left card.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useUpdaterState, type UpdaterState } from "@/lib/updater";
import { useUpdatePromptRequests } from "@/lib/update-prompt";
import { ReleaseNotesBody } from "./ReleaseNotesMarkdown";

/** The dialog's two pills: the same size side by side, "Update" inverted. */
const pill =
  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] font-medium transition-[filter,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-elevated disabled:cursor-default";
const primaryPill = `${pill} bg-ink text-app hover:brightness-90 disabled:bg-control disabled:text-ink-secondary disabled:hover:brightness-100`;
const secondaryPill = `${pill} bg-control text-ink hover:bg-raised-hover`;

const NOTES_STATUS = new Set<UpdaterState["status"]>(["preparing", "downloaded", "installing"]);

function friendlyError(message?: string): string {
  if (!message) return "Something went wrong.";
  if (/cannot find .*\.yml|404/i.test(message))
    return "No update has been published for this platform yet.";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(message))
    return "Couldn't reach the update server.";
  return message.split("\n")[0].slice(0, 140);
}

function busyLabel(s: UpdaterState, pending: "install" | "check" | null): string {
  if (s.status === "preparing") return t("settings.updates.preparingShort");
  if (s.status === "installing" || pending === "install") {
    return s.installMode === "handoff" ? t("settings.updates.opening") : t("releaseNotes.restarting");
  }
  if (s.status === "downloading" && s.percent != null) return t("releaseNotes.percent", { percent: Math.round(s.percent) });
  return t("releaseNotes.starting");
}

function notesTitle(s: UpdaterState): string {
  const version = s.version ?? "";
  if (s.status === "downloading") return t("releaseNotes.downloading", { version });
  if (s.status === "preparing") return t("releaseNotes.preparing");
  if (s.status === "installing") {
    return s.installMode === "handoff" ? t("settings.updates.openingTerminal") : t("releaseNotes.restarting");
  }
  if (s.status === "downloaded") return t("releaseNotes.readyTitle");
  return t("releaseNotes.updateTitle", { name: brand().name, version });
}

/** The sentence under "Update ready": what the restart does, or the
 * terminal hand-off of a system package. */
export function readyBody(s: UpdaterState): string {
  if (s.installMode === "handoff") return t("settings.updates.readyInstall", { version: s.version ?? "" });
  // An unknown version leaves a double space behind, in every language.
  return t("releaseNotes.readyBody", { app: brand().name, version: s.version ?? "" }).replace("  ", " ");
}

export function UpdateBanner() {
  const s = useUpdaterState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pending, setPending] = useState<"install" | "check" | null>(null);
  const status = s?.status;
  useEffect(() => setPending(null), [status]);
  // the sidebar's update button asks for the dialog again after "Not now"
  const requests = useUpdatePromptRequests();
  useEffect(() => {
    if (requests > 0) setDismissed(null);
  }, [requests]);

  if (!s || s.status === "idle" || s.status === "checking" || s.status === "downloading") return null;
  const key = `${s.status}:${s.version ?? ""}`;
  if (dismissed === key) return null;

  const dismiss = () => setDismissed(key);
  const beginUpdate = () => {
    const updater = window.ogb?.updater;
    if (!updater || s.status !== "downloaded") return;
    setPending("install");
    void updater.install();
  };

  if (NOTES_STATUS.has(s.status)) {
    return (
      <UpdateNotesDialog state={s} pending={pending} onDismiss={dismiss} onUpdate={beginUpdate} />
    );
  }

  return (
    <UpdateProblemCard
      state={s}
      pending={pending}
      onDismiss={dismiss}
      onRetry={() => {
        setPending("check");
        void window.ogb?.updater?.check();
      }}
    />
  );
}

function UpdateNotesDialog({
  state: s,
  pending,
  onDismiss,
  onUpdate,
}: {
  state: UpdaterState;
  pending: "install" | "check" | null;
  onDismiss: () => void;
  onUpdate: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const installing = s.status === "installing";
  const preparing = s.status === "preparing";
  const busy = s.status === "downloading" || preparing || installing || pending !== null;
  const handoff = s.installMode === "handoff";

  useEffect(() => {
    primaryRef.current?.focus();
  }, [s.status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || busy) return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onDismiss]);

  const primaryLabel = handoff ? t("settings.updates.install") : t("releaseNotes.update");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onDismiss()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-notes-title"
        aria-describedby="update-notes-body"
        data-update-dialog=""
        className={cn(
          "flex max-h-[calc(100vh-3rem)] w-full flex-col rounded-[22px] border border-border bg-elevated p-5 shadow-2xl transition-[max-width]",
          notesOpen ? "max-w-[520px]" : "max-w-[360px]",
        )}
      >
        <h2 id="update-notes-title" className="text-[17px] font-semibold leading-6 text-ink">
          {notesTitle(s)}
        </h2>

        <p id="update-notes-body" className="mt-2 text-[15px] leading-[22px] text-ink-secondary">
          {s.status === "downloaded"
            ? readyBody(s)
            : preparing
              ? t("settings.updates.preparing")
              : installing && s.message
                ? s.message
                : null}
        </p>

        {s.status === "downloading" && (
          <div className="mt-3">
            <div className="text-[12.5px] text-ink-secondary">
              {s.percent == null
                ? t("releaseNotes.starting")
                : t("releaseNotes.percent", { percent: Math.round(s.percent) })}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-control">
              <div
                className={cn("h-full rounded-full bg-accent transition-[width]", s.percent == null && "w-1/4 animate-pulse")}
                style={s.percent == null ? undefined : { width: `${Math.min(100, Math.max(0, s.percent))}%` }}
              />
            </div>
          </div>
        )}

        {/* The feed's notes stay one tap away rather than filling the dialog. */}
        <button
          type="button"
          onClick={() => setNotesOpen((open) => !open)}
          aria-expanded={notesOpen}
          data-update-notes-toggle=""
          className="mt-3 inline-flex items-center gap-1 self-start rounded-md text-[13px] text-ink-secondary hover:text-ink"
        >
          {t("releaseNotes.whatsNew", { version: s.version ?? "" }).replace(/\s+$/, "")}
          <ChevronDown size={13} className={cn("transition-transform", notesOpen && "rotate-180")} />
        </button>
        {notesOpen && (
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            <ReleaseNotesBody notes={s.notes} fallbackVersion={s.version ?? ""} />
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onDismiss} disabled={busy} className={cn(secondaryPill, busy && "opacity-50")}>
            {t("releaseNotes.notNow")}
          </button>
          {busy ? (
            <button type="button" disabled className={primaryPill}>
              <Loader2 size={15} className="animate-spin" />
              {busyLabel(s, pending)}
            </button>
          ) : (
            <button ref={primaryRef} type="button" onClick={onUpdate} className={primaryPill}>
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UpdateProblemCard({
  state: s,
  pending,
  onDismiss,
  onRetry,
}: {
  state: UpdaterState;
  pending: "install" | "check" | null;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const title = s.status === "handed-off" ? "Finish in a terminal" : "Update failed";
  const subtitle =
    s.status === "handed-off"
      ? s.terminalOpened
        ? "Command copied. Paste it in the terminal that opened."
        : "Command copied. Paste it in a terminal to finish."
      : s.retryable === false
        ? `${friendlyError(s.message?.split(" Quit and reopen ")[0])} Quit and reopen ${brand().name} before trying the update again.`
        : friendlyError(s.message);

  return (
    <div className="animate-panel-in fixed bottom-4 left-4 z-50 w-[300px] rounded-[10px] border-[0.5px] border-border bg-elevated p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-secondary" title={subtitle}>
            {subtitle}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-ink-secondary hover:bg-control hover:text-ink"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {s.status === "handed-off" && s.command && (
        <code className="mt-2.5 block overflow-x-auto rounded-lg bg-control px-2 py-1.5 font-mono text-[11.5px] whitespace-pre text-ink-secondary">
          {s.command}
        </code>
      )}

      <div className="mt-2.5 flex gap-2">
        {s.status === "error" && s.retryable !== false && (
          <button
            type="button"
            onClick={onRetry}
            disabled={pending !== null}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-control py-1.5 text-[13px] text-ink hover:bg-raised-hover disabled:text-ink-secondary disabled:hover:bg-control"
          >
            {pending === "check" ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Checking…
              </>
            ) : (
              "Try again"
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          disabled={pending !== null}
          className="rounded-lg px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {s.status === "handed-off" || s.retryable === false ? "Dismiss" : "Later"}
        </button>
      </div>
    </div>
  );
}
