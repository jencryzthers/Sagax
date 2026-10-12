import CoreGraphics
import XCTest
@testable import CompanionCore

/// The iOS crab moves as one rigid pixel sprite, as the desktop's since #340.
final class CrabRigTests: XCTestCase {
    func testIdleStepsWholeCellsOnly() {
        var seen = Set<CGFloat>()
        for i in 0..<240 {
            let pose = CrabRig.pose(sleeping: false, listening: false, speaking: false, happy: false, time: Double(i) * 0.01)
            seen.insert(pose.lift)
            XCTAssertEqual(pose.tilt, 0)
            XCTAssertEqual(pose.armLift, 0)
        }
        XCTAssertEqual(seen, [0, -CrabArt.px])
    }

    func testRestAndReduceMotionStandStill() {
        XCTAssertEqual(CrabRig.pose(sleeping: false, listening: false, speaking: false, happy: true, time: nil), CrabRig.Pose())
    }

    func testListeningOnlyTiltsTheWholeSprite() {
        XCTAssertEqual(CrabRig.pose(sleeping: false, listening: true, speaking: false, happy: false, time: 1.3), CrabRig.Pose(tilt: CrabRig.listenTilt))
    }

    func testClapLiftsArmsOneCellNeverRotates() {
        var lifts = Set<CGFloat>()
        for i in 0..<180 {
            lifts.insert(CrabRig.pose(sleeping: false, listening: false, speaking: false, happy: true, time: Double(i) * 0.01).armLift)
        }
        XCTAssertEqual(lifts, [0, -CrabArt.px])
    }

    func testSmallFootprint() {
        XCTAssertEqual(CrabRig.scale, 0.6, accuracy: 0.0001)
        XCTAssertEqual(CrabArt.ground.y, 100, "the sprite's feet sit on the box's floor")
    }
}
