// The crab's idle as one rigid pixel sprite (the desktop's fix, #340,
// crab-mascot.css / crab-moves.ts): the whole sprite steps up one cell and
// back, never stretches; arms and legs never rotate or scale apart from the
// body (a clap lifts both arms one cell), so nothing detaches. Drawn at the
// desktop crab's footprint (0.6 of its box), standing on the box's floor.
import CoreGraphics
import Foundation

public enum CrabRig {
    /// The full sprite's share of its box (`CRAB_DESKTOP_SCALE`).
    public static let scale: CGFloat = 0.6
    /// Listening: the whole sprite tilts this much, degrees, on its ground point.
    public static let listenTilt: Double = -3

    public struct Pose: Equatable, Sendable {
        /// Whole sprite offset, in box units (0 or -CrabArt.px).
        public var lift: CGFloat = 0
        public var tilt: Double = 0
        /// Both arms' offset, in box units (0 or -CrabArt.px).
        public var armLift: CGFloat = 0
        public init(lift: CGFloat = 0, tilt: Double = 0, armLift: CGFloat = 0) {
            self.lift = lift
            self.tilt = tilt
            self.armLift = armLift
        }
    }

    private static func phase(_ time: Double, _ period: Double) -> Double {
        let p = time.truncatingRemainder(dividingBy: period) / period
        return p < 0 ? p + 1 : p
    }

    /// `crab-bob`: up one cell for 50..90 % of the cycle.
    static func bob(_ time: Double, period: Double) -> CGFloat {
        let p = phase(time, period)
        return p >= 0.5 && p < 0.9 ? -CrabArt.px : 0
    }

    /// The rigid pose at `time` (nil: at rest, Reduce Motion or paused).
    public static func pose(sleeping: Bool, listening: Bool, speaking: Bool, happy: Bool, time: Double?) -> Pose {
        if listening { return Pose(tilt: listenTilt) }
        guard let time else { return Pose() }
        var pose = Pose()
        if speaking {
            // `crab-talk`, 0.42 s alternate: down, then up one cell
            pose.lift = phase(time, 0.84) >= 0.5 ? -CrabArt.px : 0
        } else {
            pose.lift = bob(time, period: sleeping ? 3.6 : 2.4)
        }
        if happy && !sleeping {
            // `crab-clap-*`: both arms up one cell at 20, 48 and 76 %
            let p = phase(time, 1.8)
            pose.armLift = [0.2, 0.48, 0.76].contains(where: { abs(p - $0) < 0.07 }) ? -CrabArt.px : 0
        }
        return pose
    }
}
