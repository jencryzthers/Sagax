import { describe, expect, it } from "vitest";
import { newTurnLatency, noteTurnActivity, turnLatencyLine } from "./turn-latency.ts";

describe("turn latency line", () => {
  it("logs every stage of a pooled one-tool turn, ids and numbers only", () => {
    const trace = newTurnLatency(1_000, 901);
    trace.path = "pooled";
    noteTurnActivity(trace, "agent_message_chunk", 1_010); // before the prompt: ignored
    trace.promptAt = 1_021;
    trace.promptChars = 1655;
    trace.full = false;
    noteTurnActivity(trace, "agent_thought_chunk", 2_000);
    noteTurnActivity(trace, "agent_message_chunk", 2_171);
    noteTurnActivity(trace, "tool_call", 2_290);
    noteTurnActivity(trace, "tool_call_update", 2_300);
    noteTurnActivity(trace, "agent_message_chunk", 3_000);
    trace.inputTokens = 18_225;
    trace.cachedTokens = 16_000;
    trace.stallMs = 10_000;
    expect(turnLatencyLine("grok", "800b207c-1a77-43fc-897a-2964d1c2d32f", trace, 3_132, "ok")).toBe(
      "[turn-latency] grok thread=800b207c path=pooled queue=99ms setup=21ms ttfa=979ms ttft=1150ms tools=1 total=2132ms prompt=1655ch full=no in=18225 cached=16000 stallGuard=10000ms ok",
    );
  });

  it("shows unknown stages as ? and drops an implausible received time", () => {
    const trace = newTurnLatency(5_000, 9_000);
    expect(trace.receivedAt).toBeUndefined();
    expect(turnLatencyLine("grok", "t1", trace, 5_500, "auth_required")).toBe(
      "[turn-latency] grok thread=t1 path=? queue=? setup=? ttfa=? ttft=? tools=0 total=500ms prompt=?ch full=? in=? cached=? auth_required",
    );
  });

  it("marks a stall retry", () => {
    const trace = newTurnLatency(0);
    trace.promptAt = 10;
    trace.stallMs = 10_000;
    trace.stallRetried = true;
    expect(turnLatencyLine("grok", "t", trace, 20_000, "ok")).toContain("stallGuard=10000ms retried ok");
  });
});
