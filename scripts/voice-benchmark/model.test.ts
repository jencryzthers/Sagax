import { describe, expect, it } from "vitest";
import {
  compileVoiceBench,
  renderVoiceBenchMarkdown,
  VoiceBenchLedger,
  type CompileVoiceBenchInput,
  type VoiceBenchEvent,
  type VoiceBenchMark,
} from "./model.js";

function mark(utteranceId: string, mark: VoiceBenchMark, atMs: number): VoiceBenchEvent {
  return { kind: "mark", utteranceId, mark, atMs };
}

function fixture(options: {
  totals: readonly number[];
  overlap?: boolean;
}): CompileVoiceBenchInput {
  const utterances = options.totals.map((_, index) => ({
    utteranceId: `u${index + 1}`,
    turnId: `turn-${index + 1}`,
    scenarioId: "ordinary",
    topicId: `topic-${index + 1}`,
    language: index % 2 === 0 ? "en" as const : "fr-CA" as const,
    expected: "complete" as const,
  }));
  const events = utterances.flatMap((utterance, index) => {
    const speechEnd = 1_000 + index * 5_000;
    const audioStart = speechEnd + options.totals[index]!;
    const audioEnd = options.overlap && index === 0
      ? 7_000
      : audioStart + 100;
    return [
      mark(utterance.utteranceId, "speech-end", speechEnd),
      mark(utterance.utteranceId, "endpoint", speechEnd + 100),
      mark(utterance.utteranceId, "stt-final", speechEnd + 200),
      mark(utterance.utteranceId, "llm-first-token", speechEnd + 250),
      mark(utterance.utteranceId, "tts-first-byte", speechEnd + 300),
      mark(utterance.utteranceId, "audio-start", audioStart),
      mark(utterance.utteranceId, "audio-end", audioEnd),
      {
        kind: "state" as const,
        utteranceId: utterance.utteranceId,
        atMs: audioEnd,
        state: "completed" as const,
      },
    ];
  });
  return {
    run: {
      runId: "fixture-run",
      commitSha: "deadbeef",
      mode: "synthetic",
      engine: "fake-engine",
      sttProvider: "fake-xai",
      ttsProvider: "fake-xai",
      fixture: { configuredDelayMs: 10 },
    },
    utterances,
    events,
  };
}

describe("VoiceBenchLedger", () => {
  it("does not let a later turn replace another utterance's first audio", () => {
    const ledger = new VoiceBenchLedger();
    ledger.record(mark("u1", "speech-end", 100));
    ledger.record(mark("u1", "audio-start", 700));
    expect(() => ledger.record(mark("u1", "audio-start", 900))).toThrow(/conflicting duplicate/);
    expect(ledger.events()).toContainEqual(mark("u1", "audio-start", 700));
  });

  it("does not let one answer be attributed to two utterances", () => {
    const ledger = new VoiceBenchLedger();
    ledger.record({
      kind: "mark",
      utteranceId: "u1",
      mark: "llm-first-token",
      atMs: 300,
      answerId: "answer-1",
    });

    expect(() => ledger.record({
      kind: "mark",
      utteranceId: "u2",
      mark: "tts-first-byte",
      atMs: 400,
      answerId: "answer-1",
    })).toThrow(/answer answer-1.*attributed to u1/);
  });

  it("returns event snapshots that cannot mutate the ledger", () => {
    const ledger = new VoiceBenchLedger();
    const event = mark("u1", "speech-end", 100);
    ledger.record(event);
    event.atMs = 200;
    const snapshot = ledger.events()[0] as VoiceBenchEvent;
    snapshot.atMs = 300;

    expect(ledger.events()).toEqual([mark("u1", "speech-end", 100)]);
  });
});

describe("compileVoiceBench", () => {
  it("uses nearest-rank statistics for the timing summary", () => {
    expect(compileVoiceBench(fixture({ totals: [400, 800, 900] })).summary.total)
      .toEqual({ p50: 800, p90: 900, max: 900 });
  });

  it("passes inclusive latency boundaries and rejects a turn above the maximum", () => {
    expect(compileVoiceBench(fixture({ totals: [400, 800] })).passed).toBe(true);
    expect(compileVoiceBench(fixture({ totals: [800, 2_500] })).passed).toBe(true);
    expect(compileVoiceBench(fixture({ totals: [400, 2_501] })).passed).toBe(false);
  });

  it("uses warm turns after one explicit warm-up for the p50 gate", () => {
    const input = fixture({ totals: [2_000, 700, 900] });
    input.utterances = input.utterances.map((utterance, index) => ({
      ...utterance,
      warmup: index === 0,
    }));

    const report = compileVoiceBench(input);
    expect(report.gates.p50).toEqual({
      pass: true,
      thresholdMs: 800,
      observedMs: 700,
    });
    expect(report.gates.max.observedMs).toBe(2_000);
  });

  it("rejects a complete turn with a missing required mark", () => {
    const input = fixture({ totals: [400] });
    input.events = input.events.filter((event) =>
      event.kind !== "mark" || event.mark !== "tts-first-byte");

    expect(() => compileVoiceBench(input))
      .toThrow(/missing required mark tts-first-byte.*u1/);
  });

  it("rejects an event attributed to an unknown utterance", () => {
    const input = fixture({ totals: [400] });
    input.events = [...input.events, mark("unknown", "audio-start", 2_000)];

    expect(() => compileVoiceBench(input)).toThrow(/unknown utterance unknown/);
  });

  it("rejects conflicting duplicate marks in compiler input", () => {
    const input = fixture({ totals: [400] });
    input.events = [...input.events, mark("u1", "audio-start", 1_450)];

    expect(() => compileVoiceBench(input)).toThrow(/conflicting duplicate.*audio-start.*u1/);
  });

  it("rejects an interruption target that is not in the run", () => {
    const input = fixture({ totals: [400] });
    input.events = [...input.events, {
      kind: "interruption",
      utteranceId: "u1",
      targetUtteranceId: "unknown",
      atMs: 1_200,
    }];

    expect(() => compileVoiceBench(input)).toThrow(/unknown interruption target unknown/);
  });

  it("rejects TTS bytes attributed before the accepted answer's first token", () => {
    const input = fixture({ totals: [400] });
    input.events = input.events.map((event) =>
      event.kind === "mark" && event.mark === "tts-first-byte"
        ? mark("u1", "tts-first-byte", 1_249)
        : event);

    expect(() => compileVoiceBench(input))
      .toThrow(/tts-first-byte.*after llm-first-token.*u1/);
  });

  it("rejects TTS and audio marks attributed to a different answer revision", () => {
    const input = fixture({ totals: [400] });
    input.events = input.events.map((event) => {
      if (event.kind !== "mark") return event;
      if (event.mark === "llm-first-token") return { ...event, answerId: "answer-1" };
      if (["tts-first-byte", "audio-start", "audio-end"].includes(event.mark)) {
        return { ...event, answerId: "answer-2" };
      }
      return event;
    });

    expect(() => compileVoiceBench(input))
      .toThrow(/answer revision attribution.*u1/);
  });

  it("rejects audio output attributed before the answer has TTS bytes", () => {
    const input = fixture({ totals: [299] });

    expect(() => compileVoiceBench(input))
      .toThrow(/audio-start.*after tts-first-byte.*u1/);
  });

  it("rejects an audio interval that ends before it starts", () => {
    const input = fixture({ totals: [400] });
    input.events = input.events.map((event) =>
      event.kind === "mark" && event.mark === "audio-end"
        ? mark("u1", "audio-end", 1_399)
        : event);

    expect(() => compileVoiceBench(input))
      .toThrow(/audio-end.*after audio-start.*u1/);
  });

  it("keeps speculative negative timings raw and records their lead", () => {
    const input = fixture({ totals: [400] });
    input.events = input.events.map((event) =>
      event.kind === "mark" && event.mark === "endpoint"
        ? mark("u1", "endpoint", 900)
        : event);

    const report = compileVoiceBench(input);
    expect(report.turns[0]!.stages.endpoint).toBe(-100);
    expect(report.turns[0]!.transitions[0]).toEqual({
      from: "speech-end",
      to: "endpoint",
      deltaMs: -100,
      leadMs: 100,
    });
  });

  it("rejects an answer recorded as both cancelled and completed", () => {
    const input = fixture({ totals: [400] });
    input.events = [
      ...input.events,
      {
        kind: "cancellation",
        utteranceId: "u1",
        targetUtteranceId: "u1",
        atMs: 1_350,
      },
    ];

    expect(() => compileVoiceBench(input)).toThrow(/cancelled answer u1.*completed/);
  });

  it("keeps a cancelled partial answer out of latency summaries", () => {
    const input = fixture({ totals: [700, 400] });
    input.utterances = input.utterances.map((utterance, index) => ({
      ...utterance,
      expected: index === 0 ? "cancelled" : "complete",
    }));
    input.events = [
      ...input.events.filter((event) =>
        event.utteranceId !== "u1"
        || (event.kind === "mark"
          && ["speech-end", "endpoint", "stt-final"].includes(event.mark))),
      {
        kind: "cancellation",
        utteranceId: "u2",
        targetUtteranceId: "u1",
        atMs: 6_100,
      },
    ];

    const report = compileVoiceBench(input);
    expect(report.turns[0]).toMatchObject({
      utteranceId: "u1",
      cancelled: true,
      stages: {
        endpoint: 100,
        sttFinal: 200,
      },
    });
    expect(report.turns[0]!.spokenInterval).toBeUndefined();
    expect(report.summary.total).toEqual({ p50: 400, p90: 400, max: 400 });
  });

  it("fails the zero-overlap gate when spoken answer intervals intersect", () => {
    const report = compileVoiceBench(fixture({ totals: [400, 400], overlap: true }));

    expect(report.gates.overlap.pass).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.overlaps).toEqual([{
      firstUtteranceId: "u1",
      secondUtteranceId: "u2",
      startMs: 6_400,
      endMs: 6_500,
      durationMs: 100,
    }]);
  });

  it("derives optional reference numbers only from supplied sidecar markers", () => {
    const input = fixture({ totals: [400] });
    input.reference = {
      status: "measured",
      recordingPath: "reference.wav",
      speechEndMs: 100,
      firstAudioMs: 750,
    };

    expect(compileVoiceBench(input).reference).toEqual({
      status: "measured",
      recordingPath: "reference.wav",
      speechEndMs: 100,
      firstAudioMs: 750,
      latencyMs: 650,
      sagaxP50DeltaMs: -250,
    });
  });

  it("rejects invalid reference sidecar markers", () => {
    const input = fixture({ totals: [400] });
    input.reference = {
      status: "measured",
      recordingPath: "reference.wav",
      speechEndMs: 750,
      firstAudioMs: 100,
    };

    expect(() => compileVoiceBench(input)).toThrow(/reference first audio.*after speech end/);
  });
});

describe("renderVoiceBenchMarkdown", () => {
  it("derives the human report from compiled statistics and keeps a missing reference numeric-free", () => {
    const report = compileVoiceBench(fixture({ totals: [400, 800, 900] }));
    const markdown = renderVoiceBenchMarkdown(report);

    expect(markdown).toContain("| Total | 800 | 900 | 900 |");
    expect(markdown).toContain("Reference: not provided.");
    expect(markdown).not.toMatch(/Reference:.*\d+\s*ms/);
  });
});
