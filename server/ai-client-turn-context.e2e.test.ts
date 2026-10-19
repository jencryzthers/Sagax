// What a one-word ping from an AI client puts in front of the engine, through
// the two member API doors Perspicax uses: the deprecated `sagax_send`
// (POST bots/{id}/messages) and the recommended `send_prompt`
// (POST agents/send_prompt). Both must reach the same hidden conversation
// (#291) through the same turn path, so a ping costs the same either way.
//
// The fake Claude CLI exits after each turn (FAKE_CLAUDE_EXIT_AFTER_TURN), so
// every turn launches again and the dump holds that turn's own launch files:
// its system prompt, its MCP servers, its argv (--resume) and the prompt it
// was handed. The native session a resumed turn continues holds every earlier
// message of the conversation, which the model reads again: the test counts
// it from the thread itself. Estimated tokens are characters / 4.
//
// Set AI_CLIENT_CONTEXT_REPORT=<file> to write the figures there as JSON.
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "./testing/cleanup.ts";
import { startFakeOidcProvider, type FakeOidcProvider, type FakeOidcUser } from "./testing/fake-oidc-provider.ts";
import { freePortBlock } from "./testing/ports.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = join(SERVER_DIR, "testing", "fake-claude-cli.ts");
const posixOnly = describe.skipIf(process.platform === "win32");
const ALICE: FakeOidcUser = { sub: "01J9C1ALICE0000000000000A", name: "Alice", preferred_username: "alice", role: "admin", teams: [] };
const BOB: FakeOidcUser = { sub: "01J9C1BOB00000000000000B", name: "Bob", preferred_username: "bob", role: "employee", teams: [] };
/** Earlier exchanges in the AI client's conversation before the pings. */
const EARLIER = 8;
const EARLIER_TEXT = 2_000;

let PORT = 0;
let BASE = "";
let child: ChildProcess;
let home: string;
let log = "";
let idp: FakeOidcProvider;

type Auth = { cookie?: string; bearer?: string };
type Reply = { status: number; body: any; text: string };
const api = async (method: string, path: string, auth?: Auth, body?: unknown): Promise<Reply> => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(auth?.cookie ? { cookie: auth.cookie } : {}),
      ...(auth?.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: parsed, text };
};
const cookiePair = (setCookie: string) => setCookie.split(";")[0]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signIn(user: FakeOidcUser): Promise<Auth> {
  idp.user = { ...user };
  const start = await fetch(`${BASE}/auth/oidc/start`, { redirect: "manual" });
  const binding = cookiePair(start.headers.getSetCookie().find((c) => c.includes("_oidc="))!);
  const authorize = await fetch(start.headers.get("location")!, { redirect: "manual" });
  const callback = await fetch(authorize.headers.get("location")!, { redirect: "manual", headers: { cookie: binding } });
  const session = callback.headers.getSetCookie().find((c) => c.startsWith("omb_session_") && !c.includes("_oidc="));
  expect(callback.headers.get("location"), log.slice(-2000)).toBe("/");
  return { cookie: cookiePair(session!) };
}

/** One AI client call for this person, as Perspicax signs it. */
const member = (method: string, sub: string, user: FakeOidcUser, body?: unknown) =>
  api(method, `/api/org/member/${sub}`, {
    bearer: idp.consoleAssertion({
      sub: user.sub, aud: BASE, role: user.role === "admin" ? "admin" : "employee", teams: user.teams ?? [],
      claims: (c) => ({ ...c, act: { sub: "perspicax-mcp" } }),
    }),
  }, body);

async function start() {
  child = spawn(process.execPath, [join(SERVER_DIR, "index.ts")], {
    cwd: join(SERVER_DIR, ".."),
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      HOME: home, USERPROFILE: home, SAGAX_LOCAL_VM_TEST_NAMESPACE: process.env.SAGAX_LOCAL_VM_TEST_NAMESPACE ?? "", SAGAX_PORT: String(PORT), SAGAX_WEBHOOK_PORT: String(PORT + 1),
      SAGAX_IDENTITY: "perspicax",
      SAGAX_PERSPICAX_ISSUER: idp.issuer,
      SAGAX_PUBLIC_URL: BASE,
      SAGAX_PERSPICAX_LINK_FILE: join(home, "link", "pulsabot.json"),
      SAGAX_PERSPICAX_DIRECTORY_SECONDS: "5",
      SAGAX_ANTHROPIC_API_KEY: "sk-ant-test-org-key-000000",
      SAGAX_ORG_NAME: "Acme",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (c) => (log += c));
  child.stderr!.on("data", (c) => (log += c));
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`server never came up:\n${log}`);
    await sleep(150);
  }
}

type Dump = { argv: string[]; prompt: unknown; systemPrompt: string | null; mcpConfig: { mcpServers?: Record<string, unknown> } | null };
type Measure = { door: string; threadId: string; resumed: boolean; system: number; message: number; history: number; mcpServers: string[]; tokens: number };

posixOnly("AI client ping: what the engine is handed (sagax_send vs send_prompt)", () => {
  let bob: Auth;
  let botId = "";
  const dumpPath = () => join(home, "turn-dump.json");

  beforeAll(async () => {
    chmodSync(FAKE_CLAUDE, 0o755);
    idp = await startFakeOidcProvider({ user: ALICE });
    idp.directoryPeople = [idp.personOf(ALICE), idp.personOf(BOB)];
    PORT = await freePortBlock([0, 1]);
    BASE = `http://127.0.0.1:${PORT}`;
    home = mkdtempSync(join(tmpdir(), "omb-ai-client-context-"));
    const data = join(home, ".sagax");
    mkdirSync(data, { recursive: true });
    mkdirSync(join(home, "link"), { recursive: true, mode: 0o750 });
    writeFileSync(join(home, "link", "pulsabot.json"), JSON.stringify({
      version: 1, issuer: idp.issuer, client_id: "pulsa-bot", server_id: idp.serverId, origin: BASE, link_token: idp.linkToken,
    }), { mode: 0o640 });
    writeFileSync(join(data, "config.json"), JSON.stringify({
      instances: {
        claude: {
          driver: "claudeAgent",
          environment: { FAKE_CLAUDE_DUMP: dumpPath(), FAKE_CLAUDE_EXIT_AFTER_TURN: "1" },
          config: { cli: FAKE_CLAUDE, fullAuto: true },
        },
      },
    }));
    await start();
    const alice = await signIn(ALICE);
    const people = await (async () => {
      const deadline = Date.now() + 15_000;
      for (;;) {
        const got = (await api("GET", "/api/org/directory", alice)).body.people as unknown[] | undefined;
        if (got && got.length === 2) return got;
        if (Date.now() > deadline) throw new Error(`directory never filled:\n${log.slice(-3000)}`);
        await sleep(300);
      }
    })();
    expect(people).toHaveLength(2);
    bob = await signIn(BOB);
    const created = await api("POST", "/api/bots", bob, { name: "Orion" });
    expect(created.status, created.text).toBe(201);
    botId = created.body.bot.id;
    const patched = await api("PATCH", `/api/bots/${botId}`, bob, { modelSelection: { instanceId: "claude", model: "fake-model" } });
    expect(patched.status, patched.text).toBe(200);
  }, 120_000);

  afterAll(async () => {
    child?.kill("SIGTERM");
    if (child) await waitForExit(child);
    await idp?.close();
    if (home) removeTempDir(home);
  });

  /** Characters of every message the conversation holds before `beforeId`. */
  async function historyChars(threadId: string, beforeId: string | null): Promise<number> {
    const read = await api("GET", `/api/threads/${threadId}/messages?limit=500`, bob);
    expect(read.status, read.text).toBe(200);
    const rows = read.body.messages as Array<{ id: string; text?: string }>;
    const end = beforeId ? rows.findIndex((row) => row.id === beforeId) : rows.length;
    return rows.slice(0, end < 0 ? rows.length : end).reduce((n, row) => n + (row.text ?? "").length, 0);
  }

  function readDump(): Dump {
    return JSON.parse(readFileSync(dumpPath(), "utf8")) as Dump;
  }

  async function measure(door: string, threadId: string, messageId: string | null): Promise<Measure> {
    const dump = readDump();
    const resumed = dump.argv.includes("--resume");
    const system = (dump.systemPrompt ?? "").length;
    const message = JSON.stringify(dump.prompt).length;
    const history = resumed ? await historyChars(threadId, messageId) : 0;
    const mcpServers = Object.keys(dump.mcpConfig?.mcpServers ?? {}).sort();
    return { door, threadId, resumed, system, message, history, mcpServers, tokens: Math.ceil((system + message + history) / 4) };
  }

  it("a one-word ping costs the same through sagax_send and send_prompt, in the same hidden conversation", async () => {
    // The AI client's earlier work in its hidden conversation.
    let threadId = "";
    for (let i = 0; i < EARLIER; i += 1) {
      const sent = await member("POST", `bots/${botId}/messages`, BOB, { text: `job ${i} ${"x".repeat(EARLIER_TEXT)}`, wait: 30 });
      expect(sent.status, sent.text).toBe(200);
      expect(sent.body.status, sent.text).toBe("done");
      threadId ||= sent.body.threadId;
      expect(sent.body.threadId).toBe(threadId);
    }

    const viaSend = await member("POST", `bots/${botId}/messages`, BOB, { text: "ping", wait: 30 });
    expect(viaSend.status, viaSend.text).toBe(200);
    expect(viaSend.body.status).toBe("done");
    expect(viaSend.body.threadId).toBe(threadId);
    const send = await measure("sagax_send", threadId, viaSend.body.messageId);

    const viaPrompt = await member("POST", "agents/send_prompt", BOB, { agent_id: botId, prompt: "ping", mode: "blocking", timeout_ms: 30_000 });
    expect(viaPrompt.status, viaPrompt.text).toBe(200);
    expect(viaPrompt.body.finished).toBe(true);
    // the same hidden conversation: send_prompt is not a smaller one
    expect(viaPrompt.body.thread_id).toBe(threadId);
    const latest = await api("GET", `/api/threads/${threadId}/messages?limit=500`, bob);
    const pingRows = (latest.body.messages as Array<{ id: string; role: string; text?: string }>).filter((row) => row.role === "user" && row.text === "ping");
    const prompt = await measure("send_prompt", threadId, pingRows.at(-1)!.id);

    // a fresh hidden conversation (sagax_send newThread) for scale
    const fresh = await member("POST", `bots/${botId}/messages`, BOB, { text: "ping", wait: 30, newThread: true });
    expect(fresh.status, fresh.text).toBe(200);
    expect(fresh.body.threadId).not.toBe(threadId);
    const blank = await measure("sagax_send newThread", fresh.body.threadId, fresh.body.messageId);

    if (process.env.AI_CLIENT_CONTEXT_REPORT) {
      writeFileSync(process.env.AI_CLIENT_CONTEXT_REPORT, JSON.stringify({ earlier: EARLIER, earlierText: EARLIER_TEXT, rows: [send, prompt, blank], pingPrompt: readDump().prompt }, null, 2));
    }

    // Same door underneath: same session, same system prompt, same servers,
    // same history. Only the message frame may differ by a few characters.
    expect(send.resumed).toBe(true);
    expect(prompt.resumed).toBe(true);
    expect(prompt.mcpServers).toEqual(send.mcpServers);
    expect(Math.abs(prompt.system - send.system)).toBeLessThan(200);
    expect(Math.abs(prompt.message - send.message)).toBeLessThan(200);
    expect(prompt.history).toBeGreaterThanOrEqual(send.history);
  }, 240_000);
});
