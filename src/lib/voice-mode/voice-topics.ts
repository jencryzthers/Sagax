// Open topics on a live call (issue #292, Cryptic requirement 9).
// The call is an orchestrator: a long task can keep running as background
// work while the person asks about something else. Barge-in cancels the
// spoken reply, not that background work, unless they say stop.
import { suggestBusySendMode } from "../../../shared/parallel-tasks.ts";

export type VoiceTopicStatus = "active" | "background" | "done" | "announced";

export interface VoiceTopic {
  id: string;
  label: string;
  status: VoiceTopicStatus;
}

export type TopicEvent =
  | { type: "start"; id: string; label: string }
  | { type: "background"; id: string }
  | { type: "done"; id: string }
  | { type: "announced"; id: string }
  | { type: "drop"; id: string };

function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

export function topicLabel(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 48 ? `${line.slice(0, 45).trimEnd()}...` : line;
}

export function isStopUtterance(text: string): boolean {
  return /^(stop|arrete|cancel)\b/.test(fold(text));
}

export function isNewVoiceTopic(text: string): boolean {
  if (isStopUtterance(text)) return false;
  return suggestBusySendMode(text) === "parallel";
}

export function announceTopic(label: string, result: string): string {
  const clip = result.replace(/\s+/g, " ").trim();
  const short = clip.length > 160 ? `${clip.slice(0, 157).trimEnd()}...` : clip;
  return `For ${label}: ${short}`;
}

export function applyTopicEvent(topics: VoiceTopic[], event: TopicEvent): VoiceTopic[] {
  switch (event.type) {
    case "start":
      return [
        ...topics.map((topic) => topic.status === "active" ? { ...topic, status: "background" as const } : topic),
        { id: event.id, label: event.label, status: "active" },
      ];
    case "background":
      return topics.map((topic) => topic.id === event.id ? { ...topic, status: "background" } : topic);
    case "done":
      return topics.map((topic) => topic.id === event.id ? { ...topic, status: "done" } : topic);
    case "announced":
      return topics.map((topic) => topic.id === event.id ? { ...topic, status: "announced" } : topic);
    case "drop":
      return topics.filter((topic) => topic.id !== event.id);
  }
}

export function openTopics(topics: VoiceTopic[]): VoiceTopic[] {
  return topics.filter((topic) => topic.status === "active" || topic.status === "background");
}

/** Rebuild open topics from the call thread so the model can refer back. */
export function topicsFromCallMessages(messages: Array<{
  id: string;
  role?: string;
  text?: string;
  voiceCall?: unknown;
  parallelTask?: { role?: string; state?: string; requestMessageId?: string };
}>): VoiceTopic[] {
  let topics: VoiceTopic[] = [];
  for (const message of messages) {
    if (message.role === "user" && message.voiceCall && message.text?.trim()) {
      if (isStopUtterance(message.text)) {
        for (const open of openTopics(topics)) topics = applyTopicEvent(topics, { type: "drop", id: open.id });
        continue;
      }
      if (topics.length === 0 || isNewVoiceTopic(message.text)) {
        topics = applyTopicEvent(topics, { type: "start", id: message.id, label: topicLabel(message.text) });
      }
    }
    const card = message.parallelTask;
    if (card?.role === "card") {
      const id = card.requestMessageId ?? message.id;
      if (card.state === "running" || card.state === "queued") topics = applyTopicEvent(topics, { type: "background", id });
      else if (card.state === "done" || card.state === "failed" || card.state === "stopped") {
        topics = applyTopicEvent(topics, { type: "done", id });
      }
    }
  }
  return topics;
}

/** Lines for the phone-call prompt. Empty when nothing is open. */
export function voiceCallTopicsNote(topics: VoiceTopic[]): string {
  const open = openTopics(topics);
  if (!open.length) return "";
  const lines = [
    "Open topics on this call. Refer back to them by these names when it helps (\"for the other thing you asked...\"):",
    ...open.map((topic) => `- ${topic.label} (${topic.status === "background" ? "still running in the background" : "current"})`),
  ];
  return lines.join("\n");
}

export function callHasBackgroundWork(messages: Array<{
  kind?: string;
  tool?: { name?: string; ok?: boolean };
  parallelTask?: { role?: string; state?: string };
}>): boolean {
  return messages.some((message) => {
    const state = message.parallelTask?.state;
    return message.parallelTask?.role === "card" && (state === "running" || state === "queued");
  });
}

export function howToSpeakTopicResult(opts: {
  replyUserId?: string;
  lastUserId?: string;
  isParallelResult?: boolean;
}): "full" | "announce" | "skip" {
  if (opts.replyUserId && opts.lastUserId && opts.replyUserId !== opts.lastUserId) return "announce";
  return "full";
}

/** The user line this bot reply answers. Parallel request rows sit between
 * a background topic and its later call-thread result, so they are skipped
 * when walking back. */
export function sourceUserId(
  messages: Array<{
    id: string;
    role?: string;
    parallelTask?: { role?: string; requestMessageId?: string };
    requestMessageId?: string;
  }>,
  replyIndex: number,
  row?: {
    parallelTask?: { requestMessageId?: string };
    requestMessageId?: string;
  },
): string | undefined {
  const linked = row?.parallelTask?.requestMessageId || row?.requestMessageId;
  if (linked) return linked;
  for (let i = replyIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user" && message.parallelTask?.role !== "request") return message.id;
  }
}
