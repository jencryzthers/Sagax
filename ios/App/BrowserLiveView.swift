// Browser mode of the Computer tab: the bot's live browser, watched from the
// phone (the desktop's LiveBrowser in the screen's frame). An address capsule
// with the page's host, the page at its own proportions in a rounded black
// frame, "<Bot>'s browser" under it. The phone only watches: it never takes
// the browser from the bot. Frames come from `GET
// /api/bots/:id/browser/live`, each acknowledged so the next one comes
// (BrowserLive.swift); a dropped stream reconnects after 1, 2, 4, 8, then 15
// seconds while the view is on screen.
import SwiftUI
import UIKit
import CompanionCore

@MainActor
final class BrowserLiveModel: ObservableObject {
    @Published private(set) var state = BrowserLiveState()
    @Published private(set) var image: UIImage?
    @Published private(set) var problem: String?

    private let botId: String
    private var provider: @MainActor () -> CompanionClient? = { nil }
    private var loop: Task<Void, Never>?

    init(botId: String) {
        self.botId = botId
    }

    func start(_ provider: @escaping @MainActor () -> CompanionClient?) {
        self.provider = provider
        guard loop == nil else { return }
        loop = Task { [weak self] in await self?.run() }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    private func run() async {
        let delays: [UInt64] = [1, 2, 4, 8, 15]
        var attempt = 0
        while !Task.isCancelled {
            guard let client = provider() else {
                problem = String(localized: "Not connected.")
                return
            }
            do {
                for try await message in try client.browserLive(botId: botId) {
                    attempt = 0
                    problem = nil
                    guard let seq = state.apply(message) else { continue }
                    if let data = state.image, let picture = UIImage(data: data) { image = picture }
                    if let viewer = state.viewerId {
                        try? await client.browserAck(botId: botId, viewerId: viewer, seq: seq)
                    }
                }
            } catch {
                if Task.isCancelled { return }
                problem = (error as? LocalizedError)?.errorDescription ?? String(localized: "The browser stream was interrupted.")
            }
            if Task.isCancelled { return }
            let delay = delays[min(attempt, delays.count - 1)]
            attempt += 1
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
        }
    }
}

/// The Computer tab's browser mode, like its VM mode: an idle card, never a
/// live stream inline. Take control opens the browser full screen, and only
/// then does the stream start; leaving full screen closes it.
struct BrowserLiveView: View {
    let bot: Bot
    let secondary: Color
    let track: Color
    @State private var fullScreen = false

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Color.black
                VStack(spacing: 12) {
                    Image(systemName: "globe")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.white.opacity(0.7))
                    Text("\(bot.name)'s browser opens in full screen when you take control.")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                    Button {
                        fullScreen = true
                    } label: {
                        Label("Take control", systemImage: "hand.raised")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .background(Color.white.opacity(0.18), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("browser-take-control")
                }
            }
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("browser-idle")
            Text("\(bot.name)'s browser")
                .font(.system(size: 13))
                .foregroundStyle(secondary)
                .frame(maxWidth: .infinity)
        }
        .fullScreenCover(isPresented: $fullScreen) {
            BrowserFullScreen(bot: bot) { fullScreen = false }
        }
    }
}

/// Take control: the live browser over the whole screen. The stream lives
/// only while this is shown (BrowserLiveContent starts it on appear and
/// stops it on disappear).
struct BrowserFullScreen: View {
    let bot: Bot
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            BrowserLiveContent(bot: bot, secondary: Color.white.opacity(0.7), track: Color.white.opacity(0.12))
                .padding(.horizontal, 8)
                .padding(.top, 52)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            Button(action: onClose) {
                Label("Exit full screen", systemImage: "xmark")
                    .labelStyle(.iconOnly)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.18), in: Circle())
            }
            .buttonStyle(.plain)
            .padding(12)
            .accessibilityIdentifier("browser-exit-fullscreen")
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
    }
}

struct BrowserLiveContent: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var scenePhase
    let bot: Bot
    /// The caption's and the address capsule's colors.
    let secondary: Color
    let track: Color
    @StateObject private var model: BrowserLiveModel

    init(bot: Bot, secondary: Color, track: Color) {
        self.bot = bot
        self.secondary = secondary
        self.track = track
        _model = StateObject(wrappedValue: BrowserLiveModel(botId: bot.id))
    }

    var body: some View {
        VStack(spacing: 8) {
            address
            ZStack {
                Color.black
                if let image = model.image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .accessibilityLabel(Text("\(bot.name)'s browser"))
                } else {
                    VStack(spacing: 8) {
                        if model.problem == nil {
                            ProgressView().tint(.white)
                        }
                        Text(waitingText)
                            .font(.system(size: 12))
                            .foregroundStyle(Color.white.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)
                    }
                }
            }
            .aspectRatio(aspect, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityIdentifier("browser-live-frame")
            if model.image != nil, let problem = model.problem {
                Text(problem)
                    .font(.system(size: 12))
                    .foregroundStyle(secondary)
                    .multilineTextAlignment(.center)
            }
            Text("\(bot.name)'s browser")
                .font(.system(size: 13))
                .foregroundStyle(secondary)
                .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("browser-live")
        .onAppear { if scenePhase == .active { begin() } }
        .onDisappear { model.stop() }
        .onValueChange(of: scenePhase) { phase in
            if phase == .active { begin() } else { model.stop() }
        }
    }

    private func begin() {
        model.start { [weak session] in session?.computerClient }
    }

    private var aspect: CGFloat {
        let size = model.state.size
        return CGFloat(max(size.width, 1)) / CGFloat(max(size.height, 1))
    }

    private var waitingText: String {
        if let problem = model.problem { return problem }
        return model.state.waiting ? String(localized: "The bot is using its browser…") : String(localized: "Opening the browser…")
    }

    /// The page's host (the whole address when it has none), read only.
    private var address: some View {
        let url = model.state.url
        let shown = URL(string: url)?.host ?? (url.isEmpty ? String(localized: "No page yet") : url)
        return HStack(spacing: 6) {
            Image(systemName: url.hasPrefix("https://") ? "lock.fill" : "globe")
                .font(.system(size: 11, weight: .medium))
            Text(verbatim: shown)
                .font(.system(size: 12))
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .foregroundStyle(secondary)
        .padding(.horizontal, 12)
        .frame(height: 28)
        .frame(maxWidth: .infinity)
        .background(track, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("browser-live-address")
    }
}
