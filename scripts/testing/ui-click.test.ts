import { describe, expect, it } from "vitest";
import { clickByAccessibleNameJs, openProfileAria, overlaysOpenJs } from "./ui-click.ts";

describe("renderer e2e click helpers", () => {
  it("uses the possessive profile aria from chat.openProfileAria", () => {
    expect(openProfileAria("Quill")).toBe("Open Quill's profile");
    expect(openProfileAria("Quill")).not.toBe("Open Quill profile");
  });

  it("embeds the accessible name in a DOM click that bypasses hit-testing", () => {
    const source = clickByAccessibleNameJs("Open Quill's profile");
    expect(source).toContain("Open Quill's profile");
    expect(source).toContain(".click()");
    expect(source).toContain("aria-label");
  });

  it("treats the bot catalog modal as an overlay that covers the sidebar", () => {
    expect(overlaysOpenJs()).toContain("data-bot-catalog-modal");
    expect(overlaysOpenJs()).toContain("[role=dialog]");
  });
});
