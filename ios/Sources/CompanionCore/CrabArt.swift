// Crab, the pixel-rect mascot (the desktop's `src/components/crab-art.ts` and
// `skin-fx/crab-skins.tsx`): only axis-aligned rectangles. Idle sprite is
// Clawd's 16-cell crab mapped into the 0..100 box, with square 2x2 eyes, a
// shine, pincer claws and foot pads. The fixture test checks each skin's
// fill and eyes against the desktop's (`crabPalettes` in
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

    /// `crabSkinPaint`: one fill, the eye colour, and the shine.
    public static func paint(_ skin: CrabSkin, hex: String) -> (fill: String, eyes: String, shine: String) {
        switch skin {
        case .plain: return (fill(hex).uppercased(), ink, shine)
        case .coral: return (coral, ink, shine)
        case .sand: return ("#E8D5B5", ink, shine)
        case .ink: return ("#2A2624", "#F4EFE8", "#1A1816")
        case .mint: return ("#7EC8A3", ink, shine)
        }
    }
}
