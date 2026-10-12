// Runs the voice call latency bench (scripts/voice-latency-bench.ts) when
// SAGAX_VOICE_BENCH=1; skipped otherwise (about a minute and a half of real
// time per engine). Runs each engine of BENCH_ENGINES (claude,grok) and
// writes the turns and their p50/p90 to BENCH_OUT, with Grok's ACP session
// establishments per turn.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";

import { parseVoiceCallMeta } from "../server/voice-call-prompt.ts";
import {
  BENCH_SAY_VOICE_FR,
  REAL_QUESTIONS,
  defaultBenchTurns,
  realVoiceBench,
  runVoiceLatencyBench,
  summarize,
  voiceCallMarkLanguage,
  type BenchEngine,
} from "./voice-latency-bench.ts";

it("real bench is 20 turns mixing English and Québec French, short and long", () => {
  expect(defaultBenchTurns(true)).toBe(20);
  expect(defaultBenchTurns(false)).toBe(12);
  expect(REAL_QUESTIONS).toHaveLength(20);
  const fr = REAL_QUESTIONS.filter((q) => q.lang === "fr");
  const en = REAL_QUESTIONS.filter((q) => q.lang === "en");
  expect(fr.length).toBeGreaterThanOrEqual(8);
  expect(en.length).toBeGreaterThanOrEqual(8);
  const words = (q: { text: string }) => q.text.trim().split(/\s+/).length;
  expect(REAL_QUESTIONS.some((q) => q.lang === "en" && words(q) <= 5)).toBe(true);
  expect(REAL_QUESTIONS.some((q) => q.lang === "en" && words(q) >= 10)).toBe(true);
  expect(REAL_QUESTIONS.some((q) => q.lang === "fr" && words(q) <= 5)).toBe(true);
  expect(REAL_QUESTIONS.some((q) => q.lang === "fr" && words(q) >= 10)).toBe(true);
  expect(BENCH_SAY_VOICE_FR).toMatch(/Amélie|Amelie/);
});

it("voice-call marks use en or fr, never auto (parseVoiceCallMeta rejects auto)", () => {
  expect(parseVoiceCallMeta({ callId: "call-0123456789", language: "auto" })).toHaveProperty("error");
  expect(voiceCallMarkLanguage("auto")).toBe("en");
  for (const q of REAL_QUESTIONS) {
    const language = voiceCallMarkLanguage(q.lang);
    expect(language === "en" || language === "fr").toBe(true);
    expect(parseVoiceCallMeta({ callId: "call-0123456789", language })).toMatchObject({ language });
  }
});

const real = realVoiceBench();
const engines = real
  ? (["xai"] as BenchEngine[])
  : (process.env.BENCH_ENGINES ?? "claude,grok").split(",").map((engine) => engine.trim()).filter((engine): engine is BenchEngine => engine === "claude" || engine === "grok");

it.skipIf(process.env.SAGAX_VOICE_BENCH !== "1")("measures a call's latency stage by stage", async () => {
  const report: Record<string, unknown> = {};
  for (const engine of engines) {
    const { turns, serverLog, acp, diag } = await runVoiceLatencyBench(engine);
    const warm = summarize(turns.slice(1));
    report[engine] = {
      turns,
      first: turns[0],
      warm,
      all: summarize(turns),
      real,
      diag,
      ...(acp ? { establishPerTurn: turns.map((turn) => turn.establish), acp } : {}),
      server: serverLog.split("\n").filter((line) => /\[voice-latency\]|relaunch|error|Error|voice/.test(line)).map((line) => line.replace(/xai-[A-Za-z0-9_-]+/g, "xai-[redacted]")).slice(-40),
    };
    if (real && typeof warm.total?.p50 === "number") {
      report.targetMs = 800;
      report.warmP50 = warm.total.p50;
    }
    if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(report, null, 2));
    expect(turns.every((turn) => typeof turn.total === "number"), JSON.stringify(turns)).toBe(true);
  }
}, 1_800_000);
