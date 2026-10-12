import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ApnsSender, type ApnsTransport } from "./apns.ts";
import type { ApnsConfig } from "./config.ts";

const keyPem = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = { configured: true, keyPem, keyId: "KEY1234567", teamId: "TEAM123456", topic: "ca.pulsatrix.sagax" } as unknown as ApnsConfig;
const device = { token: "a".repeat(64), environment: "production" as const };
const request = { headers: { "apns-topic": "ca.pulsatrix.sagax" }, body: "{}" } as never;

describe("ApnsSender over a session the network dropped", () => {
  it("retries once on a fresh session and delivers", async () => {
    let calls = 0;
    const transport: ApnsTransport = async () => {
      calls += 1;
      if (calls === 1) throw new Error("APNs closed the request without an answer");
      return { status: 200 };
    };
    const warnings: string[] = [];
    const sender = new ApnsSender({ config, transport, log: { info: () => {}, warn: (line) => warnings.push(line) } });
    await expect(sender.send(device, request)).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(warnings).toEqual([]);
  });

  it("gives up after the one retry (no loop) and never prunes the token", async () => {
    let calls = 0;
    const transport: ApnsTransport = async () => { calls += 1; throw new Error("down"); };
    const sender = new ApnsSender({ config, transport, log: { info: () => {}, warn: () => {} } });
    await expect(sender.send(device, request)).resolves.toMatchObject({ ok: false, reason: "unreachable", prune: false });
    expect(calls).toBe(2);
  });
});
