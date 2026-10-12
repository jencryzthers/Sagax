// Review 4: scripted real duplex acceptance (issue #292). Score a-f plus
// warm p50 end-of-speech -> first audio against 800 ms. Live run uses real
// STT/LLM/TTS; this module's scorer is pure.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

import { verificationServerEnvironment } from "./control-omb.ts";
import { freePortBlock } from "../server/testing/ports.ts";
import { VoiceCall } from "../src/lib/voice-mode/call.ts";
import { SpeechSocket } from "../src/lib/voice-mode/speech-stream.ts";
import { DEFAULT_CALL_SETTINGS } from "../src/lib/voice-mode/call-settings.ts";
import { LiveTranscriber } from "../src/lib/voice-mode/stt-stream.ts";
import { VAD_FRAME, type VoiceProbability } from "../src/lib/voice-mode/vad.ts";
import { nextSpeakSlot, type SpeakItem } from "../src/lib/voice-mode/voice-speak-queue.ts";
import { classifyVoiceIntent } from "../src/lib/voice-mode/voice-topics.ts";
import { percentile } from "../src/lib/voice-mode/latency.ts";
import {
  BENCH_SAY_VOICE_FR,
  ClockPlayer,
  applyBenchRuntimeEvent,
  benchInterruptBody,
  holdVoiceUntilTail,
  loadVoiceBenchKey,
  pcmFrames,
  spokenPcm,
  voiceCallMarkLanguage,
  type BenchReplyState,
} from "./voice-latency-bench.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const log = (line: string) => { process.stderr.write(`[voice-accept] ${line}\n`); };

export type AcceptanceLang = "en" | "fr";

export interface AcceptanceLine {
  id: string;
  lang: AcceptanceLang;
  atMs: number;
  text: string;
}

/** Overlapping topics, barge-in, correction, stop, a queued extra. EN+FR. */
export const ACCEPTANCE_SCRIPT: AcceptanceLine[] = [
  { id: "A", lang: "en", atMs: 0, text: "Please wait twelve seconds, then count to two hundred, saying each number." },
  { id: "B", lang: "en", atMs: 8_000, text: "Please wait fifteen seconds, then what time is it in Tokyo?" },
  { id: "C", lang: "fr", atMs: 12_000, text: "Attends huit secondes, puis rédige un court courriel de bonjour." },
  { id: "D", lang: "en", atMs: 16_000, text: "How far is Quebec City from Montreal?" },
  { id: "lim", lang: "fr", atMs: 18_000, text: "Prépare aussi le rapport mensuel des billets." },
  { id: "barge", lang: "en", atMs: 22_000, text: "hey what time is it in Paris" },
  { id: "corr", lang: "en", atMs: 30_000, text: "no, I meant Toronto" },
];

/** Second call: stop while A is thinking and B is a background task. */
export const ACCEPTANCE_STOP_SCRIPT: AcceptanceLine[] = [
  { id: "A", lang: "en", atMs: 0, text: "Please wait twenty seconds, then count to two hundred, saying each number." },
  { id: "B", lang: "en", atMs: 6_000, text: "Please wait fifteen seconds, then what time is it in Tokyo?" },
  { id: "stop", lang: "en", atMs: 10_000, text: "stop" },
];

/** Speculative 4-word prefixes complete as short turns and kill the wait. */
export function shouldPostAcceptanceUtterance(turn: { speculative?: boolean }): boolean {
  return turn.speculative !== true;
}

export function mergeAcceptanceScores(fork: AcceptanceScore[], stop: AcceptanceScore[]): AcceptanceScore[] {
  return fork.map((row) => (row.scenario === "f" ? stop.find((item) => item.scenario === "f") ?? row : row));
}

export type AcceptanceEvent = {
  t: number;
  kind:
    | "send"
    | "turn-started"
    | "turn-completed"
    | "cancelled"
    | "interrupt"
    | "bot-speak-start"
    | "bot-speak-end"
    | "parallel-running";
  id?: string;
  threadId?: string;
  parallel?: "running" | "queued";
  intent?: "stop" | "correction" | "new_topic";
  continues?: boolean;
  stopped?: boolean;
};

export type AcceptanceScenario = "a" | "b" | "c" | "d" | "e" | "f" | "latency";

export interface AcceptanceScore {
  scenario: AcceptanceScenario;
  pass: boolean;
  reason: string;
  detail?: string;
}

const done = (events: AcceptanceEvent[], id: string) =>
  events.some((event) => event.kind === "turn-completed" && event.id === id);
const killed = (events: AcceptanceEvent[], id: string) =>
  events.some((event) => event.kind === "cancelled" && event.id === id);
const forked = (events: AcceptanceEvent[], id: string) =>
  events.some((event) => event.kind === "send" && event.id === id && !event.continues && event.parallel === "running");
function cancelledBeforeComplete(events: AcceptanceEvent[], id: string): boolean {
  const doneAt = events.find((event) => event.kind === "turn-completed" && event.id === id)?.t;
  return events.some((event) => event.kind === "cancelled" && event.id === id && (doneAt === undefined || event.t < doneAt));
}

function speakOverlap(events: AcceptanceEvent[]): { overlap: boolean; lines: number } {
  let speaking = 0;
  let overlap = false;
  let lines = 0;
  for (const event of [...events].sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))) {
    if (event.kind === "bot-speak-start") {
      lines += 1;
      if (speaking > 0) overlap = true;
      speaking += 1;
    } else if (event.kind === "bot-speak-end") {
      speaking = Math.max(0, speaking - 1);
    }
  }
  return { overlap, lines };
}

export function scoreAcceptance(
  events: AcceptanceEvent[],
  opts: { warmTotals?: number[]; targetMs?: number } = {},
): AcceptanceScore[] {
  const aPass = done(events, "A") && done(events, "B") && !cancelledBeforeComplete(events, "A") && forked(events, "B");
  const bPass = (["A", "B", "C"] as const).every((id) => done(events, id)) && forked(events, "B") && forked(events, "C");
  const cPass = events.some((event) => event.kind === "interrupt")
    && forked(events, "B")
    && done(events, "B")
    && !killed(events, "B");
  const spoken = speakOverlap(events);
  const dPass = spoken.lines >= 2 && !spoken.overlap;
  const ePass = events.some((event) => event.kind === "send" && event.parallel === "queued")
    && events.some((event) => event.kind === "bot-speak-start" && event.id === "queued-notice")
    && events.some((event) => event.kind === "parallel-running" && event.id === "lim")
    && done(events, "lim");
  const fPass = events.some((event) => event.kind === "send" && event.id === "stop" && event.stopped === true)
    && forked(events, "B")
    && done(events, "B")
    && !killed(events, "B");
  const warm = opts.warmTotals ?? [];
  const target = opts.targetMs ?? 800;
  const p50 = percentile(warm, 50);
  const latPass = typeof p50 === "number" && p50 <= target;
  return [
    { scenario: "a", pass: aPass, reason: aPass ? "A and B both completed, A not cancelled" : "A cancelled or a topic did not finish" },
    { scenario: "b", pass: bPass, reason: bPass ? "A, B and C all completed" : "fewer than three overlapping topics completed" },
    { scenario: "c", pass: cPass, reason: cPass ? "barge-in cancelled speech, B kept running" : "background task died or barge-in missing" },
    { scenario: "d", pass: dPass, reason: dPass ? "spoken lines were sequential" : "spoken lines overlapped or never played" },
    { scenario: "e", pass: ePass, reason: ePass ? "queued extra was announced then ran" : "queued extra missing, silent, or never ran" },
    { scenario: "f", pass: fPass, reason: fPass ? "stop cancelled A, B kept running" : "stop did not cancel A or killed B" },
    { scenario: "latency", pass: latPass, reason: latPass ? `warm p50 ${p50} <= ${target}` : `warm p50 ${p50 ?? "n/a"} vs ${target}`, detail: `p50=${p50 ?? "n/a"} n=${warm.length} target=${target}` },
  ];
}

export function formatAcceptanceSummary(scores: AcceptanceScore[], extras: string[] = []): string {
  const lines = [
    "# Sagax voice acceptance",
    "",
    ...scores.map((row) => `- ${row.scenario}: ${row.pass ? "PASS" : "FAIL"} ${row.reason}${row.detail ? ` (${row.detail})` : ""}`),
    ...extras.map((line) => `- ${line}`),
    "",
  ];
  return lines.join("\n");
}

const HINT: Record<string, RegExp> = {
  stop: /^(stop|arr[eê]te|cancel)\b/i,
  corr: /\b(toronto|i meant|je voulais|no,)\b/i,
  barge: /\bparis\b/i,
  lim: /\b(rapport|mensuel)\b/i,
  C: /\b(courriel|bonjour|email)\b/i,
  B: /\btokyo\b/i,
  D: /\b(quebec|québec|how far)\b/i,
  A: /\b(count|two hundred|montreal|montréal|story|weather|histoire)\b/i,
};

/** One warm EOS->first-audio sample per utterance. Metrics events repeat. */
export function noteWarmTotal(
  seen: Set<string>,
  totals: number[],
  turn: { utteranceId?: string; stoppedAt?: number; firstAudioAt?: number },
): boolean {
  if (typeof turn.stoppedAt !== "number" || typeof turn.firstAudioAt !== "number") return false;
  const key = turn.utteranceId ?? `${turn.stoppedAt}:${turn.firstAudioAt}`;
  if (seen.has(key)) return false;
  seen.add(key);
  totals.push(Math.max(0, Math.round(turn.firstAudioAt - turn.stoppedAt)));
  return true;
}

export function acceptanceVoiceCall(
  callId: string,
  utteranceId: string,
  lang: string,
  turn: { continues?: boolean; speculative?: boolean; interrupted?: boolean } = {},
): Record<string, unknown> {
  return {
    callId,
    utteranceId,
    language: voiceCallMarkLanguage(lang),
    duplex: true,
    ...(turn.continues ? { continues: true } : {}),
    ...(turn.speculative ? { speculative: true } : {}),
    ...(turn.interrupted ? { interrupted: true } : {}),
  };
}

/** Speculative continues also emit interrupt-bot. Score barge/stop only. */
export function scoreAcceptanceInterrupt(scriptId: string | undefined): Omit<AcceptanceEvent, "t"> | undefined {
  if (scriptId === "barge") return { kind: "interrupt", id: "barge" };
  return undefined;
}

export function scoreAcceptanceCancel(scriptId: string | undefined): boolean {
  return scriptId === "barge" || scriptId === "stop";
}

/** Wait before injecting a script line. Origin is after warmup/say, not process start. */
export function acceptanceInjectWait(originMs: number, atMs: number, nowMs: number): number {
  return Math.max(0, atMs - (nowMs - originMs));
}

/** Walk events in time: a non-continues send owns later turn events on that thread. */
export function assignAcceptanceTurnIds(events: AcceptanceEvent[]): void {
  const map = new Map<string, string>();
  for (const event of events) {
    if (event.kind === "send" && event.id && event.threadId && !event.continues) {
      map.set(event.threadId, event.id);
    }
    if ((event.kind === "turn-started" || event.kind === "turn-completed") && event.threadId && !event.id) {
      event.id = map.get(event.threadId);
    }
  }
}

export function matchAcceptanceLine(text: string): AcceptanceLine | undefined {
  const lines = [...ACCEPTANCE_SCRIPT, ...ACCEPTANCE_STOP_SCRIPT];
  const intent = classifyVoiceIntent(text);
  if (intent === "stop") return lines.find((row) => row.id === "stop");
  if (intent === "correction") return lines.find((row) => row.id === "corr");
  for (const id of ["barge", "lim", "C", "B", "D", "A"]) {
    if (HINT[id]!.test(text)) return lines.find((row) => row.id === id);
  }
  return undefined;
}

export function writePcm16Wav(path: string, pcm: Buffer, sampleRate = 24_000): void {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
}

const scriptedVad: VoiceProbability = { probability: async (frame) => Math.round(frame[0]! * 1e4) / 10, reset() {} };
function quietFrame(): Float32Array {
  const out = new Float32Array(VAD_FRAME).fill(0.001);
  out[0] = 0.03 / 1000;
  return out;
}

const WAIT_SOUL = "When they ask you to wait, you MUST call the wait tool with that many seconds before you say anything else. Do not skip the wait. After it returns, answer briefly in spoken sentences.";

type AcceptApi = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;

async function prepareAcceptBot(api: AcceptApi, name: string) {
  const created = await api("POST", "/api/bots", { name });
  const bot = (created.body as { bot: { id: string; threadId: string } }).bot;
  await api("PATCH", `/api/bots/${bot.id}`, {
    modelSelection: { instanceId: "grok", model: "grok-4-fast-non-reasoning" },
    approvalMode: "full",
    mcpServers: ["wait"],
    soul: WAIT_SOUL,
  });
  return bot;
}

async function driveAcceptancePhase(input: {
  api: AcceptApi;
  origin: string;
  headers: Record<string, string>;
  bot: { id: string; threadId: string };
  script: AcceptanceLine[];
  player: InstanceType<typeof ClockPlayer>;
  t0: number;
  tailMs: number;
}): Promise<{ events: AcceptanceEvent[]; warmTotals: number[] }> {
  const { api, origin, headers, bot, script, player, t0, tailMs } = input;
  const threadId = bot.threadId;
  const callId = `accept-${Date.now().toString(36)}`;
  const events: AcceptanceEvent[] = [];
  const mark = (event: Omit<AcceptanceEvent, "t">) => events.push({ t: Math.round(performance.now() - t0), ...event });
  await api("POST", `/api/bots/${bot.id}/voice/call`, { threadId, callId, state: "start", language: "auto" });

  const spoken = script.map((row) => {
    log(`say ${row.id} ${row.lang}`);
    return {
      row,
      frames: holdVoiceUntilTail(pcmFrames(spokenPcm(row.text, row.lang === "fr" ? BENCH_SAY_VOICE_FR : undefined))),
    };
  });

  let current: BenchReplyState = { text: "" };
  const transcriber = new LiveTranscriber({
    botId: bot.id,
    language: () => "auto",
    threadId: () => threadId,
    socket: (url) => new WebSocket(url.replace(/^ws:\/\/localhost/, origin.replace(/^http/, "ws")), { headers: { origin } }) as unknown as globalThis.WebSocket,
    transcribe: async (_botId, audio, language, thread) => {
      const query = new URLSearchParams({ language, ...(thread ? { threadId: thread } : {}) });
      const response = await fetch(`${origin}/api/bots/${bot.id}/voice/transcribe?${query}`, {
        method: "POST", headers: { origin, "content-type": audio.type || "audio/wav" }, body: audio,
      });
      if (!response.ok) throw new Error(`transcribe ${response.status}`);
      const body = await response.json() as { text?: string };
      return typeof body.text === "string" ? body.text : "";
    },
  });
  const speech = async (_botId: string, text: string, voice: { voice?: string; speed?: number; language?: string }, thread?: string, signal?: AbortSignal) => {
    const response = await fetch(`${origin}/api/bots/${bot.id}/voice/stream`, {
      method: "POST", headers, signal,
      body: JSON.stringify({ text, voice: voice.voice, speed: voice.speed, language: voice.language, threadId: thread }),
    });
    if (response.status === 204 || !response.body) return null;
    return { body: response.body, sampleRate: Number(response.headers.get("x-voice-sample-rate")) || 24_000 };
  };
  const speechSocket = new SpeechSocket({
    botId: bot.id,
    threadId: () => threadId,
    voice: () => ({ voice: "", speed: 1, language: "auto" }) as never,
    socket: (url) => new WebSocket(url.replace(/^ws:\/\/localhost/, origin.replace(/^http/, "ws")), { headers: { origin } }) as unknown as globalThis.WebSocket,
    post: speech as never,
  });
  const call = new VoiceCall({
    botId: bot.id,
    threadId: () => threadId,
    voice: () => ({ voice: "", speed: 1, language: "auto" }) as never,
    settings: () => ({ ...DEFAULT_CALL_SETTINGS, onlyMyVoice: false, earcons: false, thinkingCue: false, pause: "normal", streamingVoice: true, fasterEndOfTurn: true, fullDuplex: true }) as never,
    player: player as never,
    transcriber,
    models: async () => ({ vad: scriptedVad, embedder: null }),
    speechSocket,
    voiceprint: null,
    getUserMedia: async () => ({ getTracks: () => [], getAudioTracks: () => [] }) as unknown as MediaStream,
    createCaptureContext: () => ({
      sampleRate: 16_000, state: "running", resume: async () => {}, close: async () => {}, destination: {},
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => ({ fftSize: 0, connect() {}, disconnect() {} }),
      createScriptProcessor: () => ({ connect() {}, disconnect() {}, onaudioprocess: null }),
    }) as unknown as AudioContext,
  });

  const innerPlayer = { ...player.events };
  let speaking = false;
  let injectedId: string | undefined;
  player.events = {
    ...innerPlayer,
    onSentenceStart: (text, info) => {
      if (!speaking) {
        speaking = true;
        mark({ kind: "bot-speak-start", id: injectedId ?? matchAcceptanceLine(text)?.id ?? "reply" });
      }
      innerPlayer.onSentenceStart?.(text, info);
    },
    onIdle: () => {
      if (speaking) {
        speaking = false;
        mark({ kind: "bot-speak-end", id: "reply" });
      }
      innerPlayer.onIdle?.();
    },
  };

  const pendingSpeak: Array<SpeakItem & { text: string }> = [];
  const drainSpeak = () => {
    const slot = nextSpeakSlot({
      userSpeaking: call.current.phase === "hearing",
      botSpeaking: player.busy || call.current.botAudible,
      waiting: pendingSpeak,
    });
    if (slot.action === "hold") return;
    const item = pendingSpeak.find((row) => row.id === slot.id);
    if (!item) return;
    pendingSpeak.splice(pendingSpeak.indexOf(item), 1);
    if (item.id === "queued-notice") injectedId = "queued-notice";
    void Promise.resolve(item.id === "queued-notice" ? call.say(item.text) : call.replyDone(item.text)).finally(() => {
      drainSpeak();
    });
  };

  const warmTotals: number[] = [];
  const warmSeen = new Set<string>();
  call.on("metrics", (turn) => {
    if (!turn) return;
    noteWarmTotal(warmSeen, warmTotals, turn);
  });
  call.on("utterance", (text, turnMetrics, turn) => {
    if (!shouldPostAcceptanceUtterance(turn)) {
      log(`skip speculative ${text.slice(0, 48)}`);
      return;
    }
    const line = matchAcceptanceLine(text);
    const utteranceId = turn.utteranceId ?? `acc-${Math.random().toString(36).slice(2, 10)}`;
    void api("POST", `/api/bots/${bot.id}/messages`, {
      threadId, text, sendId: utteranceId,
      voiceCall: acceptanceVoiceCall(callId, utteranceId, line?.lang ?? "en", turn),
    }).then((sent) => {
      const parallel = (sent.body as { parallel?: { state?: string; threadId?: string } }).parallel;
      const stopped = (sent.body as { stopped?: boolean }).stopped === true;
      mark({
        kind: "send",
        id: line?.id,
        threadId: parallel?.threadId ?? threadId,
        parallel: parallel?.state === "queued" || parallel?.state === "running" ? parallel.state : undefined,
        intent: classifyVoiceIntent(text),
        continues: turn.continues === true,
        stopped,
      });
      if (stopped) mark({ kind: "cancelled", id: "A", threadId });
      log(`send ${line?.id ?? "?"} status=${sent.status} parallel=${parallel?.state ?? "none"} stopped=${stopped}`);
    });
  });
  call.on("interrupt-bot", (target) => {
    const scored = scoreAcceptanceInterrupt(injectedId);
    if (scored) mark(scored);
    void api("POST", `/api/bots/${bot.id}/interrupt`, benchInterruptBody(threadId, target)).then(() => {
      if (scoreAcceptanceCancel(injectedId)) mark({ kind: "cancelled", id: "A", threadId });
    });
  });

  const eventsAbort = new AbortController();
  void (async () => {
    const response = await fetch(`${origin}/api/events`, { headers: { origin }, signal: eventsAbort.signal });
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block.split("\n").filter((row) => row.startsWith("data:")).map((row) => row.slice(5).trim()).join("");
        if (!data) continue;
        let frame: { kind?: string; event?: { type?: string; threadId?: string; streamKind?: string; delta?: string; itemType?: string; text?: string } };
        try { frame = JSON.parse(data); } catch { continue; }
        const event = frame?.kind === "runtime" ? frame.event : null;
        if (!event) continue;
        if (event.type === "turn.started") mark({ kind: "turn-started", threadId: event.threadId });
        if (event.type === "turn.completed") mark({ kind: "turn-completed", threadId: event.threadId });
        applyBenchRuntimeEvent(event, threadId, current, {
          progress: (text) => call.replyProgress(text),
          done: (text) => {
            pendingSpeak.push({ id: `reply-${pendingSpeak.length}`, priority: "user-reply", at: performance.now(), text });
            drainSpeak();
          },
          setBusy: (busy) => call.setBotBusy(busy),
        });
      }
    }
  })().catch(() => {});

  await call.start();
  await speechSocket.connect();
  await sleep(300);

  let pendingFrames: Array<{ id: string; frame: Float32Array }> = [];
  let stopMic = false;
  const mic = (async () => {
    const started = performance.now();
    for (let i = 0; !stopMic; i++) {
      await sleep(started + i * 32 - performance.now());
      const next = pendingFrames.shift();
      if (next) {
        injectedId = next.id;
        call.frame(next.frame);
      } else call.frame(quietFrame());
    }
  })();

  const seen = new Set<string>();
  const poll = async () => {
    const messages = ((await api("GET", `/api/threads/${threadId}/messages?limit=200`)).body.messages ?? []) as Array<{
      text?: string; parallelTask?: { role?: string; state?: string; threadId?: string }; role?: string;
    }>;
    for (const message of messages) {
      const key = `${message.parallelTask?.role}:${message.parallelTask?.threadId}:${message.text?.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (message.parallelTask?.state === "queued") {
        pendingSpeak.push({ id: "queued-notice", priority: "queued-notice", at: performance.now(), text: "That one is waiting for a free slot." });
        drainSpeak();
      }
      if (message.parallelTask?.state === "running" && message.parallelTask.role === "card") {
        const send = events.find((event) => event.kind === "send" && event.threadId === message.parallelTask!.threadId);
        mark({ kind: "parallel-running", id: send?.id ?? "lim", threadId: message.parallelTask.threadId });
      }
      if (message.parallelTask?.role === "result" && message.text) {
        const send = events.find((event) => event.kind === "send" && event.threadId === message.parallelTask!.threadId);
        const line = matchAcceptanceLine(message.text);
        mark({ kind: "turn-completed", id: send?.id ?? line?.id, threadId: message.parallelTask.threadId });
        pendingSpeak.push({ id: send?.id ?? line?.id ?? "topic", priority: "topic-result", at: performance.now(), text: message.text });
        drainSpeak();
      }
    }
    const tasks = ((await api("GET", "/api/bots")).body as { bots: Array<{ id: string; tasks?: Array<{ threadId: string; busy?: boolean }> }> }).bots.find((row) => row.id === bot.id)?.tasks ?? [];
    for (const task of tasks) {
      if (!task.busy && events.some((event) => event.threadId === task.threadId && event.kind === "send") && !events.some((event) => event.threadId === task.threadId && event.kind === "turn-completed")) {
        mark({ kind: "turn-completed", threadId: task.threadId });
      }
    }
  };

  const injectOrigin = performance.now();
  for (const item of spoken) {
    await sleep(acceptanceInjectWait(injectOrigin, item.row.atMs, performance.now()));
    log(`inject ${item.row.id}`);
    pendingFrames.push(...item.frames.map((frame) => ({ id: item.row.id, frame })));
  }
  const end = performance.now() + tailMs;
  while (performance.now() < end) {
    await poll();
    await sleep(500);
  }
  stopMic = true;
  await mic;
  eventsAbort.abort();
  call.end();

  assignAcceptanceTurnIds(events);
  for (const event of events) {
    if ((event.kind === "turn-started" || event.kind === "turn-completed") && event.threadId === threadId && !event.id) {
      event.id = "A";
    }
  }
  return { events, warmTotals };
}

export async function runVoiceAcceptanceCall(outDir?: string): Promise<{
  dir: string;
  scores: AcceptanceScore[];
  events: AcceptanceEvent[];
  warmTotals: number[];
}> {
  const key = loadVoiceBenchKey();
  if (!key) throw new Error("SAGAX_VOICE_ACCEPTANCE needs tts.xaiKey in the develop config");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = outDir ?? join("/tmp/sagax-voice-acceptance", runId);
  mkdirSync(dir, { recursive: true });
  const t0 = performance.now();

  const port = await freePortBlock([0, 1]);
  const dataDir = mkdtempSync(join(tmpdir(), "omb-voice-accept-"));
  mkdirSync(join(dataDir, "tmp"), { recursive: true });
  writeFileSync(join(dataDir, "config.json"), JSON.stringify({
    tts: { provider: "xai" },
    instances: {
      grok: {
        driver: "grok",
        displayName: "Accept",
        config: { tools: true, url: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" },
      },
    },
  }));
  const childEnv = {
    ...verificationServerEnvironment(process.env, dataDir, port),
    SAGAX_XAI_VOICE_KEY: key,
    XAI_API_KEY: key,
  };
  let serverLog = "";
  const child: ChildProcess = spawn(process.execPath, ["--experimental-strip-types", join(ROOT, "server", "index.ts")], {
    cwd: ROOT, env: childEnv, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (chunk) => { serverLog += chunk; });
  child.stderr!.on("data", (chunk) => { serverLog += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const up = Date.now() + 30_000;
  for (;;) {
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* starting */ }
    if (Date.now() > up) throw new Error(`acceptance server did not start:\n${serverLog.slice(-2000)}`);
    await sleep(150);
  }
  const headers = { origin, "content-type": "application/json" };
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  };

  const chunks: Uint8Array[] = [];
  const player = new ClockPlayer();
  const origEnqueue = player.enqueue.bind(player);
  player.enqueue = ((sentence) => {
    const audio = sentence.audio;
    sentence.audio = audio.then(async (result) => {
      if (!result) return result;
      const reader = result.body.getReader();
      const parts: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(value);
      }
      for (const part of parts) chunks.push(part);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          controller.close();
        },
      });
      return { ...result, body };
    });
    origEnqueue(sentence);
  }) as typeof player.enqueue;

  try {
    await api("POST", "/api/mcp/servers", {
      name: "wait",
      command: process.execPath,
      args: [join(ROOT, "scripts", "voice-acceptance-wait-mcp.mjs")],
      enabled: true,
    });
    await api("PATCH", "/api/mcp/servers/wait", { enabled: true });
    await api("PATCH", "/api/config", { threads: { maxParallelPerPerson: 2 } });
    const bot = await prepareAcceptBot(api, "Accept");
    const stopBot = await prepareAcceptBot(api, "AcceptStop");
    const phase = {
      api, origin, headers, player, t0,
    };
    const fork = await driveAcceptancePhase({ ...phase, bot, script: ACCEPTANCE_SCRIPT, tailMs: 35_000 });
    const stop = await driveAcceptancePhase({ ...phase, bot: stopBot, script: ACCEPTANCE_STOP_SCRIPT, tailMs: 25_000 });
    const events = [...fork.events, ...stop.events];
    const warmTotals = [...fork.warmTotals, ...stop.warmTotals];
    const scores = mergeAcceptanceScores(
      scoreAcceptance(fork.events, { warmTotals: fork.warmTotals.slice(1), targetMs: 800 }),
      scoreAcceptance(stop.events, { warmTotals: stop.warmTotals.slice(1), targetMs: 800 }),
    );
    writeFileSync(join(dir, "events.json"), JSON.stringify({ events, fork: fork.events, stop: stop.events, warmTotals, scores }, null, 2));
    writeFileSync(join(dir, "transcripts.md"), events.filter((event) => event.kind === "send" || event.kind === "turn-completed").map((event) => `${event.t} ${event.kind} ${event.id ?? ""}`).join("\n"));
    writePcm16Wav(join(dir, "bot.wav"), Buffer.concat(chunks.map((part) => Buffer.from(part))));
    writeFileSync(join(dir, "summary.md"), formatAcceptanceSummary(scores, [
      `run ${runId}`,
      `events ${events.length}`,
      `warm n=${warmTotals.slice(1).length} raw=${warmTotals.join(",")}`,
    ]));
    log(`wrote ${dir}`);
    return { dir, scores, events, warmTotals };

  } finally {
    child.kill("SIGTERM");
  }
}

