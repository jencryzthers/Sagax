// When the Computer tab's server-environment desktop (SandboxDesktopScreen)
// opens noVNC: once per WebSocket, after both the bundled page and the socket
// are ready, in the web view that loaded the page.
//
// SwiftUI calls `updateUIView` on every update of the screen, and the screen
// updates whenever the viewer publishes. When each re-attach re-opened noVNC
// and re-published `rfbReady`, a running server environment put the main
// thread in an endless update loop: the bot's screen froze the moment the
// socket opened and iOS killed the app (watchdog 0x8BADF00D). A re-attach of
// the same web view is therefore never an event.
public struct SandboxRFBGate: Equatable, Sendable {
    public enum Event: Equatable, Sendable {
        /// The representable handed its web view over; `newView` is false for
        /// the same view again (every `updateUIView`).
        case attached(newView: Bool)
        /// The page in the attached web view finished loading.
        case pageLoaded
        case socketOpened
        /// The socket closed or failed, or the viewer stopped or restarted.
        case socketClosed
    }

    public private(set) var hasView = false
    public private(set) var pageLoaded = false
    public private(set) var socketOpen = false
    /// noVNC is open on the current socket in the current view.
    public private(set) var opened = false

    public init() {}

    /// Applies an event; true exactly when noVNC must be opened now.
    public mutating func handle(_ event: Event) -> Bool {
        switch event {
        case let .attached(newView):
            guard newView else { return false }
            hasView = true
            pageLoaded = false
            opened = false
        case .pageLoaded:
            pageLoaded = true
        case .socketOpened:
            socketOpen = true
            opened = false
        case .socketClosed:
            socketOpen = false
            opened = false
            return false
        }
        guard hasView, pageLoaded, socketOpen, !opened else { return false }
        opened = true
        return true
    }
}
