// @vitest-environment happy-dom
// A conversation with a person has threads like a bot (server/people-dms.ts):
// the same picker in the chat header or the same tree in the sidebar,
// according to Settings > Threads location, never both; the same row and
// folder menus; no generated title and no approval refresh.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Group } from "@/state/store";

const fixture = vi.hoisted(() => ({
  show: true,
  location: "header" as "header" | "sidebar",
  dispatch: vi.fn(),
  groups: [] as Group[],
}));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("@/lib/thread-preferences", async (original) => ({ ...await original<typeof import("@/lib/thread-preferences")>(),
  useShowThreads: () => fixture.show,
  useThreadsLocationChoice: () => fixture.location,
}));
vi.mock("@/state/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/state/store")>(),
  useStore: () => ({
    state: {
      bots: [], groups: fixture.groups, pendingQueued: {}, threadReturn: null, revealThread: null,
      activeView: "chat", selectedId: "dm", config: { viewer: { principalId: "pr_alice" } }, instances: [],
    },
    dispatch: fixture.dispatch,
  }),
}));

const { PersonThreadPicker } = await import("./TaskPicker");
const { GroupListItem, PersonThreadList } = await import("./Sidebar");

const person: Group = {
  id: "dm", threadId: "general", name: "Alice, Bob", memberIds: [], humanIds: ["pr_alice", "pr_bob"], peopleDm: true,
  defaultResponder: { kind: "mentions" }, bulletin: "", unread: true, createdAt: 1, messages: [],
  projects: [{ id: "f1", name: "Finance", emoji: "💼" }],
  tasks: [
    { threadId: "general", title: "General", general: true, createdAt: 1, updatedAt: 3, unread: false },
    { threadId: "budget", title: "Budget", createdAt: 2, updatedAt: 4, projectId: "f1", unread: true },
    { threadId: "old", title: "Old topic", createdAt: 0, updatedAt: 1, archivedAt: 5 },
  ],
};

let host: HTMLDivElement;
let root: Root;
const render = async (element: ReturnType<typeof createElement>) => { await act(async () => { root.render(element); }); };
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
  candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label);
const click = async (target: Element | undefined) => {
  expect(target, "control not found").toBeTruthy();
  await act(async () => { (target as HTMLElement).click(); });
};

beforeEach(() => {
  setLocale("en");
  fixture.show = true;
  fixture.location = "header";
  fixture.groups = [person];
  fixture.dispatch.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("threads location for a conversation with a person: one place at a time", () => {
  const row = () => renderToStaticMarkup(createElement(GroupListItem, { group: person, density: "comfortable", query: "bud", onMenu: () => undefined }));
  const header = () => renderToStaticMarkup(createElement(PersonThreadPicker, { group: person }));

  it("In the chat header: the thread button is there, nothing sits under the person's row", () => {
    expect(header()).toContain('aria-label="All threads"');
    expect(row()).not.toContain("data-sidebar-thread-row");
    expect(row()).not.toContain("data-sidebar-thread-list-actions");
  });

  it("In the sidebar: threads and folders under the row, no header button, no inline New thread / New folder", () => {
    fixture.location = "sidebar";
    expect(header()).toBe("");
    const rail = row();
    expect(rail).toContain('data-sidebar-thread-row="budget"');
    expect(rail).toContain('data-sidebar-project="f1"');
    expect(rail).not.toContain("data-sidebar-thread-list-actions");
    expect(rail).not.toContain(">New folder<");
  });

  it("Threads off: neither place, and a room or a bot chat never gets the person picker", () => {
    fixture.show = false;
    expect(header()).toBe("");
    expect(row()).not.toContain("data-sidebar-thread-row");
    fixture.show = true;
    expect(renderToStaticMarkup(createElement(PersonThreadPicker, { group: { ...person, peopleDm: false } }))).toBe("");
  });
});

describe("the header picker on a person", () => {
  it("lists the pair's threads in folders, General first in its own name, the open one checked", async () => {
    await render(createElement(PersonThreadPicker, { group: person, initialOpen: true }));
    const text = host.textContent ?? "";
    expect(text).toContain("General");
    expect(text).toContain("Budget");
    expect(text).toContain("Finance");
    expect(host.querySelector('[data-picker-folder="f1"]')).not.toBeNull();
    // the folder of a row: the same Move control as a bot's
    const move = host.querySelector<HTMLSelectElement>('select[aria-label="Move Budget to folder"]')!;
    expect([...move.options].map((option) => option.textContent)).toEqual(["No folder", "💼 Finance"]);
  });

  it("switches, pins, files, deletes and creates through the person conversation's own actions", async () => {
    await render(createElement(PersonThreadPicker, { group: person, initialOpen: true }));
    await click([...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Budget")));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "switchGroupTask", groupId: "dm", threadId: "budget" });
    await click(host.querySelectorAll('button[aria-label="Pin"]')[0]);
    expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "updateGroupTask", groupId: "dm", patch: { pinned: true } }));
    const move = host.querySelector<HTMLSelectElement>('select[aria-label="Move Budget to folder"]')!;
    await act(async () => { move.value = ""; move.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateGroupTask", groupId: "dm", threadId: "budget", patch: { projectId: null } });
    await click(host.querySelectorAll('button[aria-label="Delete thread"]')[0]);
    expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "deleteGroupTask", groupId: "dm" }));
    await click(button("New thread"));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "newGroupTask", groupId: "dm" });
  });

  it("the row's ... menu: copy link, archive and snooze, never a generated title or an approval refresh", async () => {
    await render(createElement(PersonThreadPicker, { group: person, initialOpen: true }));
    await click(button("Actions for Budget"));
    const panel = host.querySelector('[data-picker-thread-actions="budget"]')!;
    expect(panel.textContent).toContain("Archive");
    expect(panel.textContent).toContain("Until new activity");
    expect(panel.textContent).not.toContain("Regenerate");
    expect(panel.textContent).not.toContain("permissions");
    await click([...panel.querySelectorAll("button")].find((candidate) => candidate.textContent === "Archive"));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateGroupTask", groupId: "dm", threadId: "budget", patch: { archivedAt: expect.any(Number) } });
    await click(button("Actions for Budget"));
    const again = host.querySelector('[data-picker-thread-actions="budget"]')!;
    await click([...again.querySelectorAll("button")].find((candidate) => candidate.textContent === "Until new activity"));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateGroupTask", groupId: "dm", threadId: "budget", patch: { snoozedUntil: 0 } });
  });
});

describe("the sidebar tree on a person", () => {
  it("lists folders and chats straight, with no My conversations or Threads heading", async () => {
    fixture.location = "sidebar";
    await render(createElement(PersonThreadList, { group: person, name: "Bob", selected: true }));
    const text = host.textContent ?? "";
    expect(text).toContain("Finance");
    expect(text).toContain("General");
    expect(text).not.toContain("Budget");
    expect(text).not.toContain("My conversations");
    expect(text).not.toContain("No threads yet");
    expect(host.querySelector("[data-sidebar-my-threads]")).toBeNull();
    expect([...host.querySelectorAll("div")].some((node) => node.textContent === "Threads" && node.children.length === 0)).toBe(false);
    expect(host.querySelector('[data-sidebar-thread-row="general"]')?.parentElement?.getAttribute("draggable")).toBe("true");
    expect(host.querySelector('[data-sidebar-folder-row="f1"] button[aria-expanded="false"]')).not.toBeNull();
    await click(button("Expand Finance threads"));
    expect(host.querySelector('[data-sidebar-thread-row="budget"]')).not.toBeNull();
  });

  it("files a chat into a folder and back out by dropping", async () => {
    fixture.location = "sidebar";
    await render(createElement(PersonThreadList, { group: person, name: "Bob", selected: true }));
    const transfer = (threadId: string) => {
      const payload = JSON.stringify({ ownerId: "dm", threadId });
      return {
        types: ["application/x-openmausbot-thread"],
        dropEffect: "move",
        effectAllowed: "move",
        getData: (type: string) => type === "application/x-openmausbot-thread" ? payload : "",
        setData: () => undefined,
      };
    };
    const fire = (el: Element, type: string, data: ReturnType<typeof transfer>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: data });
      el.dispatchEvent(event);
    };
    const folder = host.querySelector('[data-sidebar-folder-row="f1"]')!;
    await act(async () => {
      fire(folder, "dragover", transfer("general"));
      fire(folder, "drop", transfer("general"));
    });
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateGroupTask", groupId: "dm", threadId: "general", patch: { projectId: "f1" } });
    const list = host.querySelector('[aria-label="Bob threads"]')!;
    await act(async () => {
      fire(list, "dragover", transfer("budget"));
      fire(list, "drop", transfer("budget"));
    });
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateGroupTask", groupId: "dm", threadId: "budget", patch: { projectId: null } });
  });

  it("creates a thread in a folder and a folder from the list and folder context menus", async () => {
    fixture.location = "sidebar";
    await render(createElement(PersonThreadList, { group: person, name: "Bob", selected: true }));
    const list = host.querySelector('[aria-label="Bob threads"]');
    expect(list).not.toBeNull();
    await act(async () => {
      list!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    });
    const listMenu = document.body.querySelector("[data-sidebar-thread-list-actions]");
    expect(listMenu).not.toBeNull();
    await click([...listMenu!.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "New thread"));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "newGroupTask", groupId: "dm" });
    await click(button("New thread in Finance"));
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "newGroupTask", groupId: "dm", projectId: "f1" });
    await act(async () => {
      list!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 40 }));
    });
    const again = document.body.querySelector("[data-sidebar-thread-list-actions]");
    await click([...again!.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "New folder"));
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
