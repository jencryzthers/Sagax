import { describe, expect, it } from "vitest";

import { admitDuplexSend } from "./voice-call-duplex.ts";
import {
  discardSteeredQueue,
  hasQueuedSteeredMessages,
  queueSteeredMessage,
} from "./steer-queue.ts";

describe("admitDuplexSend", () => {
  it("never replaces when the flag is off", () => {
    expect(admitDuplexSend({ duplex: false, botBusy: true, stopping: true, queued: true })).toEqual({ action: "steer" });
    expect(admitDuplexSend({ duplex: false, botBusy: false, stopping: false, queued: false })).toEqual({ action: "start" });
  });

  it("starts when duplex is on and the thread is idle", () => {
    expect(admitDuplexSend({ duplex: true, botBusy: false, stopping: false, queued: false })).toEqual({ action: "start" });
  });

  it("replaces a busy or stopping turn and discards the queue", () => {
    expect(admitDuplexSend({ duplex: true, botBusy: true, stopping: false, queued: false }))
      .toEqual({ action: "replace", interrupt: true, discardQueue: true });
    expect(admitDuplexSend({ duplex: true, botBusy: false, stopping: true, queued: false }))
      .toEqual({ action: "replace", interrupt: true, discardQueue: true });
    expect(admitDuplexSend({ duplex: true, botBusy: true, stopping: true, queued: true }))
      .toEqual({ action: "replace", interrupt: true, discardQueue: true });
  });

  it("discards a leftover queue on an idle thread without interrupting", () => {
    expect(admitDuplexSend({ duplex: true, botBusy: false, stopping: false, queued: true }))
      .toEqual({ action: "replace", interrupt: false, discardQueue: true });
  });
});

describe("discardSteeredQueue", () => {
  it("empties a thread's queued follow-ups and leaves other threads", () => {
    queueSteeredMessage("bot-a", "thread-a", "stale A");
    queueSteeredMessage("bot-a", "thread-a", "stale B");
    queueSteeredMessage("bot-a", "thread-b", "keep me");
    expect(discardSteeredQueue("bot-a", "thread-a")).toBe(2);
    expect(hasQueuedSteeredMessages("bot-a", "thread-a")).toBe(false);
    expect(hasQueuedSteeredMessages("bot-a", "thread-b")).toBe(true);
    expect(discardSteeredQueue("bot-a", "thread-a")).toBe(0);
    expect(discardSteeredQueue("other", "thread-b")).toBe(0);
    expect(discardSteeredQueue("bot-a", "thread-b")).toBe(1);
  });
});
