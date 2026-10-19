// Pulsatrix Flow's default plugins for the organization's members
// (server/org-flow-plugins.ts), on the real plugin stores with a git runner
// that copies local repositories.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BotPluginError, type GitRunner, type MarketplacePolicy } from "./bot-plugins.ts";
import { ORG_FLOW_PLUGINS_KEY, OrgFlowPlugins, REFRESH_MS } from "./org-flow-plugins.ts";
import { directorySchema, type FlowPluginsDeclaration } from "./perspicax-link.ts";
import { PluginMarketplaces } from "./plugin-marketplaces.ts";
import { BotPlugins } from "./bot-plugins.ts";

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "sagax-org-flow-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, path: string, content: string) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A marketplace repository with one plugin carrying a skill and a hook. */
function marketplace(name: string, plugin: string, version: string): string {
  const repo = temp();
  write(repo, ".claude-plugin/marketplace.json", JSON.stringify({ name, plugins: [{ name: plugin, source: `./plugins/${plugin}`, version }] }));
  write(repo, `plugins/${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: plugin, version }));
  write(repo, `plugins/${plugin}/skills/entry/SKILL.md`, `---\nname: entry\ndescription: ${plugin} ${version}\n---\nBody`);
  write(repo, `plugins/${plugin}/hooks/hooks.json`, JSON.stringify({ hooks: {} }));
  return repo;
}

const PRODUCT_URL = "https://github.com/pulsatrixtechnologies/marketplace.git";
const TENANT_URL = "https://github.com/acme/marketplace.git";

function setup(options: { policy?: MarketplacePolicy } = {}) {
  const dataDir = temp();
  const repos: Record<string, string> = {
    [PRODUCT_URL]: marketplace("pulsatrix", "pulsatrix-flow", "0.18.0"),
    [TENANT_URL]: marketplace("acme", "pulsatrix-flow-acme", "0.1.0"),
  };
  const clones: string[] = [];
  const git: GitRunner = async (args) => {
    const url = args[args.indexOf("--") + 1]!;
    const into = args[args.indexOf("--") + 2]!;
    clones.push(url);
    const from = repos[url];
    if (!from) throw new BotPluginError("The repository could not be fetched.", "repository_unreadable", 422);
    cpSync(from, into, { recursive: true });
  };
  let policy = options.policy;
  const marketplaces = new PluginMarketplaces({ dataDir, git, gitEnvironment: () => ({}), policy: () => policy, inUse: (name) => plugins.botsUsing(name) });
  const plugins: BotPlugins = new BotPlugins({ dataDir, marketplaces, git, gitEnvironment: () => ({}), policy: () => policy });
  let declaration: FlowPluginsDeclaration | undefined;
  const members = new Set(["alice"]);
  let now = 1_000_000;
  const org = new OrgFlowPlugins({
    dataDir, plugins, marketplaces, policy: () => policy,
    declaration: () => declaration,
    isMember: (id) => members.has(id),
    now: () => now,
    log: () => undefined,
  });
  return {
    org, plugins, marketplaces, repos, clones, members,
    declare: (value: FlowPluginsDeclaration | undefined) => { declaration = value; },
    setPolicy: (value: MarketplacePolicy | undefined) => { policy = value; },
    advance: (ms: number) => { now += ms; },
  };
}

const PRODUCT = { name: "pulsatrix", source: "pulsatrixtechnologies/marketplace" };
const TENANT = { name: "acme", source: "acme/marketplace" };
const BOTH: FlowPluginsDeclaration = {
  enabled: true,
  marketplaces: [PRODUCT, TENANT],
  plugins: [
    { name: "pulsatrix-flow", marketplace: "pulsatrix", tenant: false },
    { name: "pulsatrix-flow-acme", marketplace: "acme", tenant: true },
  ],
};

describe("the directory's flow_plugins", () => {
  const base = { server_id: "srv", people: [], teams: [] };
  it("is read when Perspicax sends it, and absent or malformed reads as absent", () => {
    expect(directorySchema.parse({ ...base, flow_plugins: BOTH }).flow_plugins).toEqual(BOTH);
    expect(directorySchema.parse(base).flow_plugins).toBeUndefined();
    // an arbitrary source never passes: GitHub owner/repo only
    const url = { ...BOTH, marketplaces: [{ name: "x", source: "https://evil.example/repo" }] };
    expect(directorySchema.parse({ ...base, flow_plugins: url }).flow_plugins).toBeUndefined();
  });
});

describe("OrgFlowPlugins", () => {
  it("installs the product and the tenant once, for members' Claude turns only", async () => {
    const t = setup();
    t.declare(BOTH);
    const first = await t.org.sync("directory");
    expect(first).toEqual({
      mode: "on",
      syncedAt: 1_000_000,
      refreshedAt: 1_000_000,
      plugins: [
        { key: "pulsatrix-flow@pulsatrix", tenant: false, state: "installed", version: "0.18.0" },
        { key: "pulsatrix-flow-acme@acme", tenant: true, state: "installed", version: "0.1.0" },
      ],
    });
    expect(t.clones).toEqual([PRODUCT_URL, TENANT_URL]);
    const dirs = t.org.dirsFor("alice", []);
    expect(dirs.map((dir) => basename(dir))).toEqual(["pulsatrix-flow-acme", "pulsatrix-flow"]);
    // the host never gets a plugin's hooks
    for (const dir of dirs) expect(existsSync(join(dir, "hooks"))).toBe(false);
    expect(t.org.dirsFor("mallory", [])).toEqual([]);
    expect(t.org.dirsFor(undefined, [])).toEqual([]);

    // Idempotent: again (a profile added, the next poll) clones nothing and
    // installs nothing.
    const before = readdirSync(join(dirs[0]!, ".."));
    await t.org.sync("profile");
    await t.org.sync("directory");
    expect(t.clones).toEqual([PRODUCT_URL, TENANT_URL]);
    expect(readdirSync(join(dirs[0]!, ".."))).toEqual(before);
  });

  it("updates in place when the marketplace offers a new version, at most every REFRESH_MS", async () => {
    const t = setup();
    t.declare(BOTH);
    await t.org.sync("directory");
    t.repos[PRODUCT_URL] = marketplace("pulsatrix", "pulsatrix-flow", "0.19.0");
    await t.org.sync("schedule");
    expect(t.clones).toHaveLength(2);
    t.advance(REFRESH_MS);
    const after = await t.org.sync("schedule");
    expect(t.clones).toEqual([PRODUCT_URL, TENANT_URL, PRODUCT_URL, TENANT_URL]);
    expect(after.plugins[0]).toEqual({ key: "pulsatrix-flow@pulsatrix", tenant: false, state: "installed", version: "0.19.0" });
  });

  it("takes the plugins out when the admin turns the default off, and leaves bots' own plugins", async () => {
    const t = setup();
    t.declare(BOTH);
    await t.org.sync("directory");
    // a bot that has the product by hand keeps its copy, loaded once
    await t.plugins.install("bot-1", { marketplace: "pulsatrix", plugin: "pulsatrix-flow" }, "alice");
    const own = t.plugins.pluginDirs("bot-1");
    expect(t.org.dirsFor("alice", own).map((dir) => basename(dir))).toEqual(["pulsatrix-flow-acme"]);

    t.declare({ enabled: false, marketplaces: [], plugins: [] });
    expect(await t.org.sync("directory")).toEqual({ mode: "off", plugins: [], syncedAt: 1_000_000 });
    expect(t.plugins.listPlugins(ORG_FLOW_PLUGINS_KEY)).toEqual([]);
    expect(t.org.dirsFor("alice", own)).toEqual([]);
    expect(t.plugins.pluginDirs("bot-1")).toEqual(own);
  });

  it("drops a plugin no longer declared and keeps everything when Perspicax sends nothing", async () => {
    const t = setup();
    t.declare(BOTH);
    await t.org.sync("directory");
    t.declare({ ...BOTH, marketplaces: [PRODUCT], plugins: [BOTH.plugins[0]!] });
    await t.org.sync("directory");
    expect(t.plugins.listPlugins(ORG_FLOW_PLUGINS_KEY).map((plugin) => plugin.key)).toEqual(["pulsatrix-flow@pulsatrix"]);
    t.declare(undefined);
    expect(await t.org.sync("directory")).toEqual({ mode: "unknown", plugins: [], syncedAt: 1_000_000 });
    expect(t.plugins.listPlugins(ORG_FLOW_PLUGINS_KEY).map((plugin) => plugin.key)).toEqual(["pulsatrix-flow@pulsatrix"]);
  });

  it("never reaches past the organization's marketplace list", async () => {
    const t = setup({ policy: { mode: "list", allow: ["pulsatrixtechnologies/*"] } });
    t.declare(BOTH);
    const status = await t.org.sync("directory");
    expect(status.plugins).toEqual([
      { key: "pulsatrix-flow@pulsatrix", tenant: false, state: "installed", version: "0.18.0" },
      { key: "pulsatrix-flow-acme@acme", tenant: true, state: "not_allowed", error: "marketplace_not_allowed: the organization's marketplace list does not include acme/marketplace" },
    ]);
    expect(t.clones).toEqual([PRODUCT_URL]);
  });

  it("does not take another marketplace's name", async () => {
    const t = setup();
    t.repos["https://github.com/someone/else.git"] = marketplace("acme", "other", "1.0.0");
    await t.plugins.addWorkspaceMarketplace({ source: "someone/else" }, "alice");
    t.declare(BOTH);
    const status = await t.org.sync("directory");
    expect(status.plugins[1]).toEqual({ key: "pulsatrix-flow-acme@acme", tenant: true, state: "failed", error: "name_taken: a marketplace named acme comes from someone/else" });
  });

  it("gives a person who leaves the organization none of them", async () => {
    const t = setup();
    t.declare(BOTH);
    await t.org.sync("directory");
    expect(t.org.dirsFor("alice", [])).toHaveLength(2);
    t.members.delete("alice");
    expect(t.org.dirsFor("alice", [])).toEqual([]);
  });
});
