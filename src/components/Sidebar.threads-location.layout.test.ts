import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, type Bot } from "@/state/store";

const prefs = vi.hoisted(() => ({ show: true, location: "header" as "header" | "sidebar" }));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("@/lib/thread-preferences", async (original) => ({ ...await original<typeof import("@/lib/thread-preferences")>(),
  useShowThreads: () => prefs.show,
  useThreadsLocationChoice: () => prefs.location,
}));
import { BotListItem, BotThreadList } from "./Sidebar";
import { TaskPicker } from "./TaskPicker";

const bot: Bot = {
  id: "atlas", threadId: "current", name: "Atlas", title: "", description: "",
  notifications: true, color: "green", unread: false, modelSelection: { instanceId: "claude", model: "test" },
  messages: [{ id: "reply", role: "bot", kind: "text", text: "The latest reply", at: 1 }],
  projects: [{ id: "p1", name: "Research" }],
  tasks: [
    { threadId: "current", title: "Current", createdAt: 1 },
    { threadId: "older", title: "Earlier work", createdAt: 0, projectId: "p1" },
  ],
};

// The query opens the list on first render, so the static markup shows what an
// unfolded bot row holds in each mode.
const sidebar = () => renderToStaticMarkup(createElement(StoreProvider, null,
  createElement(BotListItem, { bot, density: "comfortable", query: "earl", onMenu: () => undefined })));
const header = () => renderToStaticMarkup(createElement(StoreProvider, null, createElement(TaskPicker, { bot })));

beforeEach(() => { prefs.show = true; prefs.location = "header"; });

describe("threads location: one place at a time", () => {
  it("In the chat header: the header button is there and the sidebar lists nothing under the bot", () => {
    prefs.location = "header";
    const rail = sidebar();
    expect(rail).toContain('data-sidebar-bot-row="atlas"');
    expect(rail).not.toContain("data-sidebar-thread-row");
    expect(rail).not.toContain("data-sidebar-project");
    expect(rail).not.toContain("data-sidebar-thread-list-actions");
    expect(rail).not.toContain("Expand Atlas threads");
    expect(rail).not.toContain("Collapse Atlas threads");
    expect(header()).toContain('aria-label="All threads"');
  });

  it("In the sidebar: threads and folders sit under the bot; New thread / New folder are not inline", () => {
    prefs.location = "sidebar";
    const rail = sidebar();
    expect(rail).toContain('aria-label="Atlas threads"');
    expect(rail).toContain('data-sidebar-thread-row="older"');
    expect(rail).toContain('data-sidebar-project="p1"');
    expect(rail).toContain("Collapse Atlas threads");
    expect(rail).not.toContain("data-sidebar-thread-list-actions");
    expect(rail).not.toContain(">New thread<");
    expect(rail).not.toContain(">New folder<");
    const row = rail.match(/<div[^>]*data-sidebar-bot-row="atlas"[\s\S]*?<\/div><\/div>/)?.[0] ?? "";
    expect(row).not.toContain('aria-label="New thread"');
    expect(header()).toBe("");
  });

  it("lists folders and chats straight, with no My conversations or Threads heading", () => {
    prefs.location = "sidebar";
    const html = renderToStaticMarkup(createElement(StoreProvider, null, createElement(BotThreadList, { bot, selected: true })));
    expect(html).toContain('data-sidebar-project="p1"');
    expect(html).toContain('data-sidebar-thread-row="current"');
    expect(html).not.toContain('data-sidebar-thread-row="older"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-sidebar-my-threads");
    expect(html).not.toContain("My conversations");
    expect(html).not.toMatch(/>Threads</);
    expect(html).not.toContain("No threads yet");
    expect(html).toContain('draggable="true"');
  });

  it("With threads off neither place shows threads", () => {
    prefs.show = false;
    for (const location of ["header", "sidebar"] as const) {
      prefs.location = location;
      expect(sidebar()).not.toContain("data-sidebar-thread-row");
      expect(header()).toBe("");
    }
  });
});
