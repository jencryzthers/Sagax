// Crab, the pixel-rect mascot: only axis-aligned rectangles, a coral fill
// and two black square eyes, two stub arms and four legs. Free with the owl.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { APP_ICON_CHOICES } from "@/lib/app-icon-choices";
import { BotAvatar } from "@/components/Avatar";
import { DEFAULT_CHARACTERS, skinTier } from "../../shared/achievements";
import { MASCOT_COLOR_HEX } from "../../shared/mascot-colors";
import {
  botMascotLook,
  CHARACTER_PAINT,
  completeMascotLook,
  CRAB_DEFAULT_COLOR,
  CRAB_SKIN_TIER,
  CRAB_SKINS,
  LEGACY_CRAB_SKINS,
  mascotLookSchema,
} from "../../shared/mascot-look";
import { MASCOTS, mascotFor } from "./floating-bots/mascots";
import { CHARACTER_LABEL, CRAB_SKIN_LABEL } from "./floating-bots/MascotLookEditor";
import { colorGroupsFor } from "./floating-bots/editor-tabs";
import { CrabMascot, crabExpressionForMood, crabHexOf } from "./CrabMascot";
import { crabSkinId, crabSkinPaint } from "./skin-fx/crab-skins";
import {
  CRAB_BUST_MAX,
  CRAB_CORAL,
  CRAB_GRID,
  CRAB_INK,
  CRAB_OX,
  CRAB_OY,
  CRAB_PARTS,
  CRAB_PX,
  crabFill,
  crabViewBox,
} from "./crab-art";

const draw = (props: Partial<Parameters<typeof CrabMascot>[0]> = {}) =>
  renderToStaticMarkup(createElement(CrabMascot, { color: "orange", ...props }));

describe("Crab's art", () => {
  it("sits on a 15-cell pixel grid mapped into the 0..100 box", () => {
    expect(CRAB_PX).toBe(6);
    expect(CRAB_GRID).toBe(15);
    expect(CRAB_OX).toBe(5);
    expect(CRAB_OY).toBe(10);
    expect(CRAB_PARTS.body).toEqual({ x: 17, y: 46, w: 66, h: 42 });
    expect(CRAB_PARTS.legs).toHaveLength(4);
    expect(CRAB_PARTS.eyeL.w).toBe(CRAB_PX);
    expect(CRAB_PARTS.eyeR.h).toBe(CRAB_PX * 2);
  });

  it("crops to the bust under 48 px", () => {
    expect(crabViewBox(32)).toBe("4 40 92 58");
    expect(crabViewBox(CRAB_BUST_MAX)).toBe("4 40 92 58");
    expect(crabViewBox(49)).toBe("0 0 100 100");
  });

  it("tints the coral with the bot colour on Plain, and stays a crab", () => {
    expect(crabFill(CRAB_CORAL, 0).toLowerCase()).toBe(CRAB_CORAL.toLowerCase());
    expect(crabFill("#377FE6", 0.45).toLowerCase()).not.toBe(CRAB_CORAL.toLowerCase());
    expect(crabFill("#377FE6", 0.45).toLowerCase()).not.toBe("#377fe6");
    expect(crabHexOf("orange")).toBe(MASCOT_COLOR_HEX.orange);
    expect(crabHexOf("#DD775B")).toBe("#DD775B");
    expect(crabHexOf("not-a-color")).toBe(CRAB_CORAL);
  });
});

describe("Crab's look", () => {
  it("is a character of its own, stored with the bot like the others", () => {
    expect(botMascotLook({ character: "crab", skins: { crab: "mint" } })).toEqual({ character: "crab", skins: { crab: "mint" } });
    expect(completeMascotLook({ character: "crab" }).skins.crab).toBe("plain");
    expect(CHARACTER_PAINT.crab).toEqual({ colors: true, skins: CRAB_SKINS, wingMoves: false });
    expect(MASCOT_COLOR_HEX[CRAB_DEFAULT_COLOR as keyof typeof MASCOT_COLOR_HEX]).toBeDefined();
    const look = completeMascotLook({ character: "crab", skins: { crab: "sand", frog: "tree" } });
    expect(completeMascotLook({ ...look, character: "frog" }).skins).toMatchObject({ frog: "tree", crab: "sand" });
  });

  it("reads other names a stored skin may carry, and drops one it does not know without losing the character", () => {
    for (const [old, current] of Object.entries(LEGACY_CRAB_SKINS)) expect(botMascotLook({ character: "crab", skins: { crab: old } }).skins?.crab, old).toBe(current);
    expect(botMascotLook({ character: "crab", skins: { crab: "lobster" } })).toEqual({ character: "crab" });
    expect(mascotLookSchema.safeParse({ character: "crab", skins: { crab: "nope" } }).success).toBe(false);
  });

  it("is in the registry, the editor, the palettes (Clay included), the app icons and the free characters", () => {
    expect(mascotFor({ character: "crab" }).id).toBe("crab");
    expect(MASCOTS.find((entry) => entry.id === "crab")?.capabilities.wings).toBe(false);
    expect(CHARACTER_LABEL.crab).toBe("floatingBots.mascot.crab");
    expect(colorGroupsFor("crab", "orange")).toContain("clay");
    expect(APP_ICON_CHOICES.some((choice) => choice.art.kind === "crab")).toBe(true);
    expect(DEFAULT_CHARACTERS).toContain("crab");
    for (const skin of CRAB_SKINS) expect(skinTier("crab", skin), skin).toBe("common");
  });

  it("maps the app's states to its faces", () => {
    expect(crabExpressionForMood("thinking")).toBe("curious");
    expect(crabExpressionForMood("working")).toBe("attentive");
    expect(crabExpressionForMood("happy")).toBe("happy");
    expect(crabExpressionForMood("sleeping")).toBe("sleepy");
    expect(crabExpressionForMood("listening")).toBe("attentive");
    expect(crabExpressionForMood("speaking")).toBe("excited");
    expect(crabExpressionForMood("idle")).toBe("neutral");
  });
});

describe("Crab's skins", () => {
  it("has five common skins: Plain with the character, then Coral, Sand, Ink and Mint", () => {
    expect([...CRAB_SKINS]).toEqual(["plain", "coral", "sand", "ink", "mint"]);
    expect(Object.keys(CRAB_SKIN_TIER)).toEqual([...CRAB_SKINS]);
    for (const skin of CRAB_SKINS) expect(CRAB_SKIN_TIER[skin], skin).toBe("common");
  });

  it("names every skin in English and French", () => {
    expect(Object.keys(CRAB_SKIN_LABEL)).toEqual([...CRAB_SKINS]);
    for (const key of [...Object.values(CRAB_SKIN_LABEL), CHARACTER_LABEL.crab, "floatingBots.move.scuttle"]) {
      expect(en).toHaveProperty([key]);
      expect(fr).toHaveProperty([key]);
    }
  });

  it("paints a fill and eyes for every skin, Ink with cream eyes", () => {
    for (const skin of CRAB_SKINS) {
      const paint = crabSkinPaint(skin, "#377FE6");
      expect(paint.fill, skin).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(paint.eyes, skin).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(paint.tier, skin).toBe("common");
    }
    expect(crabSkinPaint("coral", "#377FE6").fill.toUpperCase()).toBe(CRAB_CORAL.toUpperCase());
    expect(crabSkinPaint("ink", "#377FE6").eyes.toUpperCase()).toBe("#F4EFE8");
    expect(crabSkinPaint("plain", "#377FE6").eyes.toUpperCase()).toBe(CRAB_INK.toUpperCase());
    expect(crabSkinPaint("plain", "#377FE6").fill).not.toBe(crabSkinPaint("plain", "#E78531").fill);
    expect(crabSkinPaint("sand", "#377FE6").fill).toBe(crabSkinPaint("sand", "#E78531").fill);
    expect(crabSkinId("unknown")).toBe("plain");
  });
});

describe("Crab's drawing", () => {
  it("renders every skin at every size as crisp rectangles, nine of them", () => {
    for (const skin of CRAB_SKINS) {
      for (const size of [16, 24, 32, 44, 96, 256]) {
        const html = draw({ skin, size });
        expect(html, `${skin}@${size}`).not.toMatch(/NaN|undefined/);
        expect(html).toContain(`data-crab-skin="${skin}"`);
        expect(html).toContain(`data-character="crab"`);
        expect(html).toContain(`width:${size}px`);
        expect(html).toContain("crispEdges");
        expect(html).not.toMatch(/<path[\s>]/);
        expect(html.match(/<rect /g)?.length, `${skin}@${size}`).toBe(9);
      }
    }
    expect(draw({ size: 32 })).toContain('viewBox="4 40 92 58"');
    expect(draw({ size: 96 })).toContain('viewBox="0 0 100 100"');
  });

  it("is what a bot wearing it shows everywhere", () => {
    const html = renderToStaticMarkup(createElement(BotAvatar, { bot: { color: "orange", mascotLook: { character: "crab", skins: { crab: "coral" } } }, size: 40, state: "laughing" }));
    expect(html).toContain('data-character="crab"');
    expect(html).toContain('data-crab-skin="coral"');
  });
});
