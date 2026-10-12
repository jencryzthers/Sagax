import { describe, expect, it } from "vitest";

import {
  announceTopic,
  applyTopicEvent,
  callHasBackgroundWork,
  howToSpeakTopicResult,
  isNewVoiceTopic,
  isStopUtterance,
  openTopics,
  sourceUserId,
  topicLabel,
} from "./voice-topics";

describe("voice topics", () => {
  it("labels a request for the spoken update", () => {
    expect(topicLabel("  look up the weather in Montreal  ")).toBe("look up the weather in Montreal");
    expect(topicLabel("a".repeat(80)).length).toBeLessThanOrEqual(48);
  });

  it("stop words are not a new topic", () => {
    expect(isStopUtterance("stop")).toBe(true);
    expect(isStopUtterance("Arrête")).toBe(true);
    expect(isStopUtterance("cancel that")).toBe(true);
    expect(isNewVoiceTopic("stop")).toBe(false);
    expect(isNewVoiceTopic("no, the other one")).toBe(false);
  });

  it("an unrelated question is a new topic", () => {
    expect(isNewVoiceTopic("what about the weather")).toBe(true);
    expect(isNewVoiceTopic("what time is it in Tokyo")).toBe(true);
  });

  it("tracks active, background, done and announced topics", () => {
    let topics = applyTopicEvent([], { type: "start", id: "a", label: "weather" });
    topics = applyTopicEvent(topics, { type: "start", id: "b", label: "time" });
    topics = applyTopicEvent(topics, { type: "background", id: "a" });
    expect(openTopics(topics).map((t) => t.status)).toEqual(["background", "active"]);
    topics = applyTopicEvent(topics, { type: "done", id: "a" });
    topics = applyTopicEvent(topics, { type: "announced", id: "a" });
    expect(topics.find((t) => t.id === "a")?.status).toBe("announced");
    expect(openTopics(topics).map((t) => t.id)).toEqual(["b"]);
  });

  it("announces a finished background topic in a short spoken line", () => {
    expect(announceTopic("weather in Montreal", "It is 12 and sunny with a light wind from the west.")).toBe(
      "For weather in Montreal: It is 12 and sunny with a light wind from the west.",
    );
  });

  it("in-flight tools and running parallel cards are background work", () => {
    expect(callHasBackgroundWork([{ kind: "activity", tool: { name: "Bash" } }])).toBe(true);
    expect(callHasBackgroundWork([{ kind: "activity", tool: { name: "Bash", ok: true } }])).toBe(false);
    expect(callHasBackgroundWork([{ parallelTask: { role: "card", state: "running" } }])).toBe(true);
    expect(callHasBackgroundWork([{ kind: "text" }])).toBe(false);
  });

  it("a result for an older topic is announced; the latest is spoken in full", () => {
    expect(howToSpeakTopicResult({ replyUserId: "b", lastUserId: "b" })).toBe("full");
    expect(howToSpeakTopicResult({ replyUserId: "a", lastUserId: "b" })).toBe("announce");
    expect(howToSpeakTopicResult({ isParallelResult: true, replyUserId: "b", lastUserId: "b" })).toBe("full");
    expect(howToSpeakTopicResult({ isParallelResult: true, replyUserId: "a", lastUserId: "b" })).toBe("announce");
  });

  it("walks past a parallel request to the topic the call-thread reply belongs to", () => {
    const messages = [
      { id: "uA", role: "user", text: "look up the weather in Montreal" },
      { id: "uB", role: "user", text: "what time is it in Tokyo", parallelTask: { role: "request", requestMessageId: "uB" } },
      { id: "bA", role: "bot", kind: "text", text: "It is 12 in Montreal." },
    ];
    expect(sourceUserId(messages, 2, messages[2])).toBe("uA");
    expect(sourceUserId(messages, 1, {
      parallelTask: { requestMessageId: "uB" },
    })).toBe("uB");
  });
});
