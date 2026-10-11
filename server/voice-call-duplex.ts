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
