import { describe, expect, it } from "vitest";

import {
  cancelToolFiller,
  createToolFillerState,
  isSpokenFiller,
  noteToolFillerPlayed,
  resetToolFiller,
  shouldPlayToolFiller,
  shouldSkipToolChip,
  toolFillerLanguage,
  toolFillerText,
} from "./tool-filler";

describe("tool filler copy", () => {
  it("speaks words in the call language, never a tone", () => {
    expect(toolFillerText("en")).toBe("Let me look.");
    expect(toolFillerText("fr")).toBe("Je regarde.");
    expect(toolFillerText("fr-CA")).toBe("Je regarde.");
    expect(toolFillerText("pt")).toBe("Deixa eu ver.");
    expect(toolFillerText("pt-BR")).toBe("Deixa eu ver.");
    expect(toolFillerText("auto")).toBe("Let me look.");
    expect(isSpokenFiller(toolFillerText("fr"))).toBe(true);
    expect(isSpokenFiller("")).toBe(false);
    expect(isSpokenFiller("\u0007")).toBe(false);
  });

  it("uses the voice language, then the UI locale, then English", () => {
    expect(toolFillerLanguage("fr", "en")).toBe("fr");
    expect(toolFillerLanguage("auto", "pt-br")).toBe("pt-br");
    expect(toolFillerLanguage(undefined, undefined)).toBe("en");
  });
});

describe("when to play", () => {
  it("plays on the first tool of a thinking turn, even when the model said nothing", () => {
    const idle = createToolFillerState();
    expect(shouldPlayToolFiller(idle, { thinking: true, toolStarted: true })).toBe(true);
    expect(shouldPlayToolFiller(idle, { thinking: true, toolStarted: false })).toBe(false);
    expect(shouldPlayToolFiller(idle, { thinking: false, toolStarted: true })).toBe(false);
    const played = noteToolFillerPlayed(idle);
    expect(shouldPlayToolFiller(played, { thinking: true, toolStarted: true })).toBe(false);
    expect(shouldSkipToolChip(played)).toBe(true);
    expect(shouldSkipToolChip(idle)).toBe(false);
  });

  it("barge-in cancels the filler; a new turn can play again", () => {
    const cut = cancelToolFiller(noteToolFillerPlayed(createToolFillerState()));
    expect(shouldPlayToolFiller(cut, { thinking: true, toolStarted: true })).toBe(false);
    const next = resetToolFiller(cut);
    expect(shouldPlayToolFiller(next, { thinking: true, toolStarted: true })).toBe(true);
    expect(shouldSkipToolChip(next)).toBe(false);
  });
});
