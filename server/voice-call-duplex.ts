// Pure admit for a voice-call send when full-duplex is on (issue #292).
// Flag off: the caller keeps today's steer-or-queue path. Flag on: a new
// utterance replaces the in-flight turn and never enters the steer queue.

export type DuplexAdmit =
  | { action: "start" }
  | { action: "steer" }
  | { action: "queue" }
  | { action: "replace"; interrupt: boolean; discardQueue: boolean };

export function admitDuplexSend(input: {
  duplex: boolean;
  botBusy: boolean;
  stopping: boolean;
  queued: boolean;
}): DuplexAdmit {
  if (!input.duplex) {
    return input.botBusy || input.stopping || input.queued ? { action: "steer" } : { action: "start" };
  }
  if (input.botBusy || input.stopping || input.queued) {
    return { action: "replace", interrupt: input.botBusy || input.stopping, discardQueue: true };
  }
  return { action: "start" };
}

/** How long a duplex send waits for the interrupted turn to settle before
 * starting the new one. Cap so a stuck interrupt cannot hang the 202. */
export const DUPLEX_INTERRUPT_WAIT_MS = 2_500;

/** One increasing token per thread: only the latest duplex replace starts. */
export function duplexEpoch(): { claim: () => number; isLatest: (token: number) => boolean } {
  let seq = 0;
  return {
    claim() {
      seq += 1;
      return seq;
    },
    isLatest(token: number) {
      return token === seq;
    },
  };
}

export function isThreadBusyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "thread_busy";
}

export function isStaleAssistantOutput(input: {
  eventTurnId?: string;
  cancelledTurnIds?: Iterable<string>;
  ownerStopped?: boolean;
  ownerTurnId?: string | null;
}): boolean {
  if (input.eventTurnId && input.cancelledTurnIds) {
    for (const id of input.cancelledTurnIds) {
      if (id === input.eventTurnId) return true;
    }
  }
  if (input.ownerStopped && (!input.eventTurnId || !input.ownerTurnId || input.eventTurnId !== input.ownerTurnId)) {
    return true;
  }
  if (input.eventTurnId && input.ownerTurnId && input.eventTurnId !== input.ownerTurnId) return true;
  return false;
}

export async function waitForThreadIdle(
  isBusy: () => boolean,
  opts?: {
    capMs?: number;
    stepMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<"idle" | "timeout"> {
  const capMs = opts?.capMs ?? DUPLEX_INTERRUPT_WAIT_MS;
  const stepMs = opts?.stepMs ?? 40;
  const now = opts?.now ?? Date.now;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + capMs;
  while (isBusy() && now() < deadline) await sleep(stepMs);
  return isBusy() ? "timeout" : "idle";
}
