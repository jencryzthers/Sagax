import { describe, expect, it } from "vitest";
import { REWARD_REGISTRY, rewardKey, rewardLineVisible, type AchievementReward } from "./achievements.ts";

describe("reward keys for crab items", () => {
  it("names emote, move, accessory and effect the same way the store will store them", () => {
    expect(rewardKey({ kind: "emote", character: "crab", id: "neutral" })).toBe("emote:crab:neutral");
    expect(rewardKey({ kind: "move", character: "crab", id: "claw-dance" })).toBe("move:crab:claw-dance");
    expect(rewardKey({ kind: "accessory", id: "captain" })).toBe("accessory:captain");
    expect(rewardKey({ kind: "effect", id: "fireworks" })).toBe("effect:fireworks");
    expect(rewardKey({ kind: "character", character: "crab" })).toBe("character:crab");
  });

  it("hides a reward line until the registry can draw it", () => {
    expect(REWARD_REGISTRY.emotes.crab).toEqual(["neutral", "happy", "curious", "sleepy"]);
    expect(rewardLineVisible({ kind: "emote", character: "crab", id: "neutral" })).toBe(true);
    expect(rewardLineVisible({ kind: "emote", character: "crab", id: "proud" })).toBe(false);
    expect(rewardLineVisible({ kind: "move", character: "crab", id: "claw-dance" })).toBe(false);
    expect(rewardLineVisible({ kind: "accessory", id: "captain" })).toBe(false);
    expect(rewardLineVisible({ kind: "effect", id: "bubbles" })).toBe(false);
    expect(rewardLineVisible({ kind: "character", character: "crab" })).toBe(true);
    expect(rewardLineVisible({ kind: "skin", character: "crab", skin: "pearl" })).toBe(true);
    expect(rewardLineVisible({ kind: "title", id: "rookie", name: { en: "Rookie", fr: "Recrue" } })).toBe(true);
    expect(rewardLineVisible({ kind: "appIcon", id: "glyph:cube" })).toBe(true);
  });
});
