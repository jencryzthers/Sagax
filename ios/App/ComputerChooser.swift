// The Computer tab's screen picker on an organization server
// (`ComputerPicker` in OrgComputerTab.tsx): Cloud, then each of the person's
// own computers by its name (the host name its Sagax app registered), so a
// person with two PCs sees two Local VMs. A dot marks the screen the bot
// works on. Picking one changes only what is shown, and where that Local
// VM's buttons go (`desktopId`), never the bot's Works on. Browser mode is
// its last chip where the server has the built-in browser (Screen and
// Browser on a solo server). Shown only when there is more than one choice.
import SwiftUI
import CompanionCore

/// The person's desktops (`GET /api/me/desktop-bridge`), asked every 20
/// seconds while the Computer tab is on screen. A server with no bridge (a
/// solo server) answers nothing and is not asked again.
@MainActor
final class ComputerChoicesModel: ObservableObject {
    @Published private(set) var bridge: PersonDesktopBridge?

    private var provider: @MainActor () -> CompanionClient? = { nil }
    private var loop: Task<Void, Never>?
    private var stopped = false

    func start(_ provider: @escaping @MainActor () -> CompanionClient?) {
        self.provider = provider
        guard loop == nil, !stopped else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, await self.refresh() else { return }
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    /// False when this server has no bridge: stop asking.
    private func refresh() async -> Bool {
        guard let client = provider() else { return true }
        do {
            guard let next = try await client.personDesktopBridge() else {
                bridge = nil
                stopped = true
                return false
            }
            if next != bridge { bridge = next }
        } catch {
            // Keep the last answer; the next poll asks again.
        }
        return true
    }
}

/// The segmented control itself, in the colors of the screen it sits on.
struct ComputerChooser: View {
    struct Colors {
        var ink: Color
        var secondary: Color
        var track: Color
        var selected: Color
        var dot: Color
    }

    struct Item: Identifiable {
        var id: String { key }
        let key: String
        let label: String
        let systemImage: String
        /// The bot works here: a dot, and VoiceOver says so.
        var here = false
    }

    /// The key of browser mode's chip.
    static let browserKey = "browser"

    /// The chips: on an organization server Cloud and each computer by
    /// name, else Screen alone; then Browser when the bot can show one.
    static func items(bridge: PersonDesktopBridge?, organization: Bool, worksOnLocal: Bool, browser: Bool) -> [Item] {
        var items: [Item]
        if organization, let bridge {
            let here = bridge.worksOn(local: worksOnLocal)?.key
            items = bridge.computerChoices().map { choice in
                Item(key: choice.key, label: choice.name ?? String(localized: "Cloud"),
                     systemImage: choice == .cloud ? "cloud" : "laptopcomputer", here: choice.key == here)
            }
        } else {
            items = [Item(key: "screen", label: String(localized: "Screen"), systemImage: "display")]
        }
        if browser { items.append(Item(key: browserKey, label: String(localized: "Browser"), systemImage: "globe")) }
        return items
    }

    let items: [Item]
    let chosen: String?
    let colors: Colors
    let pick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(items) { item in
                    chip(item)
                }
            }
            .padding(3)
            .background(colors.track, in: Capsule())
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("Show the screen of"))
        .accessibilityIdentifier("computer-picker")
    }

    private func chip(_ item: Item) -> some View {
        let selected = item.key == chosen
        return Button {
            Haptics.selection()
            pick(item.key)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: item.systemImage)
                    .font(.system(size: 12, weight: .medium))
                Text(verbatim: item.label)
                    .font(.system(size: 13, weight: selected ? .semibold : .regular))
                    .lineLimit(1)
                if item.here {
                    Circle().fill(colors.dot).frame(width: 6, height: 6)
                }
            }
            .foregroundStyle(selected ? colors.ink : colors.secondary)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(selected ? colors.selected : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.here ? Text("\(item.label): this bot works here") : Text(verbatim: item.label))
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityIdentifier("computer-choice.\(item.key)")
    }
}
