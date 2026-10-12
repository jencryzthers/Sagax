// Review 4: score a scripted real duplex call (issue #292). The scorer is
// pure. The live run (SAGAX_VOICE_ACCEPTANCE=1) drives real STT/LLM/TTS.
import { expect, it } from "vitest";

import { classifyVoiceIntent } from "../src/lib/voice-mode/voice-topics.ts";
import {
  ACCEPTANCE_SCRIPT,
  acceptanceVoiceCall,
  matchAcceptanceLine,
  noteWarmTotal,
  scoreAcceptance,
  scoreAcceptanceCancel,
  scoreAcceptanceInterrupt,
  acceptanceInjectWait,
  assignAcceptanceTurnIds,
  type AcceptanceEvent,
} from "./voice-acceptance-call.ts";

it("matches spoken lines to script ids, including stop and correction", () => {
  expect(matchAcceptanceLine("Count to two hundred please")?.id).toBe("A");
  expect(matchAcceptanceLine("What time is it in Tokyo?")?.id).toBe("B");
  expect(matchAcceptanceLine("stop")?.id).toBe("stop");
  expect(matchAcceptanceLine("no, I meant Toronto")?.id).toBe("corr");
  expect(matchAcceptanceLine("Prépare aussi le rapport mensuel")?.id).toBe("lim");
  expect(matchAcceptanceLine("hey what time is it in Paris")?.id).toBe("barge");
  expect(classifyVoiceIntent("hey what time is it in Paris")).toBe("new_topic");
});

it("the script covers overlapping topics, barge-in, correction, stop, three parallel, EN and FR", () => {
  const ids = ACCEPTANCE_SCRIPT.map((row) => row.id);
  expect(ids).toEqual(expect.arrayContaining(["A", "B", "C", "D", "barge", "corr", "stop", "lim"]));
  expect(ACCEPTANCE_SCRIPT.some((row) => row.lang === "fr")).toBe(true);
  expect(ACCEPTANCE_SCRIPT.some((row) => row.lang === "en")).toBe(true);
  const b = ACCEPTANCE_SCRIPT.find((row) => row.id === "B")!;
  const a = ACCEPTANCE_SCRIPT.find((row) => row.id === "A")!;
  expect(b.atMs).toBeGreaterThan(a.atMs);
  expect(b.atMs).toBeLessThan(8_000);
});

it("a) B while A is thinking: both complete and A is not cancelled", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 100, kind: "turn-started", id: "A", threadId: "main" },
    { t: 400, kind: "send", id: "B", threadId: "b", parallel: "running" },
    { t: 900, kind: "turn-completed", id: "B", threadId: "b" },
    { t: 2_000, kind: "turn-completed", id: "A", threadId: "main" },
  ];
  const row = scoreAcceptance(events).find((s) => s.scenario === "a")!;
  expect(row.pass).toBe(true);

  const cancelled: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 100, kind: "turn-started", id: "A", threadId: "main" },
    { t: 400, kind: "send", id: "B", threadId: "main" },
    { t: 410, kind: "cancelled", id: "A", threadId: "main" },
    { t: 900, kind: "turn-completed", id: "B", threadId: "main" },
  ];
  expect(scoreAcceptance(cancelled).find((s) => s.scenario === "a")!.pass).toBe(false);
});

it("b) three overlapping topics all complete", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 200, kind: "send", id: "B", threadId: "b", parallel: "running" },
    { t: 400, kind: "send", id: "C", threadId: "c", parallel: "running" },
    { t: 800, kind: "turn-completed", id: "C", threadId: "c" },
    { t: 900, kind: "turn-completed", id: "B", threadId: "b" },
    { t: 1_200, kind: "turn-completed", id: "A", threadId: "main" },
  ];
  expect(scoreAcceptance(events).find((s) => s.scenario === "b")!.pass).toBe(true);
});

it("c) barge-in during speech does not kill a running background task", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 200, kind: "send", id: "B", threadId: "b", parallel: "running" },
    { t: 500, kind: "bot-speak-start", id: "A" },
    { t: 700, kind: "interrupt", id: "barge" },
    { t: 720, kind: "cancelled", id: "A", threadId: "main" },
    { t: 1_400, kind: "turn-completed", id: "B", threadId: "b" },
  ];
  expect(scoreAcceptance(events).find((s) => s.scenario === "c")!.pass).toBe(true);
});

it("d) two results that land together are spoken one after another with no overlap", () => {
  const overlap: AcceptanceEvent[] = [
    { t: 0, kind: "bot-speak-start", id: "A" },
    { t: 50, kind: "bot-speak-start", id: "B" },
    { t: 400, kind: "bot-speak-end", id: "A" },
    { t: 500, kind: "bot-speak-end", id: "B" },
  ];
  expect(scoreAcceptance(overlap).find((s) => s.scenario === "d")!.pass).toBe(false);
  const ordered: AcceptanceEvent[] = [
    { t: 0, kind: "bot-speak-start", id: "A" },
    { t: 400, kind: "bot-speak-end", id: "A" },
    { t: 410, kind: "bot-speak-start", id: "B" },
    { t: 800, kind: "bot-speak-end", id: "B" },
  ];
  expect(scoreAcceptance(ordered).find((s) => s.scenario === "d")!.pass).toBe(true);
});

it("e) over the per-person limit the extra task is queued then later runs", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 200, kind: "send", id: "B", threadId: "b", parallel: "running" },
    { t: 400, kind: "send", id: "C", threadId: "c", parallel: "running" },
    { t: 600, kind: "send", id: "lim", threadId: "d", parallel: "queued" },
    { t: 700, kind: "bot-speak-start", id: "queued-notice" },
    { t: 900, kind: "bot-speak-end", id: "queued-notice" },
    { t: 1_200, kind: "parallel-running", id: "lim", threadId: "d" },
    { t: 1_800, kind: "turn-completed", id: "lim", threadId: "d" },
  ];
  expect(scoreAcceptance(events).find((s) => s.scenario === "e")!.pass).toBe(true);
});

it("f) stop cancels the thinking turn; an unrelated background task keeps running", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 200, kind: "send", id: "B", threadId: "b", parallel: "running" },
    { t: 500, kind: "send", id: "stop", intent: "stop" },
    { t: 520, kind: "cancelled", id: "A", threadId: "main" },
    { t: 1_200, kind: "turn-completed", id: "B", threadId: "b" },
  ];
  expect(scoreAcceptance(events).find((s) => s.scenario === "f")!.pass).toBe(true);
});

it.skipIf(process.env.SAGAX_VOICE_ACCEPTANCE !== "1")("runs the real STT/LLM/TTS acceptance call", async () => {
  const { runVoiceAcceptanceCall } = await import("./voice-acceptance-call.ts");
  const result = await runVoiceAcceptanceCall();
  expect(result.dir).toMatch(/sagax-voice-acceptance/);
  expect(result.scores.map((row) => row.scenario)).toEqual(["a", "b", "c", "d", "e", "f", "latency"]);
}, 600_000);

it("records one warm total per utterance, not every metrics event", () => {
  const seen = new Set<string>();
  const totals: number[] = [];
  expect(noteWarmTotal(seen, totals, { utteranceId: "u1", stoppedAt: 100, firstAudioAt: 900 })).toBe(true);
  expect(noteWarmTotal(seen, totals, { utteranceId: "u1", stoppedAt: 100, firstAudioAt: 900 })).toBe(false);
  expect(noteWarmTotal(seen, totals, { utteranceId: "u2", stoppedAt: 2000, firstAudioAt: 2700 })).toBe(true);
  expect(totals).toEqual([800, 700]);
});

it("inject waits are counted from post-warmup origin so A and B stay 4s apart", () => {
  const origin = 14_000;
  expect(acceptanceInjectWait(origin, 0, origin)).toBe(0);
  expect(acceptanceInjectWait(origin, 4_000, origin)).toBe(4_000);
  expect(acceptanceInjectWait(origin, 4_000, origin + 1_000)).toBe(3_000);
  expect(acceptanceInjectWait(0, 4_000, 14_000)).toBe(0);
});

it("a continues send does not relabel later completions; a new topic on the same thread does", () => {
  const events: AcceptanceEvent[] = [
    { t: 0, kind: "send", id: "A", threadId: "main" },
    { t: 50, kind: "turn-started", threadId: "main" },
    { t: 80, kind: "send", id: "A", threadId: "main", continues: true },
    { t: 100, kind: "turn-completed", threadId: "main" },
    { t: 200, kind: "send", id: "B", threadId: "b" },
    { t: 250, kind: "turn-completed", threadId: "b" },
    { t: 300, kind: "send", id: "corr", threadId: "main" },
    { t: 350, kind: "turn-completed", threadId: "main" },
  ];
  assignAcceptanceTurnIds(events);
  expect(events.filter((event) => event.kind === "turn-completed").map((event) => event.id)).toEqual(["A", "B", "corr"]);
});

it("a continues interrupt is not scored as barge-in cancelling A", () => {
  expect(scoreAcceptanceInterrupt("A")).toBeUndefined();
  expect(scoreAcceptanceInterrupt(undefined)).toBeUndefined();
  expect(scoreAcceptanceCancel("A")).toBe(false);
  expect(scoreAcceptanceInterrupt("barge")).toEqual({ kind: "interrupt", id: "barge" });
  expect(scoreAcceptanceCancel("barge")).toBe(true);
  expect(scoreAcceptanceCancel("stop")).toBe(true);
});

it("marks speculative and continues on an acceptance send like LiveCall", () => {
  expect(acceptanceVoiceCall("c", "u", "fr", { speculative: true })).toMatchObject({
    callId: "c", utteranceId: "u", language: "fr", duplex: true, speculative: true,
  });
  expect(acceptanceVoiceCall("c", "u", "en", { continues: true })).toMatchObject({ continues: true, language: "en" });
  expect(acceptanceVoiceCall("c", "u", "en", {})).not.toHaveProperty("continues");
  expect(acceptanceVoiceCall("c", "u", "en", {})).not.toHaveProperty("speculative");
});

it("latency reports warm p50 against 800 ms without inventing a pass", () => {
  const miss = scoreAcceptance([], { warmTotals: [900, 1100, 1300, 1500], targetMs: 800 });
  const latency = miss.find((s) => s.scenario === "latency")!;
  expect(latency.pass).toBe(false);
  expect(latency.detail).toMatch(/p50=1100/);
  const hit = scoreAcceptance([], { warmTotals: [400, 500, 600, 700], targetMs: 800 });
  expect(hit.find((s) => s.scenario === "latency")!.pass).toBe(true);
});
