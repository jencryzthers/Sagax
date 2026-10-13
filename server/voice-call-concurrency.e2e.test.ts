// True concurrency on a duplex voice call (issue #292, Review 3).
// A new topic forks while the call thread's own tool runs (the work is
// parked, not killed). Stop and correction still replace. A background
// parallel task survives barge-in. While the call thread only thinks, a new
// utterance replaces it: a call never turns the person's sentences into
// parallel-task cards (2026-10-13, one card per partial and final).
// POSIX-gated like the other CLI e2es (the fakes are shebang scripts).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freePortBlock } from "./testing/ports.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = join(SERVER_DIR, "testing", "fake-claude-cli.ts");
const posixOnly = describe.skipIf(process.platform === "win32");
const CALL_ID = "call-conc-0123456789";

posixOnly("voice call true concurrency e2e", () => {
  let child: ChildProcess;
  let home: string;
  let gates: string;
  let base = "";
  let stderr = "";

  const api = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const getBot = async (id: string) => (await api("GET", "/api/bots")).body.bots.find((b: any) => b.id === id);
  const messages = async (threadId: string): Promise<any[]> =>
    (await api("GET", `/api/threads/${threadId}/messages?limit=200`)).body.messages ?? [];
  const tasks = async (botId: string): Promise<any[]> => (await getBot(botId)).tasks ?? [];
  const open = (name: string) => writeFileSync(join(gates, name), "go");
  const waitFor = async (predicate: () => Promise<boolean>, what: string, ms = 30_000) => {
    const deadline = Date.now() + ms;
    while (!(await predicate())) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}. stderr: ${stderr.slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const voice = (text: string, utteranceId: string) => ({
    text,
    voiceCall: { callId: CALL_ID, duplex: true, utteranceId },
  });
  /** A call whose first turn holds on a tool (instance `claude`) or only
   * thinks (instance `think`). */
  const busyCall = async (gate: string, instanceId: "claude" | "think" = "claude") => {
    const bot = (await api("POST", "/api/bots")).body.bot;
    await api("PATCH", `/api/bots/${bot.id}`, { modelSelection: { instanceId, model: "claude-fake" } });
    const sent = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice(`[gate:${gate}] look up the weather in Montreal`, `utt-${gate}`),
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(202);
    await waitFor(async () => (await getBot(bot.id)).busy === true, "the first turn to start");
    if (instanceId === "claude") {
      await waitFor(async () => (await messages(bot.threadId)).some((m) => m.kind === "activity" && m.tool?.name && m.tool.ok === undefined && !m.parallelTask),
        "the first turn's tool in flight");
    }
    return bot as { id: string; threadId: string };
  };

  beforeAll(async () => {
    chmodSync(FAKE_CLAUDE, 0o755);
    home = mkdtempSync(join(tmpdir(), "omb-voice-conc-"));
    gates = join(home, "gates");
    mkdirSync(gates, { recursive: true });
    mkdirSync(join(home, ".sagax"), { recursive: true });
    writeFileSync(join(home, ".sagax", "config.json"), JSON.stringify({
      instances: {
        claude: {
          driver: "claudeAgent",
          environment: { FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_GATE_DIR: gates, FAKE_CLAUDE_HOLD_AFTER_TOOL: "1" },
          config: { cli: FAKE_CLAUDE, permissionMode: "bypassPermissions" },
        },
        think: {
          driver: "claudeAgent",
          environment: { FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_GATE_DIR: gates },
          config: { cli: FAKE_CLAUDE, permissionMode: "bypassPermissions" },
        },
      },
    }));
    const port = await freePortBlock([0, 1]);
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(SERVER_DIR, "index.ts")], {
      cwd: join(SERVER_DIR, ".."),
      env: { ...(process.env.PATH ? { PATH: process.env.PATH } : {}), HOME: home, USERPROFILE: home, SAGAX_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr!.on("data", (c) => (stderr += c));
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) throw new Error(`server never came up. stderr:\n${stderr}`);
      if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}. stderr:\n${stderr}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }, 30_000);

  afterAll(async () => {
    child?.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (!child || child.exitCode !== null) return resolve();
      child.on("close", () => resolve());
      setTimeout(() => (child.kill("SIGKILL"), resolve()), 5_000).unref?.();
    });
    rmSync(home, { recursive: true, force: true });
  });

  it("a call with N utterances while the bot only thinks: no parallel task, one answered turn for the final words", async () => {
    // JC 2026-10-13: a partial and its final each opened a "Tâche en
    // parallèle" card ("And And Just wondering if you will be." / "... would be
    // able to ..."). The person's words are the call, never background work.
    const bot = await busyCall("thinkN", "think");
    const send = (text: string, utteranceId: string, extra: Record<string, unknown> = {}) => api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId, text, voiceCall: { callId: CALL_ID, duplex: true, utteranceId, ...extra },
    });
    const partial = await send("[gate:nB] And And Just wondering if you will be.", "utt-nB-partial", { speculative: true });
    expect(partial.status, JSON.stringify(partial.body)).toBe(202);
    expect(partial.body.parallel).toBeUndefined();
    const final = await send("[gate:nB] And And Just wondering if you would be able to check the ticket", "utt-nB-final", { continues: true });
    expect(final.status, JSON.stringify(final.body)).toBe(202);
    expect(final.body.parallel).toBeUndefined();
    open("thinkN");
    open("nB");
    await waitFor(async () => (await messages(bot.threadId)).some((m) => m.role === "bot" && m.kind === "text" && m.text?.includes("would be able to")),
      "the final words answered");
    await waitFor(async () => (await tasks(bot.id)).every((task) => !task.busy), "the call settled");
    const thread = await messages(bot.threadId);
    expect(thread.filter((m) => m.parallelTask)).toEqual([]);
    expect(await tasks(bot.id)).toHaveLength(1);
    const answers = thread.filter((m) => m.role === "bot" && m.kind === "text" && m.text?.startsWith("reply to:"));
    expect(answers.map((m) => m.text)).toEqual([expect.stringContaining("would be able to check the ticket")]);
  }, 60_000);

  it("a) B asked while A runs a tool: both complete, A is not cancelled", async () => {
    const bot = await busyCall("thinkA");
    const b = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("[gate:thinkB] what time is it in Tokyo", "utt-thinkB"),
    });
    expect(b.status, JSON.stringify(b.body)).toBe(202);
    expect(b.body.parallel?.state).toBe("running");
    const bThread = b.body.parallel.threadId as string;
    await waitFor(async () => (await tasks(bot.id)).filter((task) => task.busy).length >= 2, "A and B both running");
    expect((await getBot(bot.id)).busy).toBe(true);
    expect((await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy).toBe(true);

    open("thinkB");
    await waitFor(async () => (await messages(bot.threadId)).some((m) => m.parallelTask?.role === "result" && m.parallelTask.threadId === bThread), "B result");
    expect((await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy).toBe(true);

    open("thinkA");
    await waitFor(async () => (await tasks(bot.id)).every((task) => !task.busy), "both settled");
    const main = await messages(bot.threadId);
    const aReply = main.find((m) => m.role === "bot" && m.kind === "text" && m.text?.includes("look up the weather") && !m.parallelTask);
    const bReply = main.find((m) => m.parallelTask?.role === "result" && m.parallelTask.threadId === bThread);
    expect(aReply?.text).toContain("weather");
    expect(bReply?.text).toContain("what time is it in Tokyo");
    expect(aReply?.text).not.toContain("cancelled");
  }, 60_000);

  it("a continues reissue of a new topic forks, it does not replace A", async () => {
    const bot = await busyCall("contA");
    const b = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      text: "[gate:contB] what time is it in Tokyo",
      voiceCall: { callId: CALL_ID, duplex: true, utteranceId: "utt-contB", continues: true },
    });
    expect(b.status, JSON.stringify(b.body)).toBe(202);
    expect(b.body.parallel?.state).toBe("running");
    const bThread = b.body.parallel.threadId as string;
    await waitFor(async () => (await tasks(bot.id)).filter((task) => task.busy).length >= 2, "A and B both running");
    expect((await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy).toBe(true);
    open("contB");
    await waitFor(async () => (await messages(bot.threadId)).some((m) => m.parallelTask?.role === "result" && m.parallelTask.threadId === bThread), "B result");
    expect((await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy).toBe(true);
    open("contA");
    await waitFor(async () => (await tasks(bot.id)).every((task) => !task.busy), "both settled");
  }, 60_000);

  it("b) three overlapping voice topics all complete", async () => {
    const bot = await busyCall("threeA");
    const b = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("[gate:threeB] what time is it in Tokyo", "utt-threeB"),
    });
    const c = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("[gate:threeC] draft a short hello email", "utt-threeC"),
    });
    expect(b.body.parallel?.state).toBe("running");
    expect(c.body.parallel?.state).toBe("running");
    await waitFor(async () => (await tasks(bot.id)).filter((task) => task.busy).length === 3, "three turns at once");
    open("threeC");
    open("threeB");
    open("threeA");
    await waitFor(async () => (await messages(bot.threadId)).filter((m) => m.parallelTask?.role === "result").length === 2
      && (await tasks(bot.id)).every((task) => !task.busy), "all three settled");
    const results = (await messages(bot.threadId)).filter((m) => m.parallelTask?.role === "result");
    expect(results).toHaveLength(2);
    expect(results.map((m) => m.text).join("\n")).toContain("what time is it in Tokyo");
    expect(results.map((m) => m.text).join("\n")).toContain("draft a short hello email");
  }, 60_000);

  it("c) barge-in interrupt does not kill a running background task", async () => {
    const bot = await busyCall("bargeA");
    const b = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("[gate:bargeB] summarize the last ticket", "utt-bargeB"),
    });
    const bThread = b.body.parallel.threadId as string;
    await waitFor(async () => (await tasks(bot.id)).find((task) => task.threadId === bThread)?.busy === true, "B running");
    const stopped = await api("POST", `/api/bots/${bot.id}/interrupt`, { threadId: bot.threadId });
    expect(stopped.status).toBeLessThan(300);
    await waitFor(async () => (await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy !== true, "A interrupted");
    expect((await tasks(bot.id)).find((task) => task.threadId === bThread)?.busy).toBe(true);
    open("bargeB");
    await waitFor(async () => (await messages(bot.threadId)).some((m) => m.parallelTask?.role === "result" && m.parallelTask.threadId === bThread), "B result after barge-in");
  }, 60_000);

  it("e) over the per-person limit the extra task is queued then later runs", async () => {
    expect((await api("PATCH", "/api/config", { threads: { maxParallelPerPerson: 1 } })).status).toBe(200);
    try {
      const bot = await busyCall("limA");
      const first = await api("POST", `/api/bots/${bot.id}/messages`, {
        threadId: bot.threadId,
        ...voice("[gate:limB] first extra topic", "utt-limB"),
      });
      const second = await api("POST", `/api/bots/${bot.id}/messages`, {
        threadId: bot.threadId,
        ...voice("[gate:limC] second extra topic", "utt-limC"),
      });
      expect(first.body.parallel?.state).toBe("running");
      expect(second.body.parallel?.state).toBe("queued");
      const card = (await messages(bot.threadId)).find((m) => m.parallelTask?.threadId === second.body.parallel.threadId && m.parallelTask?.role === "card");
      expect(card?.parallelTask?.state).toBe("queued");
      open("limB");
      await waitFor(async () => (await tasks(bot.id)).find((task) => task.threadId === second.body.parallel.threadId)?.busy === true, "queued task starts");
      open("limC");
      open("limA");
      await waitFor(async () => (await messages(bot.threadId)).filter((m) => m.parallelTask?.role === "result").length === 2, "both extras finished");
    } finally {
      await api("PATCH", "/api/config", { threads: { maxParallelPerPerson: null } });
    }
  }, 90_000);

  it("f) stop replaces the thinking turn; an unrelated background task keeps running", async () => {
    const bot = await busyCall("stopA");
    const b = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("[gate:stopB] what about the weather in Paris", "utt-stopB"),
    });
    const bThread = b.body.parallel.threadId as string;
    await waitFor(async () => (await tasks(bot.id)).find((task) => task.threadId === bThread)?.busy === true, "B running");
    const stop = await api("POST", `/api/bots/${bot.id}/messages`, {
      threadId: bot.threadId,
      ...voice("stop", "utt-stop"),
    });
    expect(stop.status, JSON.stringify(stop.body)).toBe(202);
    expect(stop.body.parallel).toBeUndefined();
    await waitFor(async () => (await tasks(bot.id)).find((task) => task.threadId === bot.threadId)?.busy !== true, "stop cancelled A");
    expect((await tasks(bot.id)).find((task) => task.threadId === bThread)?.busy).toBe(true);
    open("stopB");
    await waitFor(async () => (await messages(bot.threadId)).some((m) => m.parallelTask?.role === "result" && m.parallelTask.threadId === bThread), "B survived stop");
  }, 60_000);
});
