// The server-environment desktop (SandboxDesktopScreen) in full screen: who
// holds control, whether the desktop fills the screen, and what the phone's
// keyboard sends to noVNC.

/// Control and full screen on the bot's server-environment desktop.
/// Take control opens full screen (that is where the pointer and keyboard are
/// usable); leaving full screen keeps control, and releasing control leaves
/// full screen. Full screen is also available view-only.
public struct SandboxDesktopMode: Equatable, Sendable {
    public enum Event: Equatable, Sendable {
        case takeControl
        case releaseControl
        case enterFullScreen
        case exitFullScreen
        /// The desktop went away (stopped, paused, closed): nothing to hold.
        case desktopLost
    }

    public private(set) var control = false
    public private(set) var fullScreen = false

    public init(control: Bool = false, fullScreen: Bool = false) {
        self.control = control
        self.fullScreen = fullScreen
    }

    /// Applies an event; true when control changed, so the viewer must
    /// reconnect with (or without) the control lease.
    @discardableResult
    public mutating func handle(_ event: Event) -> Bool {
        let held = control
        switch event {
        case .takeControl:
            control = true
            fullScreen = true
        case .releaseControl:
            control = false
            fullScreen = false
        case .enterFullScreen:
            fullScreen = true
        case .exitFullScreen:
            fullScreen = false
        case .desktopLost:
            control = false
            fullScreen = false
        }
        return held != control
    }
}

/// One RFB key event for noVNC's `sendKey(keysym, code, down)`.
public struct VNCKeyEvent: Equatable, Sendable {
    public let keysym: UInt32
    public let down: Bool
    public init(_ keysym: UInt32, down: Bool) {
        self.keysym = keysym
        self.down = down
    }
}

/// X11 keysyms for what the phone keyboard and its accessory bar produce.
public enum VNCKeys {
    public static let backspace: UInt32 = 0xFF08
    public static let tab: UInt32 = 0xFF09
    public static let returnKey: UInt32 = 0xFF0D
    public static let escape: UInt32 = 0xFF1B
    public static let left: UInt32 = 0xFF51
    public static let up: UInt32 = 0xFF52
    public static let right: UInt32 = 0xFF53
    public static let down: UInt32 = 0xFF54

    public static func keysym(_ modifier: ComputerModifier) -> UInt32 {
        switch modifier {
        case .shift: return 0xFFE1
        case .ctrl: return 0xFFE3
        case .alt: return 0xFFE9
        case .meta: return 0xFFEB
        }
    }

    public static func keysym(_ key: RemoteSpecialKey) -> UInt32 {
        switch key {
        case .escape: return escape
        case .tab: return tab
        case .up: return up
        case .down: return down
        case .left: return left
        case .right: return right
        }
    }

    /// Latin-1 is its own keysym; anything else is 0x01000000 + code point.
    public static func keysym(_ scalar: Unicode.Scalar) -> UInt32 {
        switch scalar {
        case "\n", "\r": return returnKey
        case "\t": return tab
        default:
            return scalar.value < 0x100 ? scalar.value : 0x0100_0000 + scalar.value
        }
    }

    /// Presses and releases for one key, wrapped in the held modifiers.
    public static func press(_ keysym: UInt32, modifiers: Set<ComputerModifier> = []) -> [VNCKeyEvent] {
        let held = ComputerModifier.allCases.filter(modifiers.contains).map(Self.keysym)
        return held.map { VNCKeyEvent($0, down: true) }
            + [VNCKeyEvent(keysym, down: true), VNCKeyEvent(keysym, down: false)]
            + held.reversed().map { VNCKeyEvent($0, down: false) }
    }

    /// Typed text. Sticky modifiers chord a single character (ctrl+c);
    /// longer text (a paste, a suggestion) is typed as is.
    public static func type(_ text: String, modifiers: Set<ComputerModifier> = []) -> [VNCKeyEvent] {
        let scalars = Array(text.unicodeScalars)
        let chord = scalars.count == 1 ? modifiers : []
        return scalars.flatMap { press(keysym($0), modifiers: chord) }
    }
}
