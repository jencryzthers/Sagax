// @vitest-environment happy-dom
// The bot pane's browser tab behaves like the VM tab: an idle card, no live
// stream, until Take control opens the full-screen window; leaving full
// screen or closing the window ends the connection.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";

vi.mock("@/state/store", () => ({ api: vi.fn().mockResolvedValue({ scopes: ["admin"] }), useStore: () => ({ state: { config: { browserProfiles: [], browserEngine: { kind: "engine" } } } }) }));
vi.mock("./BrowserProfilesManager", () => ({ BrowserProfilesManager: () => null }));
import { BrowserIdleCard, BrowserPanel } from "./BrowserPanel";

class FakeSource {
  static all: FakeSource[] = [];
  closed = false;
  constructor(public url: string) { FakeSource.all.push(this); }
  addEventListener() {}
  close() { this.closed = true; }
}

const bot = { id: "cryptic", name: "Cryptic", browserProfile: "own" } as unknown as Bot;
let host: HTMLDivElement;
let root: Root;
let fullscreenElement: Element | null = null;
const setFullscreen = (element: Element | null) => { fullscreenElement = element; document.dispatchEvent(new Event("fullscreenchange")); };

beforeEach(() => {
  FakeSource.all = [];
  fullscreenElement = null;
  vi.stubGlobal("EventSource", FakeSource);
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  document.exitFullscreen = vi.fn(async () => { fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); });
  HTMLElement.prototype.requestFullscreen = vi.fn(async function (this: HTMLElement) { setFullscreen(this); });
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const takeControl = () => act(async () => { (document.querySelector("[data-take-control]") as HTMLButtonElement).click(); });

describe("browser tab: take control opens full screen", () => {
  it("idle: a card with Take control, no stream and no connection error", async () => {
    await act(async () => root.render(createElement(BrowserPanel, { bot })));
    expect(document.querySelector("[data-browser-idle]")).not.toBeNull();
    expect(document.querySelector("[data-take-control]")?.textContent).toContain("Take control");
    expect(FakeSource.all).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Connecting|Connection interrupted|Browser connection ended/);
  });

  it("take control opens the full-screen window and only then connects", async () => {
    await act(async () => root.render(createElement(BrowserIdleCard, { bot })));
    await takeControl();
    expect(document.querySelector("[data-browser-takeover]")).not.toBeNull();
    expect(fullscreenElement?.getAttribute("role")).toBe("dialog");
    expect(FakeSource.all.map((source) => source.url)).toEqual(["/api/bots/cryptic/browser/live"]);
  });

  it("leaving full screen closes the window and the connection", async () => {
    await act(async () => root.render(createElement(BrowserIdleCard, { bot })));
    await takeControl();
    await act(async () => { await document.exitFullscreen(); });
    expect(document.querySelector("[data-browser-takeover]")).toBeNull();
    expect(FakeSource.all[0].closed).toBe(true);
    expect(document.querySelector("[data-browser-idle]")).not.toBeNull();
  });

  it("the close button ends the connection and leaves full screen", async () => {
    await act(async () => root.render(createElement(BrowserIdleCard, { bot })));
    await takeControl();
    await act(async () => { (document.querySelector("[data-takeover-close]") as HTMLButtonElement).click(); });
    expect(FakeSource.all[0].closed).toBe(true);
    expect(fullscreenElement).toBeNull();
  });
});
