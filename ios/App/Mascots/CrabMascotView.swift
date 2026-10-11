// Crab, the pixel-rect mascot: a port of `src/components/CrabMascot.tsx`
// drawn from `CrabArt` (the desktop's idle sprite). Under 48 pt it is a bust.
// While animated it does the desktop's CSS idle (a bob, a blink, opposite
// legs ticking). Reduce Motion keeps it still, as on the desktop.
import CompanionCore
import SwiftUI

struct CrabMascotView: View {
    var skin: CrabSkin = .plain
    /// A bot colour name (`orange`) or any hex.
    let color: String
    var size: CGFloat = 44
    var mood: CrabMood = .idle
    var animated = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let live = animated && !reduceMotion && scenePhase == .active
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !live)) { timeline in
            Canvas { context, canvas in
                CrabRenderer.draw(
                    in: &context, canvas: canvas, box: size, skin: skin, hex: CrabArt.hex(color),
                    mood: mood, time: live ? timeline.date.timeIntervalSinceReferenceDate : nil
                )
            }
            .frame(width: size, height: size)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// `CrabMood` in CrabMascot.tsx, from `bunbuMoodFor` in Avatar.tsx.
enum CrabMood: Sendable {
    case idle, thinking, working, happy, sleeping, listening, speaking

    init(state: MausState) {
        self = CrabMood(bunbu: BunbuMood(state: state))
    }

    init(bunbu: BunbuMood) {
        switch bunbu {
        case .thinking: self = .thinking
        case .working: self = .working
        case .happy: self = .happy
        case .sleeping: self = .sleeping
        case .listening: self = .listening
        case .speaking: self = .speaking
        case .idle: self = .idle
        }
    }
}

enum CrabRenderer {
    /// The desktop's CSS idle (crab-mascot.css).
    static let bob = CSSKeyframes([(0, [0]), (0.5, [-4]), (1, [0])])
    static let blink = CSSKeyframes([(0, [1]), (0.42, [1]), (0.5, [0.12]), (0.58, [1]), (1, [1])])
    static let tick = CSSKeyframes([(0, [0]), (0.5, [-2.16]), (1, [0])])

    static func draw(in context: inout GraphicsContext, canvas: CGSize, box: CGFloat, skin: CrabSkin, hex: String, mood: CrabMood, time: Double?) {
        let paint = CrabArt.paint(skin, hex: hex)
        let bust = box <= CrabArt.bustMax
        var ctx = context
        ctx.translateBy(x: (canvas.width - box) / 2, y: (canvas.height - box) / 2)
        if bust {
            let b = CrabArt.bust
            ctx.scaleBy(x: box / b.width, y: box / b.height)
            ctx.translateBy(x: -b.minX, y: -b.minY)
        } else {
            ctx.scaleBy(x: box / 100, y: box / 100)
        }

        func loop(_ frames: CSSKeyframes, _ duration: Double, delay: Double = 0, rest: [Double]) -> [Double] {
            guard let time, let value = frames.value(at: time, duration: duration, delay: delay, timing: .easeInOut) else { return rest }
            return value
        }
        let sleeping = mood == .sleeping
        let lift = sleeping ? loop(bob, 3.6, rest: [0])[0] : (mood == .speaking ? loop(bob, 0.42, rest: [0])[0] : loop(bob, 2.4, rest: [0])[0])
        let eyeOpen = sleeping ? 0.12 : loop(blink, 3.2, rest: [1])[0]
        let tickA = sleeping || bust ? 0 : loop(tick, 0.48, rest: [0])[0]
        let tickB = sleeping || bust ? 0 : loop(tick, 0.48, delay: 0.24, rest: [0])[0]

        var whole = ctx
        whole.translateBy(x: 0, y: lift)
        if mood == .listening { whole.pivot(CrabArt.ground, rotate: -4) }

        func fill(_ rect: CrabArt.Rect, _ hex: String, in base: GraphicsContext) {
            base.fill(Path(rect.cg), with: .color(Color(hex: hex)))
        }

        fill(CrabArt.body, paint.fill, in: whole)
        fill(CrabArt.armL, paint.fill, in: whole)
        fill(CrabArt.armR, paint.fill, in: whole)
        if !bust {
            for (i, leg) in CrabArt.legs.enumerated() {
                var limb = whole
                limb.translateBy(x: 0, y: i % 2 == 0 ? tickA : tickB)
                fill(leg, paint.fill, in: limb)
            }
        }
        func eye(_ rect: CrabArt.Rect, _ pivot: CGPoint) {
            var lid = whole
            lid.pivot(pivot, scaleX: 1, scaleY: eyeOpen)
            fill(rect, paint.eyes, in: lid)
        }
        eye(CrabArt.eyeL, CrabArt.eyeLPivot)
        eye(CrabArt.eyeR, CrabArt.eyeRPivot)
    }
}
