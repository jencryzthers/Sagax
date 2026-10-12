// Settings > Appearance > Sidebar logo (`src/lib/sidebar-logo-preferences.ts`).
// Same key as Electron (`sagax-show-sidebar-logo`), local only: UserDefaults
// here, localStorage on desktop. Not synced through the server. Default on
// (shown) unless the stored value is `"0"`.
import Foundation

public enum SidebarLogoPreference: Sendable {
    /// Electron `SIDEBAR_LOGO_KEY`.
    public static let key = "sagax-show-sidebar-logo"

    /// Electron default: shown unless explicitly turned off.
    public static let defaultEnabled = true

    /// Electron `showSidebarLogo()`: anything other than `"0"` is shown.
    public static func enabled(stored: String?) -> Bool {
        stored != "0"
    }

    /// The mark and "Sagax" in the sidebar head. iPadOS honors the stored
    /// preference. iPhone and Mac (Catalyst / Designed for iPad on Mac) keep
    /// the brand visible: Electron already owns this toggle on the Mac desktop
    /// app, and the phone roster has no brand row to hide.
    public static func isBrandVisible(enabled: Bool, idiomIsPad: Bool, isMac: Bool) -> Bool {
        if isMac { return true }
        if idiomIsPad { return enabled }
        return true
    }

    /// The Appearance switch itself: iPadOS only, not Mac.
    public static func showsSetting(idiomIsPad: Bool, isMac: Bool) -> Bool {
        idiomIsPad && !isMac
    }
}
