import XCTest
@testable import CompanionCore

final class SandboxDesktopControlTests: XCTestCase {
    func testTakeControlOpensFullScreenAndAsksForTheLease() {
        var mode = SandboxDesktopMode()
        XCTAssertTrue(mode.handle(.takeControl))
        XCTAssertEqual(mode, SandboxDesktopMode(control: true, fullScreen: true))
        XCTAssertFalse(mode.handle(.takeControl), "already held: no reconnect")
    }

    func testLeavingFullScreenKeepsControlAndReleaseLeavesIt() {
        var mode = SandboxDesktopMode()
        mode.handle(.takeControl)
        XCTAssertFalse(mode.handle(.exitFullScreen))
        XCTAssertEqual(mode, SandboxDesktopMode(control: true, fullScreen: false))
        XCTAssertFalse(mode.handle(.enterFullScreen))
        XCTAssertTrue(mode.handle(.releaseControl))
        XCTAssertEqual(mode, SandboxDesktopMode())
    }

    func testFullScreenViewOnlyAndLosingTheDesktop() {
        var mode = SandboxDesktopMode()
        XCTAssertFalse(mode.handle(.enterFullScreen))
        XCTAssertEqual(mode, SandboxDesktopMode(control: false, fullScreen: true))
        mode.handle(.takeControl)
        XCTAssertTrue(mode.handle(.desktopLost))
        XCTAssertEqual(mode, SandboxDesktopMode())
    }

    func testTypingMapsToKeysyms() {
        XCTAssertEqual(VNCKeys.type("a"), [VNCKeyEvent(0x61, down: true), VNCKeyEvent(0x61, down: false)])
        XCTAssertEqual(VNCKeys.type("é").first?.keysym, 0xE9)
        XCTAssertEqual(VNCKeys.type("€").first?.keysym, 0x0100_20AC)
        XCTAssertEqual(VNCKeys.type("\n").first?.keysym, VNCKeys.returnKey)
        XCTAssertEqual(VNCKeys.type("hi").map(\.keysym), [0x68, 0x68, 0x69, 0x69])
        XCTAssertEqual(VNCKeys.keysym(RemoteSpecialKey.escape), 0xFF1B)
        XCTAssertEqual(VNCKeys.keysym(RemoteSpecialKey.left), 0xFF51)
    }

    func testStickyModifiersChordOneCharacterInOrder() {
        let events = VNCKeys.type("c", modifiers: [.meta, .ctrl])
        XCTAssertEqual(events, [
            VNCKeyEvent(0xFFE3, down: true), VNCKeyEvent(0xFFEB, down: true),
            VNCKeyEvent(0x63, down: true), VNCKeyEvent(0x63, down: false),
            VNCKeyEvent(0xFFEB, down: false), VNCKeyEvent(0xFFE3, down: false),
        ])
        XCTAssertEqual(VNCKeys.type("ab", modifiers: [.ctrl]).count, 4, "a paste is not a chord")
    }
}
