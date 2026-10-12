import { describe, expect, it } from "vitest";

import { openSpeechStream, type HeaderWebSocket } from "./grok.ts";

class FakeSocket {
  static last: FakeSocket | null = null;
  sent: Record<string, unknown>[] = [];
  readyState = 1;
  binaryType = "arraybuffer";
  private listeners: Record<string, Array<() => void>> = {};
  constructor(readonly url: string, readonly init: { headers: Record<string, string> }) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
    if (type === "open") queueMicrotask(() => { for (const fn of this.listeners.open ?? []) fn(); });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    for (const fn of this.listeners.close ?? []) fn();
  }
}

describe("openSpeechStream", () => {
  it("sends text.delta without text.done until done(), so a lead token can start audio", async () => {
    const handlers = { onAudio() {}, onDone() {}, onCleared() {}, onError() {}, onClose() {} };
    const stream = openSpeechStream("fixture-voice-key", { voice: "ara" }, handlers, FakeSocket as unknown as HeaderWebSocket);
    await stream.ready;
    expect(FakeSocket.last!.init.headers.authorization).toBe("Bearer fixture-voice-key");
    expect(FakeSocket.last!.url).toContain("optimize_streaming_latency=2");
    stream.delta("Four");
    expect(FakeSocket.last!.sent).toEqual([{ type: "text.delta", delta: "Four" }]);
    stream.delta(" is");
    stream.done();
    expect(FakeSocket.last!.sent).toEqual([
      { type: "text.delta", delta: "Four" },
      { type: "text.delta", delta: " is" },
      { type: "text.done" },
    ]);
    stream.speak("A finished clause.");
    expect(FakeSocket.last!.sent.at(-2)).toEqual({ type: "text.delta", delta: "A finished clause." });
    expect(FakeSocket.last!.sent.at(-1)).toEqual({ type: "text.done" });
  });
});
