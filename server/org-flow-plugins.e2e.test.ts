// Pulsatrix Flow's default plugins through the real server
// (server/org-flow-plugins.ts): the directory's declaration starts the sync,
// the organization's marketplace list is never widened, and Perspicax turning
// the default off empties it at the next directory. Clones are covered by
// server/org-flow-plugins.test.ts; here the marketplace list refuses both
// sources, so nothing reaches the network.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "./testing/cleanup.ts";
import { startFakeOidcProvider, type FakeOidcProvider, type FakeOidcUser } from "./testing/fake-oidc-provider.ts";
import { freePortBlock } from "./testing/ports.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const posixOnly = describe.skipIf(process.platform === "win32");
const ALICE: FakeOidcUser = { sub: "01J9F1ALICE0000000000000A", name: "Alice", preferred_username: "alice", role: "admin", teams: [] };
const BOB: FakeOidcUser = { sub: "01J9F1BOB00000000000000B", name: "Bob", preferred_username: "bob", role: "employee", teams: [] };
const DECLARED = {
  enabled: true,
  marketplaces: [{ name: "pulsatrix", source: "pulsatrixtechnologies/marketplace" }, { name: "acme", source: "acme/marketplace" }],
  plugins: [{ name: "pulsatrix-flow", marketplace: "pulsatrix", tenant: false }, { name: "pulsatrix-flow-acme", marketplace: "acme", tenant: true }],
};

let PORT = 0;
let BASE = "";
let child: ChildProcess;
let home: string;
let log = "";
let idp: FakeOidcProvider;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cookiePair = (setCookie: string) => setCookie.split(";")[0]!;

async function signIn(user: FakeOidcUser): Promise<string> {
  idp.user = { ...user };
  const start = await fetch(`${BASE}/auth/oidc/start`, { redirect: "manual" });
  const binding = cookiePair(start.headers.getSetCookie().find((c) => c.includes("_oidc="))!);
  const authorize = await fetch(start.headers.get("location")!, { redirect: "manual" });
  const callback = await fetch(authorize.headers.get("location")!, { redirect: "manual", headers: { cookie: binding } });
  return cookiePair(callback.headers.getSetCookie().find((c) => c.startsWith("omb_session_") && !c.includes("_oidc="))!);
}

async function flowStatus(cookie: string): Promise<any> {
  const res = await fetch(`${BASE}/api/org`, { headers: { cookie } });
  return ((await res.json()) as { settings?: { flowPlugins?: unknown } }).settings?.flowPlugins;
}

async function waitFor<T>(read: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out. server log:\n${log.slice(-3000)}`);
    await sleep(200);
  }
}

posixOnly("Pulsatrix Flow's default plugins on an organization server", () => {
  beforeAll(async () => {
    idp = await startFakeOidcProvider({ user: ALICE });
    idp.directoryPeople = [ALICE, BOB].map((user) => idp.personOf(user));
    idp.flowPlugins = DECLARED;
    PORT = await freePortBlock([0, 1]);
    BASE = `http://127.0.0.1:${PORT}`;
    home = mkdtempSync(join(tmpdir(), "omb-org-flow-"));
    const data = join(home, ".sagax");
    mkdirSync(data, { recursive: true });
    mkdirSync(join(home, "link"), { recursive: true, mode: 0o750 });
    writeFileSync(join(home, "link", "pulsabot.json"), JSON.stringify({
      version: 1, issuer: idp.issuer, client_id: "pulsa-bot", server_id: idp.serverId, origin: BASE, link_token: idp.linkToken,
    }), { mode: 0o640 });
    // the organization's marketplace list admits neither declared source
    writeFileSync(join(data, "config.json"), JSON.stringify({ organization: { pluginMarketplaces: { mode: "list", allow: ["example/*"] } } }));
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
        SAGAX_ORG_NAME: "Acme",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (c) => (log += c));
    child.stderr!.on("data", (c) => (log += c));
    await waitFor(async () => {
      try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
    });
  }, 60_000);

  afterAll(async () => {
    child?.kill("SIGTERM");
    await waitForExit(child);
    await idp?.close();
    if (home) removeTempDir(home);
  });

  it("syncs from the directory, refuses what the marketplace list refuses, and empties when Perspicax turns it off", async () => {
    const alice = await signIn(ALICE);
    const on = await waitFor(async () => {
      const status = await flowStatus(alice);
      return status?.mode === "on" ? status : null;
    });
    expect(on.plugins).toEqual([
      { key: "pulsatrix-flow@pulsatrix", tenant: false, state: "not_allowed", error: "marketplace_not_allowed: the organization's marketplace list does not include pulsatrixtechnologies/marketplace" },
      { key: "pulsatrix-flow-acme@acme", tenant: true, state: "not_allowed", error: "marketplace_not_allowed: the organization's marketplace list does not include acme/marketplace" },
    ]);
    // a member reads the same status (names and reasons, never a token)
    const bob = await signIn(BOB);
    expect((await flowStatus(bob)).mode).toBe("on");

    idp.flowPlugins = { enabled: false, marketplaces: [], plugins: [] };
    const off = await waitFor(async () => {
      const status = await flowStatus(alice);
      return status?.mode === "off" ? status : null;
    });
    expect(off.plugins).toEqual([]);
  }, 60_000);
});
