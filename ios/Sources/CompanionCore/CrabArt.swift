// Crab, the pixel-rect mascot (the desktop's `src/components/crab-art.ts` and
// `skin-fx/crab-skins.tsx`): only axis-aligned rectangles. Idle sprite is
// Clawd's 16-cell crab mapped into the 0..100 box, with square 2x2 eyes, a
// shine, pincer claws and foot pads. The fixture test checks each skin's
// fill, eyes and extra marks against the desktop's (`crabPalettes` in
// Fixtures/mascot-looks.json).
import CoreGraphics
import Foundation

public enum CrabArt {
    public static let coral = "#DD775B"
    public static let ink = "#111111"
    public static let shine = "#F8F4EE"
    public static let spark = "#FBF236"
    public static let px: CGFloat = 6
    public static let grid: CGFloat = 16
    public static let ox: CGFloat = (100 - 16 * 6) / 2
    public static let oy: CGFloat = 100 - 16 * 6

    public struct Rect: Sendable {
        public let x, y, w, h: CGFloat
        public var cg: CGRect { CGRect(x: x, y: y, width: w, height: h) }
    }

    public static func cell(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> Rect {
        Rect(x: ox + x * px, y: oy + y * px, w: w * px, h: h * px)
    }

    public static let body = cell(3, 7, 10, 6)
    public static let armL = cell(1, 9, 2, 2)
    public static let armR = cell(13, 9, 2, 2)
    public static let pincerL = cell(1, 8, 2, 1)
    public static let pincerR = cell(13, 8, 2, 1)
    public static let legs: [Rect] = [cell(4, 13, 1, 2), cell(6, 13, 1, 2), cell(9, 13, 1, 2), cell(11, 13, 1, 2)]
    public static let feet: [Rect] = [cell(3, 15, 2, 1), cell(5, 15, 2, 1), cell(9, 15, 2, 1), cell(11, 15, 2, 1)]
    public static let eyeL = cell(5, 8, 2, 2)
    public static let eyeR = cell(9, 8, 2, 2)
    public static let shineL = cell(5, 8, 1, 1)
    public static let shineR = cell(9, 8, 1, 1)
    public static let sparkles: [Rect] = [cell(4, 4, 1, 1), cell(8, 3, 1, 1), cell(11, 4, 1, 1)]

    /// The bust an avatar of 48 pt or less shows (`CRAB_BUST`).
    public static let bust = CGRect(x: 2, y: body.y - 10, width: 96, height: body.h + 22)
    public static let bustMax: CGFloat = 48

    public static let ground = CGPoint(x: 50, y: oy + grid * px)
    public static let armLPivot = CGPoint(x: armL.x + armL.w, y: armL.y)
    public static let armRPivot = CGPoint(x: armR.x, y: armR.y)
    public static let eyeLPivot = CGPoint(x: eyeL.x + eyeL.w / 2, y: eyeL.y + eyeL.h / 2)
    public static let eyeRPivot = CGPoint(x: eyeR.x + eyeR.w / 2, y: eyeR.y + eyeR.h / 2)
    public static let legPivots: [CGPoint] = legs.map { CGPoint(x: $0.x + $0.w / 2, y: $0.y) }

    public struct EyeDraw: Sendable {
        public let pupils: (Rect, Rect)
        public let shines: (Rect, Rect)?
    }

    /// `crabEyeDraw`: happy is a lower squint; sleep is a higher lid; open faces are 2x2 with a shine.
    public static func eyes(_ face: String?) -> EyeDraw {
        switch face {
        case "happy", "laughing", "proud":
            return EyeDraw(pupils: (cell(5, 9, 2, 1), cell(9, 9, 2, 1)), shines: nil)
        case "sleepy", "bored":
            return EyeDraw(pupils: (cell(5, 8, 2, 1), cell(9, 8, 2, 1)), shines: nil)
        default:
            return EyeDraw(pupils: (eyeL, eyeR), shines: (shineL, shineR))
        }
    }

    /// `crabHexOf`: a name, a `#RRGGBB`, or the crab's coral.
    public static func hex(_ color: String) -> String { MausColors.hex(for: color) ?? coral }

    /// `crabFill`: Plain takes 45 % of the bot colour into the coral.
    public static func fill(_ hex: String, amount: Double = 0.45) -> String {
        ShapeArt.mix(coral, hex, amount)
    }

    /// `crabSkinPaint`: fill, eyes, shine, and the claw accent.
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
                    Mark(r: cell(4, 7, 8, 1), fill: "#FFFBE8", opacity: 0.9),
                    pix(4, 8, "#FFF4C2"),
                    pix(11, 8, "#FFF4C2"),
                    Mark(r: cell(4, 12, 8, 1), fill: "#8A5A0C", opacity: 0.5),
                    pix(7, 11, "#C8901E"),
                ],
                around: [pix(3, 5, "#FFF3B0"), pix(12, 4, "#FFF3B0")] + plus(8, 2, "#FFFBE8")
            )
        case .pearl:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(4, 7, 8, 1), fill: "#FFFFFF", opacity: 0.55),
                    pix(5, 11, "#FFC6D9", opacity: 0.85),
                    pix(10, 10, "#9EE7D4", opacity: 0.85),
                    pix(8, 12, "#C9B6FF", opacity: 0.7),
                ],
                around: [pix(2, 6, "#FFFFFF", opacity: 0.8), pix(13, 5, "#FFC6D9")]
            )
        case .neon:
            return Marks(
                under: [Mark(r: cell(2, 6, 12, 8), fill: p.accent, opacity: 0.16)],
                inner: [Mark(r: cell(3, 7, 10, 1), fill: p.accent, opacity: 1), pix(4, 12, p.accent), pix(11, 12, p.accent)],
                around: [pix(2, 5, p.accent), pix(13, 5, p.accent), pix(8, 3, "#FFFFFF")]
            )
        case .chrome:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(4, 7, 8, 1), fill: "#FFFFFF", opacity: 0.7),
                    Mark(r: cell(4, 12, 8, 1), fill: "#262D35", opacity: 0.45),
                    pix(12, 8, "#FFFFFF", opacity: 0.55),
                ],
                around: [pix(14, 6, "#E8EEF5")]
            )
        case .crystal:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(4, 8, 3, 2), fill: "#FFFFFF", opacity: 0.5),
                    Mark(r: cell(9, 10, 3, 2), fill: "#FFFFFF", opacity: 0.32),
                    Mark(r: cell(3, 7, 2, 1), fill: "#FFFFFF", opacity: 0.6),
                    pix(12, 9, "#FFFFFF", opacity: 0.45),
                ],
                around: [pix(2, 6, "#FFFFFF"), pix(13, 7, "#FFFFFF")] + plus(8, 3, p.accent)
            )
        case .circuit:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(4, 10, 4, 1), fill: p.accent, opacity: 1),
                    Mark(r: cell(7, 10, 1, 2), fill: p.accent, opacity: 1),
                    Mark(r: cell(7, 11, 3, 1), fill: p.accent, opacity: 1),
                    pix(4, 10, "#FFFFFF"),
                    pix(9, 11, "#FFFFFF"),
                    pix(11, 10, p.accent),
                ],
                around: [pix(2, 9, p.accent), pix(14, 11, p.accent)]
            )
        case .holo:
            return Marks(
                under: [],
                inner: [
                    Mark(r: cell(3, 9, 10, 1), fill: "#FF8BE6", opacity: 0.5),
                    Mark(r: cell(3, 10, 10, 1), fill: "#7DF4FF", opacity: 0.45),
                    Mark(r: cell(3, 11, 10, 1), fill: "#FFE98A", opacity: 0.4),
                ],
                around: [pix(2, 5, "#FF8BE6"), pix(13, 4, "#7DF4FF"), pix(8, 2, "#B49BFF"), pix(1, 11, "#FFE98A")]
            )
        case .molten:
            return Marks(
                under: [Mark(r: cell(2, 6, 12, 8), fill: "#FF6A1A", opacity: 0.12)],
                inner: [
                    Mark(r: cell(4, 10, 5, 1), fill: "#FF6A1A", opacity: 1),
                    Mark(r: cell(8, 10, 1, 2), fill: "#FFD36B", opacity: 1),
                    Mark(r: cell(6, 11, 4, 1), fill: "#FF7A1A", opacity: 1),
                    Mark(r: cell(11, 9, 1, 2), fill: "#FF6A1A", opacity: 1),
                ],
                around: [pix(3, 5, "#FF7A1A"), pix(12, 4, "#FFD36B"), pix(8, 2, "#FF6A1A")]
            )
        case .galaxy:
            return Marks(
                under: [],
                inner: [pix(4, 10, "#FFFFFF"), pix(7, 11, "#B9A4FF"), pix(11, 10, "#FFFFFF"), pix(12, 8, "#B9A4FF"), pix(3, 8, "#7B5CFF"), pix(8, 12, "#FFFFFF")],
                around: plus(2, 5, "#FFFFFF") + plus(14, 5, "#B9A4FF") + plus(8, 2, "#FFFFFF") + [pix(1, 10, "#7B5CFF"), pix(14, 11, "#FFFFFF"), pix(6, 3, "#B9A4FF")]
            )
        default:
            return none
        }
    }
}
