// The desktop mascot's reply, drawn like a voice-mode reply (MascotCall.tsx,
// the captions): a speech bubble over the character's head with the reply,
// and a floating input pill under its feet (field, "Open in Sagax" as an
// icon, then Send or the voice button). No modal: no title bar, no grip.
// A finished reply fades by itself after a reading delay (replyFadeDelay);
// the pointer over it or the field in use keeps it. Trombi (retro) and
// approvals keep the balloon (Balloon.tsx).
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, AudioLines, ExternalLink, X } from "lucide-react";
import { BalloonMarkdown } from "./BalloonMarkdown";
import type { FloatingBalloon, FloatingEvent } from "./protocol";
import { dockedWindowSize, type Size } from "./window-frame";

/** The bubble's width, px (the quick chat's, so the window the mascot holds already fits it). */
export const REPLY_BUBBLE_W = 288;
/** A finished reply stays at least this long, ms, plus reading time, up to REPLY_FADE_MAX. */
export const REPLY_FADE_MIN = 6000;
export const REPLY_FADE_MAX = 30000;
/** Reading pace for the fade: ms per character. */
export const REPLY_FADE_PER_CHAR = 55;
/** How long the fade itself plays, ms. */
export const REPLY_FADE_MS = 600;

/** Which balloons this look draws: the chat's replies, its thinking and its errors, not Trombi's nor approvals. */
export function usesReplyBubble(balloon: Pick<FloatingBalloon, "kind"> | null | undefined, retro: boolean): boolean {
  return Boolean(balloon) && !retro && balloon!.kind !== "approval";
}

/** How long a finished reply stays before it fades, ms (null: it stays, still streaming or thinking). */
export function replyFadeDelay(balloon: Pick<FloatingBalloon, "kind" | "text" | "streaming">): number | null {
  if (balloon.streaming || balloon.kind === "thinking" || !balloon.text.trim()) return null;
  return Math.min(REPLY_FADE_MAX, REPLY_FADE_MIN + balloon.text.trim().length * REPLY_FADE_PER_CHAR);
}

export interface ReplyBubbleProps {
  name: string;
  balloon: FloatingBalloon;
  onEvent: (event: FloatingEvent) => void;
  hover: (on: boolean) => void;
  wantsKeyboard?: (on: boolean) => void;
  callLabel?: string;
  stage?: Size;
  onReserve?: (reserve: Size | null, exact: boolean) => void;
  below: boolean;
  closing?: boolean;
  /** For tests and previews: start faded. */
  faded?: boolean;
}

/** The reply's speech bubble, over the character's head (under it when the mascot is near the screen's top). */
export function ReplyBubble({ name, balloon, hover, stage, onReserve, below, closing = false, faded: fadedAtFirst = false, held, style }: ReplyBubbleProps & { held: boolean; style?: React.CSSProperties }) {
  const [faded, setFaded] = useState(fadedAtFirst);
  const [over, setOver] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const delay = replyFadeDelay(balloon);
  // a new reply, or new words, shows the bubble again
  useEffect(() => {
    if (!fadedAtFirst) setFaded(false);
  }, [balloon.text, balloon.kind, fadedAtFirst]);
  useEffect(() => {
    if (delay === null || over || held || faded) return;
    const timer = setTimeout(() => setFaded(true), delay);
    return () => clearTimeout(timer);
  }, [delay, over, held, faded, balloon.text]);
  // the window already holds the quick chat's room (window-frame.ts): the bubble fits in it
  useLayoutEffect(() => {
    if (!onReserve || !stage) return;
    onReserve(dockedWindowSize(stage), false);
  }, [onReserve, stage]);
  useEffect(() => {
    const node = textRef.current;
    if (node && balloon.streaming) node.scrollTop = node.scrollHeight;
  }, [balloon.text, balloon.streaming]);
  return (
    <div
      className="fb-reply"
      role="status"
      aria-label={name}
      aria-live={balloon.streaming ? "off" : "polite"}
      data-reply-bubble=""
      data-kind={balloon.kind}
      data-below={below ? "" : undefined}
      data-faded={faded ? "" : undefined}
      data-closing={closing ? "" : undefined}
      aria-hidden={faded || closing || undefined}
      style={{ ...style, "--fb-fade-ms": `${REPLY_FADE_MS}ms` } as React.CSSProperties}
      onPointerEnter={() => {
        setOver(true);
        if (faded) setFaded(false);
        hover(true);
      }}
      onPointerLeave={() => {
        setOver(false);
        hover(false);
      }}
    >
      <div ref={textRef} className="fb-reply-text" data-streaming={balloon.streaming ? "" : undefined} tabIndex={0}>
        {balloon.asked && <p className="fb-asked">{balloon.asked}</p>}
        {balloon.kind === "thinking" ? (
          <span className="fb-thinking">
            {balloon.text}
            <span className="fb-dots" aria-hidden="true"><span /><span /><span /></span>
          </span>
        ) : balloon.kind === "chat" ? (
          <BalloonMarkdown text={balloon.text} />
        ) : (
          <p>{balloon.text}</p>
        )}
      </div>
      <span className="fb-reply-tail" aria-hidden="true" />
    </div>
  );
}

/** The floating input pill under the character's feet: field, "Open in Sagax", Send or voice, close. */
export function ReplyPill({ balloon, onEvent, hover, wantsKeyboard, callLabel, onFocusChange }: Pick<ReplyBubbleProps, "balloon" | "onEvent" | "hover" | "wantsKeyboard" | "callLabel"> & { onFocusChange?: (busy: boolean) => void }) {
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const input = balloon.input;
  useEffect(() => {
    if (!input) return;
    wantsKeyboard?.(true);
    const later = setTimeout(() => field.current?.focus(), 60);
    return () => clearTimeout(later);
  }, [Boolean(input), wantsKeyboard]);
  useEffect(() => onFocusChange?.(Boolean(draft.trim())), [draft, onFocusChange]);
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onEvent({ type: "send", text });
    setDraft("");
  };
  return (
    <form
      className="fb-reply-pill pointer-events-auto"
      data-reply-pill=""
      onSubmit={send}
      onPointerEnter={() => hover(true)}
      onPointerLeave={() => hover(false)}
      onPointerDown={() => input && wantsKeyboard?.(true)}
    >
      {input ? (
        <input
          ref={field}
          className="fb-reply-field fb-input"
          value={draft}
          dir="auto"
          aria-label={input.label}
          placeholder={input.placeholder}
          autoComplete="off"
          maxLength={4000}
          onFocus={() => wantsKeyboard?.(true)}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <span className="fb-reply-field" />
      )}
      <button type="button" className="fb-reply-btn" aria-label={balloon.open} title={balloon.open} data-reply-open="" onClick={() => onEvent({ type: "open" })}>
        <ExternalLink size={13} aria-hidden="true" />
      </button>
      {input && (draft.trim() || !callLabel) ? (
        <button type="submit" className="fb-reply-btn fb-reply-send fb-send" aria-label={input.send} title={input.send} disabled={!draft.trim()}>
          <ArrowUp size={14} aria-hidden="true" />
        </button>
      ) : callLabel ? (
        <button type="button" className="fb-reply-btn" aria-label={callLabel} title={callLabel} data-call-start="" onClick={() => onEvent({ type: "call", action: "start" })}>
          <AudioLines size={13} aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className="fb-reply-btn" aria-label={balloon.close} title={balloon.close} data-reply-close="" onClick={() => onEvent({ type: "dismiss" })}>
        <X size={13} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </form>
  );
}
