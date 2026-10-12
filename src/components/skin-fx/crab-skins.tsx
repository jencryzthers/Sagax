// How each Crab skin paints the pixel crab (CrabMascot.tsx): one fill and
// black eyes. Named skins are their own colour; Plain tints the coral with
// the bot's colour.
import { CRAB_SKIN_TIER, CRAB_SKINS, type CrabSkin, type SkinTier } from "../../../shared/mascot-look";
import { CRAB_CORAL, CRAB_INK, crabFill } from "../crab-art";

export function crabSkinId(skin: string | null | undefined): CrabSkin {
  return (CRAB_SKINS as readonly string[]).includes(skin ?? "") ? (skin as CrabSkin) : "plain";
}

export interface CrabSkinPaint {
  fill: string;
  eyes: string;
  tier: SkinTier;
}

const NAMED: Readonly<Record<Exclude<CrabSkin, "plain">, string>> = {
  coral: CRAB_CORAL,
  sand: "#E8D5B5",
  ink: "#2A2624",
  mint: "#7EC8A3",
};

export function crabSkinPaint(skin: CrabSkin | string, hex: string): CrabSkinPaint {
  const known = crabSkinId(skin);
  const tier = CRAB_SKIN_TIER[known];
  if (known === "plain") return { fill: crabFill(hex), eyes: CRAB_INK, tier };
  return { fill: NAMED[known], eyes: known === "ink" ? "#F4EFE8" : CRAB_INK, tier };
}
