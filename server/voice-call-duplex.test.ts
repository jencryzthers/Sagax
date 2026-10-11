import { describe, expect, it } from "vitest";

import {
  admitDuplexSend,
  duplexEpoch,
  isStaleAssistantOutput,
  isThreadBusyError,
  waitForThreadIdle,
} from "./voice-call-duplex.ts";
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

describe("duplex replace slot", () => {
  it("only the latest claim is current, so a slower replace does not start", () => {
    const epoch = duplexEpoch();
    const first = epoch.claim();
    const second = epoch.claim();
    expect(epoch.isLatest(first)).toBe(false);
    expect(epoch.isLatest(second)).toBe(true);
  });

  it("a cancelled turn's assistant output is stale even after a new owner starts", () => {
    expect(isStaleAssistantOutput({ eventTurnId: "turn-a", cancelledTurnIds: ["turn-a"], ownerTurnId: "turn-b" })).toBe(true);
    expect(isStaleAssistantOutput({ eventTurnId: "turn-b", cancelledTurnIds: ["turn-a"], ownerTurnId: "turn-b" })).toBe(false);
    expect(isStaleAssistantOutput({ ownerStopped: true, eventTurnId: "turn-a" })).toBe(true);
    expect(isStaleAssistantOutput({ eventTurnId: "turn-a", ownerTurnId: "turn-b" })).toBe(true);
  });

  it("thread_busy is retried until idle, then a timeout is reported", async () => {
    expect(isThreadBusyError(Object.assign(new Error("busy"), { code: "thread_busy" }))).toBe(true);
    expect(isThreadBusyError(new Error("nope"))).toBe(false);
    let busy = true;
    let now = 0;
    const sleeps: number[] = [];
    const idle = waitForThreadIdle(() => busy, {
      capMs: 100,
      stepMs: 40,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
        busy = false;
      },
    });
    await expect(idle).resolves.toBe("idle");
    expect(sleeps).toEqual([40]);
    const timed = waitForThreadIdle(() => true, {
      capMs: 80,
      stepMs: 40,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    await expect(timed).resolves.toBe("timeout");
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
