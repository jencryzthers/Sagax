// Crab, the pixel-rect mascot (the desktop's `src/components/crab-art.ts` and
// `skin-fx/crab-skins.tsx`): only axis-aligned rectangles. Idle sprite is
// Anthropic's Clawd-Still (24 x 16 cells) mapped into the 0..100 box: two 2x2
// square eyes, stub 4x4 arms, four 2x4 legs flush with the body, no pincers,
// no foot pads, no shine. The fixture test checks each skin's fill and eyes
// against the desktop's (`crabPalettes` in Fixtures/mascot-looks.json).
import CoreGraphics
import Foundation

public enum CrabArt {
    public static let coral = "#DD775B"
    public static let ink = "#111111"
    public static let shine = "#F8F4EE"
    public static let spark = "#FBF236"
    public static let px: CGFloat = 4
    public static let gridW: CGFloat = 24
    public static let gridH: CGFloat = 16
    /// Width of the still; prefer `gridW`.
    public static let grid: CGFloat = 24
    public static let ox: CGFloat = (100 - 24 * 4) / 2
    public static let oy: CGFloat = 100 - 16 * 4

    public struct Rect: Sendable {
        public let x, y, w, h: CGFloat
        public var cg: CGRect { CGRect(x: x, y: y, width: w, height: h) }
    }

    public static func cell(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> Rect {
        Rect(x: ox + x * px, y: oy + y * px, w: w * px, h: h * px)
    }

    public static let body = cell(4, 0, 16, 12)
    public static let armL = cell(0, 4, 4, 4)
    public static let armR = cell(20, 4, 4, 4)
    public static let legs: [Rect] = [cell(4, 12, 2, 4), cell(8, 12, 2, 4), cell(14, 12, 2, 4), cell(18, 12, 2, 4)]
    public static let eyeL = cell(6, 2, 2, 2)
    public static let eyeR = cell(16, 2, 2, 2)
    public static let sparkles: [Rect] = [cell(5, 0, 1, 1), cell(12, 0, 1, 1), cell(18, 0, 1, 1)]

    /// The bust an avatar of 48 pt or less shows (`CRAB_BUST`).
    public static let bust = CGRect(x: 0, y: body.y - 4, width: 100, height: body.h + 8)
    public static let bustMax: CGFloat = 48

    public static let ground = CGPoint(x: 50, y: oy + gridH * px)
    public static let armLPivot = CGPoint(x: armL.x + armL.w, y: armL.y)
    public static let armRPivot = CGPoint(x: armR.x, y: armR.y)
    public static let eyeLPivot = CGPoint(x: eyeL.x + eyeL.w / 2, y: eyeL.y + eyeL.h / 2)
    public static let eyeRPivot = CGPoint(x: eyeR.x + eyeR.w / 2, y: eyeR.y + eyeR.h / 2)
    public static let legPivots: [CGPoint] = legs.map { CGPoint(x: $0.x + $0.w / 2, y: $0.y) }

    public struct EyeDraw: Sendable {
        public let pupils: (Rect, Rect)
        public let shines: (Rect, Rect)?
    }

    /// `crabEyeDraw`: happy is a lower squint; sleep is a higher lid; open faces are 2x2, no shine.
    public static func eyes(_ face: String?) -> EyeDraw {
        switch face {
        case "happy", "laughing", "proud":
            return EyeDraw(pupils: (cell(6, 3, 2, 1), cell(16, 3, 2, 1)), shines: nil)
        case "sleepy", "bored":
            return EyeDraw(pupils: (cell(6, 2, 2, 1), cell(16, 2, 2, 1)), shines: nil)
        default:
            return EyeDraw(pupils: (eyeL, eyeR), shines: nil)
        }
    }

    /// `crabHexOf`: a name, a `#RRGGBB`, or the crab's coral.
    public static func hex(_ color: String) -> String { MausColors.hex(for: color) ?? coral }

    /// `crabFill`: Plain takes 45 % of the bot colour into the coral.
    public static func fill(_ hex: String, amount: Double = 0.45) -> String {
        ShapeArt.mix(coral, hex, amount)
    }

    /// `crabSkinPaint`: fill, eyes, shine, and the arm accent.
    public static func paint(_ skin: CrabSkin, hex: String) -> (fill: String, eyes: String, shine: String, accent: String) {
        switch skin {
        case .plain:
            let body = fill(hex)
            return (body, ink, shine, body)
        case .coral: return (coral, ink, shine, coral)
        case .sand: return ("#E8D5B5", ink, shine, "#E8D5B5")
        case .ink: return ("#2A2624", "#F4EFE8", "#1A1816", "#2A2624")
        case .mint: return ("#7EC8A3", ink, shine, "#7EC8A3")
        case .gold: return ("#E2AE34", "#3A2404", "#FFF4C2", "#C8901E")
        case .pearl: return ("#F3EBE3", "#5A4A55", "#FFFFFF", "#E7C6D4")
        case .neon:
            let tube = ShapeArt.mix(hex, "#7DFFEA", 0.45)
            return ("#0D0F15", tube, "#FFFFFF", tube)
        case .chrome: return ("#8C98A6", "#10151B", "#FFFFFF", "#E8EEF5")
        case .crystal:
            let ice = ShapeArt.mix(hex, "#FFFFFF", 0.55)
            return (ice, "#1B1F27", "#FFFFFF", ShapeArt.mix(hex, "#FFFFFF", 0.25))
        case .circuit:
            let trace = ShapeArt.mix(hex, "#7DFFEA", 0.45)
            return ("#08161B", ShapeArt.mix(hex, "#FFFFFF", 0.6), "#FFFFFF", trace)
        case .holo: return ("#ECE9FB", "#2A2140", "#7DF4FF", "#FF8BE6")
        case .molten: return ("#2A120C", "#FFD36B", "#FF7A1A", "#FF6A1A")
        case .galaxy: return ("#120A2E", "#F3EFFF", "#B9A4FF", "#7B5CFF")
        }
    }

    /// Extra pixels of a premium skin (`crabSkinMarks`). Commons have none.
    public struct Mark: Sendable {
        public let r: Rect
        public let fill: String
        public let opacity: Double
    }

    public struct Marks: Sendable {
        public let under: [Mark]
        public let inner: [Mark]
        public let around: [Mark]
    }

    private static let none = Marks(under: [], inner: [], around: [])

    private static func pix(_ x: CGFloat, _ y: CGFloat, _ fill: String, opacity: Double = 1) -> Mark {
        Mark(r: cell(x, y, 1, 1), fill: fill, opacity: opacity)
    }

    private static func plus(_ x: CGFloat, _ y: CGFloat, _ fill: String, opacity: Double = 1) -> [Mark] {
        [
            Mark(r: cell(x - 1, y, 3, 1), fill: fill, opacity: opacity),
            Mark(r: cell(x, y - 1, 1, 3), fill: fill, opacity: opacity),
        ]
    }

    public static func marks(_ skin: CrabSkin, hex: String) -> Marks {
        let p = paint(skin, hex: hex)
        switch skin {
        case .gold:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(5, 1, 14, 1), fill: "#FFFBE8", opacity: 0.9),
                    pix(5, 4, "#FFF4C2"),
                    pix(18, 4, "#FFF4C2"),
                    Mark(r: cell(6, 10, 12, 1), fill: "#8A5A0C", opacity: 0.5),
                    pix(11, 8, "#C8901E"),
                ],
                around: [pix(1, 3, "#FFF3B0"), pix(22, 2, "#FFF3B0")] + plus(12, 1, "#FFFBE8")
            )
        case .pearl:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(5, 1, 14, 1), fill: "#FFFFFF", opacity: 0.55),
                    pix(8, 8, "#FFC6D9", opacity: 0.85),
                    pix(15, 7, "#9EE7D4", opacity: 0.85),
                    pix(11, 10, "#C9B6FF", opacity: 0.7),
                ],
                around: [pix(1, 4, "#FFFFFF", opacity: 0.8), pix(22, 3, "#FFC6D9")]
            )
        case .neon:
            return Marks(
                under: [Mark(r: cell(1, 1, 22, 14), fill: p.accent, opacity: 0.16)],
                inner: [Mark(r: cell(4, 0, 16, 1), fill: p.accent, opacity: 1), pix(5, 11, p.accent), pix(18, 11, p.accent)],
                around: [pix(1, 3, p.accent), pix(22, 3, p.accent), pix(12, 0, "#FFFFFF")]
            )
        case .chrome:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(5, 1, 14, 1), fill: "#FFFFFF", opacity: 0.7),
                    Mark(r: cell(6, 10, 12, 1), fill: "#262D35", opacity: 0.45),
                    pix(18, 5, "#FFFFFF", opacity: 0.55),
                ],
                around: [pix(23, 4, "#E8EEF5")]
            )
        case .crystal:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(8, 4, 3, 2), fill: "#FFFFFF", opacity: 0.5),
                    Mark(r: cell(13, 8, 3, 2), fill: "#FFFFFF", opacity: 0.32),
                    Mark(r: cell(4, 1, 2, 1), fill: "#FFFFFF", opacity: 0.6),
                    pix(18, 6, "#FFFFFF", opacity: 0.45),
                ],
                around: [pix(1, 4, "#FFFFFF"), pix(22, 5, "#FFFFFF")] + plus(12, 1, p.accent)
            )
        case .circuit:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(6, 7, 6, 1), fill: p.accent, opacity: 1),
                    Mark(r: cell(11, 7, 1, 3), fill: p.accent, opacity: 1),
                    Mark(r: cell(11, 9, 5, 1), fill: p.accent, opacity: 1),
                    pix(6, 7, "#FFFFFF"),
                    pix(15, 9, "#FFFFFF"),
                    pix(18, 7, p.accent),
                ],
                around: [pix(1, 7, p.accent), pix(22, 9, p.accent)]
            )
        case .holo:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(4, 6, 16, 1), fill: "#FF8BE6", opacity: 0.5),
                    Mark(r: cell(4, 7, 16, 1), fill: "#7DF4FF", opacity: 0.45),
                    Mark(r: cell(4, 8, 16, 1), fill: "#FFE98A", opacity: 0.4),
                ],
                around: [pix(1, 3, "#FF8BE6"), pix(22, 2, "#7DF4FF"), pix(12, 1, "#B49BFF"), pix(0, 9, "#FFE98A")]
            )
        case .molten:
            return Marks(
                under: [Mark(r: cell(1, 1, 22, 14), fill: "#FF6A1A", opacity: 0.12)],
                inner: [
                    Mark(r: cell(6, 8, 5, 1), fill: "#FF6A1A", opacity: 1),
                    Mark(r: cell(10, 8, 1, 2), fill: "#FFD36B", opacity: 1),
                    Mark(r: cell(8, 9, 4, 1), fill: "#FF7A1A", opacity: 1),
                    Mark(r: cell(15, 7, 1, 2), fill: "#FF6A1A", opacity: 1),
                ],
                around: [pix(2, 3, "#FF7A1A"), pix(21, 2, "#FFD36B"), pix(12, 1, "#FF6A1A")]
            )
        case .galaxy:
            return Marks(
                under: [],
                inner: [pix(5, 8, "#FFFFFF"), pix(10, 9, "#B9A4FF"), pix(18, 8, "#FFFFFF"), pix(14, 6, "#B9A4FF"), pix(8, 10, "#7B5CFF"), pix(12, 11, "#FFFFFF")],
                around: plus(2, 3, "#FFFFFF") + plus(21, 3, "#B9A4FF") + plus(12, 1, "#FFFFFF") + [pix(0, 8, "#7B5CFF"), pix(23, 9, "#FFFFFF"), pix(9, 1, "#B9A4FF")]
            )
        default:
            return none
        }
    }
}
