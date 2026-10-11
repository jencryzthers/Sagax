import { describe, expect, it } from "vitest";

import { discardSpeculation, maySpeculate } from "./speculative";

describe("maySpeculate", () => {
  it("starts the LLM on four stable words, even without end-of-turn punctuation", () => {
    expect(maySpeculate("What is the weather")).toBe(true);
    expect(maySpeculate("Quelle heure est il")).toBe(true);
  });

  it("waits when the partial is short or still an unfinished clause", () => {
    expect(maySpeculate("What is")).toBe(false);
    expect(maySpeculate("What is the")).toBe(false);
    expect(maySpeculate("give me a good prompt to")).toBe(false);
    expect(maySpeculate("")).toBe(false);
  });
});

describe("discardSpeculation", () => {
  it("keeps the in-flight send when the next partial is the same question", () => {
    expect(discardSpeculation("What is the weather", "what is the weather?")).toBe(false);
  });

  it("cancels when the person keeps talking and the words change", () => {
    expect(discardSpeculation("What is the weather", "What is the weather in Toronto")).toBe(true);
    expect(discardSpeculation("call Max about", "call Sam about")).toBe(true);
  });
});
