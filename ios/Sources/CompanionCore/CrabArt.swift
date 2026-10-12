// Crab, the pixel-rect mascot (the desktop's `src/components/crab-art.ts` and
// `skin-fx/crab-skins.tsx`): only axis-aligned rectangles, a coral fill and
// two black square eyes, two stub arms and four legs. The idle sprite is a
// 15-cell grid mapped into the 0..100 drawing box. The fixture test checks
// each skin's fill and eyes against the desktop's (`crabPalettes` in
// Fixtures/mascot-looks.json).
import CoreGraphics
import Foundation

public enum CrabArt {
    public static let coral = "#DD775B"
    public static let ink = "#111111"
    public static let px: CGFloat = 6
    public static let grid: CGFloat = 15
    public static let ox: CGFloat = (100 - 15 * 6) / 2
    public static let oy: CGFloat = 100 - 15 * 6

    public struct Rect: Sendable {
        public let x, y, w, h: CGFloat
        public var cg: CGRect { CGRect(x: x, y: y, width: w, height: h) }
    }

    private static func cell(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> Rect {
        Rect(x: ox + x * px, y: oy + y * px, w: w * px, h: h * px)
    }

    public static let body = cell(2, 6, 11, 7)
    public static let armL = cell(0, 9, 2, 2)
    public static let armR = cell(13, 9, 2, 2)
    public static let legs: [Rect] = [cell(3, 13, 1, 2), cell(5, 13, 1, 2), cell(9, 13, 1, 2), cell(11, 13, 1, 2)]
    public static let eyeL = cell(4, 8, 1, 2)
    public static let eyeR = cell(10, 8, 1, 2)

    /// The bust an avatar of 48 pt or less shows (`CRAB_BUST`).
    public static let bust = CGRect(x: 4, y: body.y - 6, width: 92, height: body.h + 16)
    public static let bustMax: CGFloat = 48

    public static let ground = CGPoint(x: 50, y: oy + grid * px)
    public static let armLPivot = CGPoint(x: armL.x + armL.w, y: armL.y)
    public static let armRPivot = CGPoint(x: armR.x, y: armR.y)
    public static let eyeLPivot = CGPoint(x: eyeL.x + eyeL.w / 2, y: eyeL.y + eyeL.h / 2)
    public static let eyeRPivot = CGPoint(x: eyeR.x + eyeR.w / 2, y: eyeR.y + eyeR.h / 2)
    public static let legPivots: [CGPoint] = legs.map { CGPoint(x: $0.x + $0.w / 2, y: $0.y) }

    /// `crabHexOf`: a name, a `#RRGGBB`, or the crab's coral.
    public static func hex(_ color: String) -> String { MausColors.hex(for: color) ?? coral }

    /// `crabFill`: Plain takes 45 % of the bot colour into the coral.
    public static func fill(_ hex: String, amount: Double = 0.45) -> String {
        ShapeArt.mix(coral, hex, amount)
    }

    /// `crabSkinPaint`: one fill and the eye colour.
    public static func paint(_ skin: CrabSkin, hex: String) -> (fill: String, eyes: String) {
        switch skin {
        case .plain: return (fill(hex).uppercased(), ink)
        case .coral: return (coral, ink)
        case .sand: return ("#E8D5B5", ink)
        case .ink: return ("#2A2624", "#F4EFE8")
        case .mint: return ("#7EC8A3", ink)
        }
    }
}
