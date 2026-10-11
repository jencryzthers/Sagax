// Crab, the pixel-rect mascot: a port of `src/components/CrabMascot.tsx`
// drawn from `CrabArt` (the desktop's idle sprite). Under 48 pt it is a bust.
// While animated it does the desktop's CSS idle (a bob with squash and a
// sway, a blink, a look-around, pincer pinch, opposite legs ticking, and on
// happy a Clawd clap with sparkles). Reduce Motion keeps it still, as on
// the desktop.
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
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: !live)) { timeline in
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

    /// `crabExpressionForMood`.
    var face: String {
        switch self {
        case .thinking: return "curious"
        case .working: return "attentive"
        case .happy: return "happy"
        case .sleeping: return "sleepy"
        case .listening: return "attentive"
        case .speaking: return "excited"
        case .idle: return "neutral"
        }
    }
}

enum CrabRenderer {
    /// The desktop's CSS idle (crab-mascot.css).
    static let bob = CSSKeyframes([
        (0, [0, 1, 1, 0]),
        (0.25, [-2, 1.015, 0.99, 1.5]),
        (0.5, [-4, 1.03, 0.97, 0]),
        (0.75, [-2, 1.015, 0.99, -1.5]),
        (1, [0, 1, 1, 0]),
    ])
    static let blink = CSSKeyframes([(0, [1]), (0.42, [1]), (0.5, [0.12]), (0.58, [1]), (1, [1])])
    static let look = CSSKeyframes([
        (0, [0, 0]),
        (0.22, [3.4, 1]),
        (0.48, [-2.2, 1.6]),
        (0.74, [2, -1]),
        (1, [0, 0]),
    ])
    static let pinchL = CSSKeyframes([(0, [0, 0]), (0.5, [-5, -5]), (1, [0, 0])])
    static let pinchR = CSSKeyframes([(0, [0, 0]), (0.5, [5, -5]), (1, [0, 0])])
    static let armL = CSSKeyframes([(0, [0]), (0.5, [5]), (1, [0])])
    static let armR = CSSKeyframes([(0, [0]), (0.5, [-5]), (1, [0])])
    static let tick = CSSKeyframes([(0, [0]), (0.5, [-6]), (1, [0])])
    static let talk = CSSKeyframes([(0, [0, 0.98]), (1, [-3, 1.03])])
    static let spark = CSSKeyframes([
        (0, [0]),
        (0.20, [1]),
        (0.34, [0.3]),
        (0.48, [1]),
        (0.62, [0.3]),
        (0.76, [1]),
        (1, [0]),
    ])
    static let clapL = CSSKeyframes([
        (0, [0]),
        (0.20, [-72]),
        (0.34, [-24]),
        (0.48, [-72]),
        (0.62, [-24]),
        (0.76, [-72]),
        (1, [0]),
    ])
    static let clapR = CSSKeyframes([
        (0, [0]),
        (0.20, [72]),
        (0.34, [24]),
        (0.48, [72]),
        (0.62, [24]),
        (0.76, [72]),
        (1, [0]),
    ])

    static func draw(in context: inout GraphicsContext, canvas: CGSize, box: CGFloat, skin: CrabSkin, hex: String, mood: CrabMood, time: Double?) {
        let paint = CrabArt.paint(skin, hex: hex)
        let drawn = CrabArt.eyes(mood.face)
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

        func loop(_ frames: CSSKeyframes, _ duration: Double, delay: Double = 0, rest: [Double], alternate: Bool = false) -> [Double] {
            guard let time, let value = frames.value(at: time, duration: duration, delay: delay, timing: .easeInOut, alternate: alternate) else { return rest }
            return value
        }
        let sleeping = mood == .sleeping
        let listening = mood == .listening
        let speaking = mood == .speaking
        let happy = mood == .happy

        let bobY: Double
        let bobSX: Double
        let bobSY: Double
        let bobRot: Double
        if listening {
            bobY = 0
            bobSX = 1
            bobSY = 1
            bobRot = -4
        } else if speaking {
            let v = loop(talk, 0.42, rest: [0, 0.98], alternate: true)
            bobY = v[0]
            bobSX = 1
            bobSY = v[1]
            bobRot = 0
        } else {
            let v = loop(bob, sleeping ? 3.6 : 2.4, rest: [0, 1, 1, 0])
            bobY = v[0]
            bobSX = v[1]
            bobSY = v[2]
            bobRot = v[3]
        }
        let eyeOpen = sleeping ? 0.12 : loop(blink, 3.2, rest: [1])[0]
        let lookXY = sleeping ? [0.0, 0.0] : loop(look, 10.9, rest: [0, 0])
        let pinchLeft = sleeping ? [0.0, 0.0] : loop(pinchL, 3.6, rest: [0, 0])
        let pinchRight = sleeping ? [0.0, 0.0] : loop(pinchR, 3.6, rest: [0, 0])
        let rotL = sleeping ? 0 : (happy ? loop(clapL, 1.8, rest: [0])[0] : loop(armL, 2.4, rest: [0])[0])
        let rotR = sleeping ? 0 : (happy ? loop(clapR, 1.8, rest: [0])[0] : loop(armR, 2.4, rest: [0])[0])
        let tickA = sleeping || bust ? 0 : loop(tick, 0.48, rest: [0])[0]
        let tickB = sleeping || bust ? 0 : loop(tick, 0.48, delay: 0.24, rest: [0])[0]
        let sparkOpacity = happy && !bust ? loop(spark, 1.8, rest: [0])[0] : 0

        var whole = ctx
        whole.translateBy(x: 0, y: bobY)
        whole.pivot(CrabArt.ground, rotate: bobRot, scaleX: bobSX, scaleY: bobSY)

        func fill(_ rect: CrabArt.Rect, _ hex: String, in base: GraphicsContext, opacity: Double = 1) {
            var c = base
            if opacity < 1 { c.opacity = opacity }
            c.fill(Path(rect.cg), with: .color(Color(hex: hex)))
        }

        fill(CrabArt.body, paint.fill, in: whole)

        var leftArm = whole
        leftArm.pivot(CrabArt.armLPivot, rotate: rotL)
        fill(CrabArt.armL, paint.fill, in: leftArm)
        var leftPincer = leftArm
        leftPincer.translateBy(x: pinchLeft[0], y: pinchLeft[1])
        fill(CrabArt.pincerL, paint.fill, in: leftPincer)

        var rightArm = whole
        rightArm.pivot(CrabArt.armRPivot, rotate: rotR)
        fill(CrabArt.armR, paint.fill, in: rightArm)
        var rightPincer = rightArm
        rightPincer.translateBy(x: pinchRight[0], y: pinchRight[1])
        fill(CrabArt.pincerR, paint.fill, in: rightPincer)

        if !bust {
            for (i, leg) in CrabArt.legs.enumerated() {
                var limb = whole
                limb.translateBy(x: 0, y: i % 2 == 0 ? tickA : tickB)
                fill(leg, paint.fill, in: limb)
                fill(CrabArt.feet[i], paint.fill, in: limb)
            }
        }

        var eyes = whole
        eyes.translateBy(x: lookXY[0], y: lookXY[1])
        func eye(_ pupil: CrabArt.Rect, _ shine: CrabArt.Rect?, _ pivot: CGPoint) {
            var lid = eyes
            lid.pivot(pivot, scaleX: 1, scaleY: eyeOpen)
            fill(pupil, paint.eyes, in: lid)
            if let shine { fill(shine, paint.shine, in: lid) }
        }
        eye(drawn.pupils.0, drawn.shines?.0, CrabArt.eyeLPivot)
        eye(drawn.pupils.1, drawn.shines?.1, CrabArt.eyeRPivot)

        if sparkOpacity > 0.01 {
            for dot in CrabArt.sparkles {
                fill(dot, CrabArt.spark, in: whole, opacity: sparkOpacity)
            }
        }
    }
}
