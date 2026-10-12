import XCTest
@testable import CompanionCore

/// The bot's Computer screen froze and was killed by the watchdog on an
/// organization server whose environment was running: every SwiftUI update
/// re-attached the web view, re-opened noVNC and re-published, which caused
/// the next update. These pin that a re-attach is never an event.
final class SandboxRFBGateTests: XCTestCase {
    func testOpensOnceWhenPageAndSocketAreReadyInEitherOrder() {
        var gate = SandboxRFBGate()
        XCTAssertFalse(gate.handle(.attached(newView: true)))
        XCTAssertFalse(gate.handle(.socketOpened))
        XCTAssertTrue(gate.handle(.pageLoaded))

        var other = SandboxRFBGate()
        XCTAssertFalse(other.handle(.attached(newView: true)))
        XCTAssertFalse(other.handle(.pageLoaded))
        XCTAssertTrue(other.handle(.socketOpened))
    }

    func testEveryUpdateReattachingTheSameViewNeverReopens() {
        var gate = SandboxRFBGate()
        _ = gate.handle(.attached(newView: true))
        _ = gate.handle(.pageLoaded)
        XCTAssertTrue(gate.handle(.socketOpened))
        // The loop: each publish re-ran updateUIView, which re-attached.
        let reopens = (0..<1_000).filter { _ in gate.handle(.attached(newView: false)) }.count
        XCTAssertEqual(reopens, 0)
        XCTAssertTrue(gate.opened)
    }

    func testNothingOpensBeforeAViewIsAttached() {
        var gate = SandboxRFBGate()
        XCTAssertFalse(gate.handle(.socketOpened))
        XCTAssertFalse(gate.handle(.pageLoaded))
        XCTAssertFalse(gate.handle(.attached(newView: true)))
        XCTAssertTrue(gate.handle(.pageLoaded))
    }

    func testANewSocketOpensAgainOnce() {
        var gate = SandboxRFBGate()
        _ = gate.handle(.attached(newView: true))
        _ = gate.handle(.pageLoaded)
        XCTAssertTrue(gate.handle(.socketOpened))
        XCTAssertFalse(gate.handle(.socketClosed))
        XCTAssertFalse(gate.handle(.attached(newView: false)))
        XCTAssertTrue(gate.handle(.socketOpened))
        XCTAssertFalse(gate.handle(.attached(newView: false)))
    }

    func testANewWebViewWaitsForItsOwnPage() {
        var gate = SandboxRFBGate()
        _ = gate.handle(.attached(newView: true))
        _ = gate.handle(.pageLoaded)
        XCTAssertTrue(gate.handle(.socketOpened))
        XCTAssertFalse(gate.handle(.attached(newView: true)))
        XCTAssertTrue(gate.handle(.pageLoaded))
    }
    /// Full screen moves the one web view between the inline host and the
    /// full-screen cover and back; each host re-attaches it on every update.
    /// None of that may re-open noVNC on the live socket.
    func testMovingTheViewIntoFullScreenAndBackNeverReopens() {
        var gate = SandboxRFBGate()
        _ = gate.handle(.attached(newView: true))
        _ = gate.handle(.pageLoaded)
        XCTAssertTrue(gate.handle(.socketOpened))
        var reopens = 0
        for _ in 0..<200 { // enter, a few updates in full screen, exit
            for _ in 0..<5 where gate.handle(.attached(newView: false)) { reopens += 1 }
        }
        XCTAssertEqual(reopens, 0)
        XCTAssertTrue(gate.opened)
        // Take control reconnects: a new socket opens exactly once.
        XCTAssertFalse(gate.handle(.socketClosed))
        XCTAssertTrue(gate.handle(.socketOpened))
        XCTAssertFalse(gate.handle(.attached(newView: false)))
    }
}
