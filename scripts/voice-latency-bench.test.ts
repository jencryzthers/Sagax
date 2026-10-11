// Runs the voice call latency bench (scripts/voice-latency-bench.ts) when
// SAGAX_VOICE_BENCH=1; skipped otherwise (about a minute and a half of real
// time per engine). Runs each engine of BENCH_ENGINES (claude,grok) and
// writes the turns and their p50/p90 to BENCH_OUT, with Grok's ACP session
// establishments per turn.
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";

import { realVoiceBench, runVoiceLatencyBench, summarize, type BenchEngine } from "./voice-latency-bench.ts";

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
}, 1_200_000);
