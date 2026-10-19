// Pulsatrix Flow's Claude Code plugins for every member of the organization
// (2026-10-18, JC: « le plugin pulsatrix-flow est installé de base dès que tu
// ajoutes un profil Perspicax, ou même dès que tu es dans l'organisation »).
//
// Perspicax declares them in the directory (`flow_plugins`, its
// model/flow_plugins.rs): the product `pulsatrix-flow@pulsatrix`
// (pulsatrixtechnologies/marketplace) and, when the organization has one, its
// tenant plugin (`pulsatrix-flow-<tenant>@<marketplace>`, a GitHub owner/repo).
// The organization admin turns the default off in Perspicax
// (`flow_plugins_default` = off): the declaration then comes empty and the
// plugins installed here are taken out.
//
// Rules:
//   - One copy for the organization, installed through the bot plugin store
//     under a reserved key (ORG_FLOW_PLUGINS_KEY, never a bot id): the same
//     sanitized copy as "For this bot" (no hooks, MCP, LSP or bin on the
//     host), loaded with `--plugin-dir` on every Claude turn of a bot whose
//     owner is an active member. Nothing is installed per turn.
//   - Membership is the trigger: the directory (first link, an invitation
//     accepted, the next poll for an existing member) and a Perspicax profile
//     added to a bot both call `sync`, which is idempotent (one change at a
//     time, nothing done when the declaration and the copies agree).
//   - A newer version: the marketplaces are fetched again at most every
//     REFRESH_MS (or at once when the declaration changes), and a plugin
//     whose marketplace offers another version or other files is installed
//     again in place.
//   - Sources: only the marketplaces Perspicax declares, each a GitHub
//     owner/repo, and only when the organization's marketplace policy
//     (Connect apps > Manage) allows it; a refused one is reported, never
//     widened. Private repositories are read with the installation's token
//     or the organization's GitHub tokens, as any Everyone-scope marketplace.
//   - A person who leaves the organization (disabled or no longer listed)
//     gets none of these plugins on their bots. A plugin someone installed
//     by hand on a bot ("For this bot") is never touched, and a bot that has
//     the same plugin by hand loads its own copy only.
//   - Claude only: every other engine reaches Flow through the Perspicax
//     profiles of the turn (`flow`, `flow_action`, served by Perspicax from
//     the signed pack), with no plugin system to load this into.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

import { writeFileAtomic } from "./atomic.ts";
import { BotPluginError, marketplaceAllowed, parseGitSource, type BotPlugins, type MarketplacePolicy } from "./bot-plugins.ts";
import type { FlowPluginsDeclaration } from "./perspicax-link.ts";
import type { PluginMarketplaces } from "./plugin-marketplaces.ts";

/** The plugin store key of the organization's copy (a bot id is a random id, never this). */
export const ORG_FLOW_PLUGINS_KEY = "_org-flow-plugins";
/** How often the declared marketplaces are fetched again for a new version. */
export const REFRESH_MS = 6 * 60 * 60 * 1000;

export type OrgFlowPluginState = "installed" | "not_allowed" | "failed" | "pending";

export interface OrgFlowPluginStatus {
  key: string;
  tenant: boolean;
  state: OrgFlowPluginState;
  version?: string;
  /** A short reason, never a token. */
  error?: string;
}

export interface OrgFlowPluginsStatus {
  /** unknown: Perspicax sent no declaration (an older Perspicax, or before
   * the first directory); off: the admin turned it off. */
  mode: "unknown" | "off" | "on";
  plugins: OrgFlowPluginStatus[];
  syncedAt?: number;
  refreshedAt?: number;
}

const savedSchema = z.object({
  version: z.literal(1),
  /** digest of the declaration last applied */
  declaration: z.string().optional(),
  refreshedAt: z.number().optional(),
}).strict();
type Saved = z.infer<typeof savedSchema>;

export interface OrgFlowPluginsOptions {
  dataDir: string;
  plugins: BotPlugins;
  marketplaces: PluginMarketplaces;
  policy: () => MarketplacePolicy | undefined;
  /** The last directory's declaration; undefined when it sent none. */
  declaration: () => FlowPluginsDeclaration | undefined;
  /** Whether this principal is an active member of the organization now. */
  isMember: (principalId: string) => boolean;
  now?: () => number;
  log?: (line: string) => void;
}

function digest(declaration: FlowPluginsDeclaration): string {
  return createHash("sha256").update(JSON.stringify(declaration)).digest("hex").slice(0, 32);
}

function short(error: unknown): string {
  const text = error instanceof BotPluginError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

export class OrgFlowPlugins {
  private readonly options: OrgFlowPluginsOptions;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private lock: Promise<unknown> = Promise.resolve();
  private current: OrgFlowPluginsStatus = { mode: "unknown", plugins: [] };

  constructor(options: OrgFlowPluginsOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line) => console.log(line));
  }

  private get file(): string {
    return join(this.options.dataDir, "org-flow-plugins.json");
  }

  private read(): Saved {
    try {
      return savedSchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return { version: 1 };
    }
  }

  private write(saved: Saved): void {
    writeFileAtomic(this.file, JSON.stringify(savedSchema.parse(saved), null, 2));
  }

  status(): OrgFlowPluginsStatus {
    return structuredClone(this.current);
  }

  /** Bring the organization's copy in line with the declaration. Idempotent
   * and serialized; `force` fetches the marketplaces again now. */
  sync(reason: string, options: { force?: boolean } = {}): Promise<OrgFlowPluginsStatus> {
    const next = this.lock.catch(() => undefined).then(() => this.apply(reason, options.force === true));
    this.lock = next.catch(() => undefined);
    return next;
  }

  private installed(): Map<string, { version?: string }> {
    return new Map(this.options.plugins.listPlugins(ORG_FLOW_PLUGINS_KEY).map((plugin) => [plugin.key, plugin.version ? { version: plugin.version } : {}]));
  }

  private async removeAll(keep: ReadonlySet<string>): Promise<void> {
    for (const key of this.installed().keys()) {
      if (keep.has(key)) continue;
      await this.options.plugins.uninstall(ORG_FLOW_PLUGINS_KEY, key);
      this.log(`[org-flow-plugins] ${key} taken out (no longer declared)`);
    }
  }

  private async apply(reason: string, force: boolean): Promise<OrgFlowPluginsStatus> {
    const declaration = this.options.declaration();
    const saved = this.read();
    const now = this.now();
    if (!declaration) {
      // An older Perspicax, or no directory yet: leave what is there.
      this.current = { mode: "unknown", plugins: [], syncedAt: now };
      return this.status();
    }
    if (!declaration.enabled || declaration.plugins.length === 0) {
      await this.removeAll(new Set());
      this.write({ version: 1, declaration: digest(declaration) });
      this.current = { mode: "off", plugins: [], syncedAt: now };
      return this.status();
    }
    const changed = saved.declaration !== digest(declaration);
    const refresh = force || changed || saved.refreshedAt === undefined || now - saved.refreshedAt >= REFRESH_MS;
    const policy = this.options.policy();
    const local = new Map<string, string>();
    const refused = new Map<string, string>();
    for (const market of declaration.marketplaces) {
      try {
        const source = parseGitSource(market.source);
        if (!marketplaceAllowed(policy, source)) {
          refused.set(market.name, `marketplace_not_allowed: the organization's marketplace list does not include ${source.id}`);
          continue;
        }
        const listed = this.options.marketplaces.list();
        const same = listed.find((view) => view.source === source.id);
        const taken = listed.find((view) => view.name === market.name);
        if (!same && taken) {
          refused.set(market.name, `name_taken: a marketplace named ${market.name} comes from ${taken.source}`);
          continue;
        }
        if (!same) {
          const added = await this.options.plugins.addWorkspaceMarketplace({ source: source.id }, undefined);
          local.set(market.name, added.name);
          this.log(`[org-flow-plugins] marketplace ${source.id} added (${reason})`);
        } else {
          if (refresh) await this.options.plugins.refreshWorkspaceMarketplace(same.name, undefined);
          local.set(market.name, same.name);
        }
      } catch (error) {
        refused.set(market.name, short(error));
      }
    }
    const statuses: OrgFlowPluginStatus[] = [];
    const keep = new Set<string>();
    for (const plugin of declaration.plugins) {
      const market = local.get(plugin.marketplace);
      const key = `${plugin.name}@${market ?? plugin.marketplace}`;
      if (!market) {
        const error = refused.get(plugin.marketplace) ?? "the marketplace is not declared";
        const state: OrgFlowPluginState = error.startsWith("marketplace_not_allowed") ? "not_allowed" : "failed";
        // a copy already there stays while its marketplace cannot be read
        if (state === "failed" && this.installed().has(key)) keep.add(key);
        statuses.push({ key, tenant: plugin.tenant, state, error });
        continue;
      }
      keep.add(key);
      try {
        const offered = this.options.plugins.listMarketplaces(ORG_FLOW_PLUGINS_KEY)
          .find((view) => view.name === market)?.plugins.find((entry) => entry.name === plugin.name);
        if (!offered) throw new BotPluginError("That plugin is not in this marketplace.", "not_found", 404);
        const have = this.installed().get(key);
        if (!have || offered.updateAvailable) {
          const result = await this.options.plugins.install(ORG_FLOW_PLUGINS_KEY, { marketplace: market, plugin: plugin.name }, undefined);
          this.log(`[org-flow-plugins] ${key} ${have ? "updated" : "installed"}${result.version ? ` (${result.version})` : ""} (${reason})`);
        }
        const after = this.installed().get(key);
        statuses.push({ key, tenant: plugin.tenant, state: "installed", ...(after?.version ? { version: after.version } : {}) });
      } catch (error) {
        statuses.push({ key, tenant: plugin.tenant, state: "failed", error: short(error) });
      }
    }
    await this.removeAll(keep);
    const refreshedAt = refresh ? now : saved.refreshedAt;
    this.write({ version: 1, declaration: digest(declaration), ...(refreshedAt !== undefined ? { refreshedAt } : {}) });
    this.current = { mode: "on", plugins: statuses, syncedAt: now, ...(refreshedAt !== undefined ? { refreshedAt } : {}) };
    return this.status();
  }

  /** The organization's plugin folders for a Claude turn of a bot owned by
   * `owner`, after the bot's own (`own`, loaded first): none for a person
   * who is not an active member, and none whose plugin the bot already has. */
  dirsFor(owner: string | undefined, own: readonly string[]): string[] {
    if (!owner || !this.options.isMember(owner)) return [];
    const mode = this.current.mode;
    if (mode === "off") return [];
    const declaration = this.options.declaration();
    if (declaration && (!declaration.enabled || declaration.plugins.length === 0)) return [];
    const ownNames = new Set(own.map((dir) => basename(dir)));
    const dirs: string[] = [];
    for (const dir of this.options.plugins.pluginDirs(ORG_FLOW_PLUGINS_KEY)) {
      if (ownNames.has(basename(dir))) continue;
      if (existsSync(dir)) dirs.push(dir);
    }
    return dirs;
  }
}
