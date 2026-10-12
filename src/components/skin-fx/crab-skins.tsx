// How each Crab skin paints the pixel crab (CrabMascot.tsx): fill, eyes,
// shine, arm accent, the effect family, and extra axis-aligned marks
// (stars, cracks, traces, stripes). Named commons are their own colour;
// Plain tints the coral with the bot's colour. Premium skins follow the
// Shapes finishes (gold, pearl; neon, chrome, crystal, circuit; holo,
// molten, galaxy) as extra pixels, never paths. Marks sit on the Clawd-Still
// 24x16 body (cell 4,0,16,12): eyes occupy (6,2)-(7,3) and (16,2)-(17,3).
import { CRAB_SKIN_TIER, CRAB_SKINS, type CrabSkin, type SkinTier } from "../../../shared/mascot-look";
import { cell, CRAB_CORAL, CRAB_INK, CRAB_SHINE, crabFill, type CrabRect } from "../crab-art";
import { mix, type FxKind } from "./skin-fx";

export function crabSkinId(skin: string | null | undefined): CrabSkin {
  return (CRAB_SKINS as readonly string[]).includes(skin ?? "") ? (skin as CrabSkin) : "plain";
}

export interface CrabSkinPaint {
  fill: string;
  eyes: string;
  shine: string;
  /** Arms; same as fill on the commons. */
  accent: string;
  tier: SkinTier;
  fx: FxKind;
}

const NAMED: Readonly<Record<Exclude<CrabSkin, "plain" | "gold" | "pearl" | "neon" | "chrome" | "crystal" | "circuit" | "holo" | "molten" | "galaxy">, string>> = {
  coral: CRAB_CORAL,
  sand: "#E8D5B5",
  ink: "#2A2624",
  mint: "#7EC8A3",
};

export function crabSkinPaint(skin: CrabSkin | string, hex: string): CrabSkinPaint {
  const known = crabSkinId(skin);
  const tier = CRAB_SKIN_TIER[known];
  switch (known) {
    case "plain":
      return { fill: crabFill(hex), eyes: CRAB_INK, shine: CRAB_SHINE, accent: crabFill(hex), tier, fx: "plain" };
    case "ink":
      return { fill: NAMED.ink, eyes: "#F4EFE8", shine: "#1A1816", accent: NAMED.ink, tier, fx: "ink" };
    case "coral":
    case "sand":
    case "mint":
      return { fill: NAMED[known], eyes: CRAB_INK, shine: CRAB_SHINE, accent: NAMED[known], tier, fx: "plain" };
    case "gold":
      return { fill: "#E2AE34", eyes: "#3A2404", shine: "#FFF4C2", accent: "#C8901E", tier, fx: "gold" };
    case "pearl":
      return { fill: "#F3EBE3", eyes: "#5A4A55", shine: "#FFFFFF", accent: "#E7C6D4", tier, fx: "crystal" };
    case "neon": {
      const tube = mix(hex, "#7DFFEA", 0.45);
      return { fill: "#0D0F15", eyes: tube, shine: "#FFFFFF", accent: tube, tier, fx: "neon" };
    }
    case "chrome":
      return { fill: "#8C98A6", eyes: "#10151B", shine: "#FFFFFF", accent: "#E8EEF5", tier, fx: "chrome" };
    case "crystal": {
      const ice = mix(hex, "#FFFFFF", 0.55);
      return { fill: ice, eyes: "#1B1F27", shine: "#FFFFFF", accent: mix(hex, "#FFFFFF", 0.25), tier, fx: "crystal" };
    }
    case "circuit": {
      const trace = mix(hex, "#7DFFEA", 0.45);
      return { fill: "#08161B", eyes: mix(hex, "#FFFFFF", 0.6), shine: "#FFFFFF", accent: trace, tier, fx: "circuit" };
    }
    case "holo":
      return { fill: "#ECE9FB", eyes: "#2A2140", shine: "#7DF4FF", accent: "#FF8BE6", tier, fx: "holo" };
    case "molten":
      return { fill: "#2A120C", eyes: "#FFD36B", shine: "#FF7A1A", accent: "#FF6A1A", tier, fx: "molten" };
    case "galaxy":
      return { fill: "#120A2E", eyes: "#F3EFFF", shine: "#B9A4FF", accent: "#7B5CFF", tier, fx: "galaxy" };
  }
}

export interface CrabMark {
  r: CrabRect;
  fill: string;
  opacity?: number;
  className?: string;
}

export interface CrabMarks {
  under: CrabMark[];
  inner: CrabMark[];
  around: CrabMark[];
}

const NONE: CrabMarks = { under: [], inner: [], around: [] };

const pix = (x: number, y: number, fill: string, extra?: Omit<CrabMark, "r" | "fill">): CrabMark => ({
  r: cell(x, y, 1, 1),
  fill,
  ...extra,
});

/** A plus-shaped sparkle (two overlapping 1-wide bars), still only rectangles. */
const plus = (x: number, y: number, fill: string, extra?: Omit<CrabMark, "r" | "fill">): CrabMark[] => [
  { r: cell(x - 1, y, 3, 1), fill, ...extra },
  { r: cell(x, y - 1, 1, 3), fill, ...extra },
];

/** Extra pixels of a premium skin: aura, carapace marks, orbiting motes. Commons have none. */
export function crabSkinMarks(skin: CrabSkin | string, hex: string): CrabMarks {
  const known = crabSkinId(skin);
  const paint = crabSkinPaint(known, hex);
  switch (known) {
    case "gold":
      return {
        under: [],
        inner: [
          { r: cell(5, 1, 14, 1), fill: "#FFFBE8", opacity: 0.9 },
          pix(5, 4, "#FFF4C2"),
          pix(18, 4, "#FFF4C2"),
          { r: cell(6, 10, 12, 1), fill: "#8A5A0C", opacity: 0.5 },
          pix(11, 8, "#C8901E"),
        ],
        around: [pix(1, 3, "#FFF3B0", { className: "fx-glint" }), pix(22, 2, "#FFF3B0", { className: "fx-twinkle" }), ...plus(12, 1, "#FFFBE8", { className: "fx-twinkle" })],
      };
    case "pearl":
      return {
        under: [],
        inner: [
          { r: cell(5, 1, 14, 1), fill: "#FFFFFF", opacity: 0.55 },
          pix(8, 8, "#FFC6D9", { opacity: 0.85 }),
          pix(15, 7, "#9EE7D4", { opacity: 0.85 }),
          pix(11, 10, "#C9B6FF", { opacity: 0.7 }),
        ],
        around: [pix(1, 4, "#FFFFFF", { className: "fx-twinkle", opacity: 0.8 }), pix(22, 3, "#FFC6D9", { className: "fx-twinkle" })],
      };
    case "neon":
      return {
        under: [{ r: cell(1, 1, 22, 14), fill: paint.accent, opacity: 0.16, className: "fx-neon-bloom" }],
        inner: [{ r: cell(4, 0, 16, 1), fill: paint.accent, className: "fx-neon-flicker" }, pix(5, 11, paint.accent), pix(18, 11, paint.accent)],
        around: [pix(1, 3, paint.accent, { className: "fx-twinkle" }), pix(22, 3, paint.accent, { className: "fx-twinkle" }), pix(12, 0, "#FFFFFF", { className: "fx-twinkle" })],
      };
    case "chrome":
      return {
        under: [],
        inner: [
          { r: cell(5, 1, 14, 1), fill: "#FFFFFF", opacity: 0.7 },
          { r: cell(6, 10, 12, 1), fill: "#262D35", opacity: 0.45 },
          pix(18, 5, "#FFFFFF", { opacity: 0.55 }),
        ],
        around: [pix(23, 4, "#E8EEF5", { className: "fx-glint" })],
      };
    case "crystal":
      return {
        under: [],
        inner: [
          { r: cell(8, 4, 3, 2), fill: "#FFFFFF", opacity: 0.5 },
          { r: cell(13, 8, 3, 2), fill: "#FFFFFF", opacity: 0.32 },
          { r: cell(4, 1, 2, 1), fill: "#FFFFFF", opacity: 0.6 },
          pix(18, 6, "#FFFFFF", { opacity: 0.45 }),
        ],
        around: [
          pix(1, 4, "#FFFFFF", { className: "fx-twinkle" }),
          pix(22, 5, "#FFFFFF", { className: "fx-twinkle" }),
          ...plus(12, 1, paint.accent, { className: "fx-twinkle" }),
        ],
      };
    case "circuit":
      return {
        under: [],
        inner: [
          { r: cell(6, 7, 6, 1), fill: paint.accent },
          { r: cell(11, 7, 1, 3), fill: paint.accent },
          { r: cell(11, 9, 5, 1), fill: paint.accent },
          pix(6, 7, "#FFFFFF"),
          pix(15, 9, "#FFFFFF"),
          pix(18, 7, paint.accent),
        ],
        around: [pix(1, 7, paint.accent, { className: "fx-twinkle" }), pix(22, 9, paint.accent, { className: "fx-twinkle" })],
      };
    case "holo":
      return {
        under: [],
        inner: [
          { r: cell(4, 6, 16, 1), fill: "#FF8BE6", opacity: 0.5, className: "fx-twinkle" },
          { r: cell(4, 7, 16, 1), fill: "#7DF4FF", opacity: 0.45 },
          { r: cell(4, 8, 16, 1), fill: "#FFE98A", opacity: 0.4, className: "fx-twinkle" },
        ],
        around: [
          pix(1, 3, "#FF8BE6", { className: "fx-twinkle" }),
          pix(22, 2, "#7DF4FF", { className: "fx-twinkle" }),
          pix(12, 1, "#B49BFF", { className: "fx-glint" }),
          pix(0, 9, "#FFE98A", { className: "fx-twinkle" }),
        ],
      };
    case "molten":
      return {
        under: [{ r: cell(1, 1, 22, 14), fill: "#FF6A1A", opacity: 0.12, className: "fx-heat-halo" }],
        inner: [
          { r: cell(6, 8, 5, 1), fill: "#FF6A1A", className: "fx-crack" },
          { r: cell(10, 8, 1, 2), fill: "#FFD36B", className: "fx-crack" },
          { r: cell(8, 9, 4, 1), fill: "#FF7A1A" },
          { r: cell(15, 7, 1, 2), fill: "#FF6A1A" },
        ],
        around: [
          pix(2, 3, "#FF7A1A", { className: "fx-ember" }),
          pix(21, 2, "#FFD36B", { className: "fx-ember" }),
          pix(12, 1, "#FF6A1A", { className: "fx-heat" }),
        ],
      };
    case "galaxy":
      return {
        under: [],
        inner: [
          pix(5, 8, "#FFFFFF"),
          pix(10, 9, "#B9A4FF"),
          pix(18, 8, "#FFFFFF"),
          pix(14, 6, "#B9A4FF"),
          pix(8, 10, "#7B5CFF"),
          pix(12, 11, "#FFFFFF"),
        ],
        around: [
          ...plus(2, 3, "#FFFFFF", { className: "fx-twinkle" }),
          ...plus(21, 3, "#B9A4FF", { className: "fx-twinkle" }),
          ...plus(12, 1, "#FFFFFF", { className: "fx-glint" }),
          pix(0, 8, "#7B5CFF", { className: "fx-twinkle" }),
          pix(23, 9, "#FFFFFF", { className: "fx-twinkle" }),
          pix(9, 1, "#B9A4FF", { className: "fx-twinkle" }),
        ],
      };
    default:
      return NONE;
  }
}
