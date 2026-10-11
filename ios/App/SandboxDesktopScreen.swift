// The person's server-environment desktop on an organization server
// (`SandboxDesktopView.tsx` + `ServerComputerScreen` in OrgComputerTab.tsx).
// POST /api/bots/:id/computer/screenshot answers 409 org_user_sandbox; this
// uses GET /api/desktop-viewer/sandbox/me and a native WebSocket (no Origin)
// into bundled noVNC, plus POST /api/me/server-environment/power.
import CompanionCore
import SwiftUI
import WebKit

struct SandboxDesktopScreen: View {
    let botName: String
    var ink: Color = Theme.textPrimary
    var secondary: Color = Theme.textSecondary
    var card: Color = Theme.card

    @EnvironmentObject private var session: Session
    @State private var status: ServerEnvironmentStatus?
    @State private var pending: ServerEnvironmentPowerAction?
    @State private var error: String?
    @State private var confirmAction: ServerEnvironmentPowerAction?
    @State private var control = false
    @State private var viewState = "idle"
    @StateObject private var viewer = SandboxViewerSession()

    private var power: String {
        if pending == .start || pending == .resume { return "starting" }
        switch status?.state {
        case "running": return "running"
        case "paused": return "paused"
        case "missing", "stopped": return "off"
        default: return status == nil ? "starting" : "unavailable"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(botName)'s screen")
                .font(.system(size: 13))
                .foregroundStyle(secondary)
            ZStack {
                card
                SandboxDesktopWebView(session: viewer)
                    .opacity(viewer.rfbReady ? 1 : 0)
                if !viewer.rfbReady {
                    VStack(spacing: 8) {
                        if viewState == "connecting" || power == "starting" {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "display").font(.system(size: 22))
                        }
                        Text(verbatim: message)
                            .font(.system(size: 13))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(secondary)
                            .padding(.horizontal, 16)
                    }
                }
                if viewer.rfbReady, !control {
                    Button {
                        control = true
                        Task { await connect() }
                    } label: {
                        Text("Take control")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .frame(height: 36)
                            .background(Color.black.opacity(0.65), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sandbox-take-control")
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16 / 10, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            HStack(spacing: 12) {
                if power == "off" {
                    powerButton("play.fill", "Start", .start)
                }
                if power == "paused" {
                    powerButton("play.fill", "Resume", .resume)
                }
                if power == "running" {
                    powerButton("pause.fill", "Pause", .pause)
                    powerButton("stop.fill", "Stop", .shutdown)
                }
                Spacer(minLength: 0)
            }
            if let error {
                Text(verbatim: error)
                    .font(.system(size: 12))
                    .foregroundStyle(secondary)
            }
        }
        .task {
            await load()
            if power == "running" { await connect() }
        }
        .onChange(of: power) { next in
            if next == "running" { Task { await connect() } }
            else { viewer.stop(); viewState = "idle" }
        }
        .onDisappear { viewer.stop() }
        .confirmationDialog(
            String(localized: "A bot is working on this desktop. Stop it anyway?"),
            isPresented: Binding(get: { confirmAction != nil }, set: { if !$0 { confirmAction = nil } }),
            titleVisibility: .visible
        ) {
            Button(String(localized: "Stop anyway"), role: .destructive) {
                if let action = confirmAction { Task { await act(action, confirm: true) } }
            }
            Button(String(localized: "Cancel"), role: .cancel) { confirmAction = nil }
        }
        .accessibilityIdentifier("sandbox-desktop")
    }

    private var message: String {
        if let error { return error }
        switch viewState {
        case "connecting": return String(localized: "Starting the desktop…")
        case "closed": return String(localized: "Your server environment is closed.")
        case "busy": return String(localized: "Every server environment slot is in use. Try again in a few minutes.")
        case "outdated": return String(localized: "Your server environment is from before the desktop and a bot is working in it. Try again when the bot is done, or stop the environment (Stop) and show the desktop again: your files in /workspace are kept.")
        case "stopped": return String(localized: "The desktop stopped (your server environment went idle). Show it again to restart it.")
        case "unavailable": return String(localized: "The desktop is not available right now. Try again in a moment.")
        default: break
        }
        if status?.configured == false { return String(localized: "This server has no server environment yet.") }
        if power == "off" { return String(localized: "This bot's computer is off") }
        if power == "starting" { return String(localized: "Starting your bot's computer…") }
        return String(localized: "Bots working for you in your server environment use this desktop for computer use. Only you can see it.")
    }

    private func powerButton(_ system: String, _ label: LocalizedStringKey, _ action: ServerEnvironmentPowerAction) -> some View {
        Button {
            Task { await act(action) }
        } label: {
            Image(systemName: system)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(ink)
                .frame(width: 36, height: 36)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(pending != nil)
        .accessibilityLabel(Text(label))
        .accessibilityIdentifier("sandbox-power.\(action.rawValue)")
    }

    private func load() async {
        guard let client = session.computerClient else { return }
        do {
            status = try await client.serverEnvironment()
            error = nil
        } catch {
            status = ServerEnvironmentStatus(configured: true, state: "unavailable")
            self.error = error.localizedDescription
        }
    }

    private func act(_ action: ServerEnvironmentPowerAction, confirm: Bool = false) async {
        guard let client = session.computerClient else { return }
        pending = action
        defer { pending = nil }
        do {
            let next = try await client.powerServerEnvironment(action, confirm: confirm)
            if next == nil {
                confirmAction = action
                return
            }
            status = next
            error = nil
            confirmAction = nil
        } catch {
            self.error = String(localized: "Could not change the computer.")
            await load()
        }
    }

    private func connect() async {
        guard let client = session.computerClient, power == "running" else { return }
        if !viewer.rfbReady { viewState = "connecting" }
        do {
            let config = try await client.sandboxViewer(control: control)
            let request = try client.sandboxViewerSocketRequest(control: control)
            viewer.start(request: request, password: config.password ?? "", viewOnly: config.viewOnly != false && !control)
            viewState = "connected"
        } catch let APIError.status(code, _) {
            viewState = code == 403 || code == 404 ? "closed" : code == 429 ? "busy" : "unavailable"
        } catch {
            viewState = "unavailable"
        }
    }
}

@MainActor
final class SandboxViewerSession: NSObject, ObservableObject {
    @Published private(set) var rfbReady = false
    fileprivate weak var webView: WKWebView?
    private var socket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var password = ""
    private var viewOnly = true
    private var htmlReady = false
    private var socketOpen = false
    private var relay: Relay?

    func attach(_ webView: WKWebView) {
        self.webView = webView
        tryOpenRFB()
    }

    func markHTMLReady() {
        htmlReady = true
        tryOpenRFB()
    }

    func start(request: URLRequest, password: String, viewOnly: Bool) {
        stopSocket()
        self.password = password
        self.viewOnly = viewOnly
        socketOpen = false
        rfbReady = false
        let relay = Relay(owner: self)
        self.relay = relay
        let session = URLSession(configuration: .default, delegate: relay, delegateQueue: .main)
        self.urlSession = session
        let socket = session.webSocketTask(with: request)
        self.socket = socket
        socket.resume()
        listen()
    }

    func send(_ data: Data) {
        socket?.send(.data(data)) { _ in }
    }

    func stop() {
        stopSocket()
        rfbReady = false
        socketOpen = false
        js("window.sagaxClose && window.sagaxClose()")
    }

    fileprivate func handleSocketOpen() {
        socketOpen = true
        tryOpenRFB()
    }

    fileprivate func handleSocketClose() {
        socketOpen = false
        rfbReady = false
        js("window.sagaxOnClose && window.sagaxOnClose()")
    }

    private func tryOpenRFB() {
        guard htmlReady, socketOpen, webView != nil else { return }
        js("window.sagaxOpen(\(jsString(password)), \(viewOnly ? "true" : "false"))")
        js("window.sagaxOnOpen()")
        rfbReady = true
    }

    private func stopSocket() {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        relay = nil
    }

    private final class Relay: NSObject, URLSessionWebSocketDelegate {
        nonisolated(unsafe) weak var owner: SandboxViewerSession?
        init(owner: SandboxViewerSession) { self.owner = owner }
        func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
            Task { @MainActor in self.owner?.handleSocketOpen() }
        }
        func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
            Task { @MainActor in self.owner?.handleSocketClose() }
        }
    }

    private func listen() {
        socket?.receive { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .success(.data(let data)):
                    self.js("window.sagaxOnMessage('\(data.base64EncodedString())')")
                    self.listen()
                case .success(.string(let text)):
                    self.js("window.sagaxOnMessage('\(Data(text.utf8).base64EncodedString())')")
                    self.listen()
                case .failure:
                    self.handleSocketClose()
                default:
                    self.listen()
                }
            }
        }
    }

    private func js(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: { _, _ in })
    }

    private func jsString(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "'\(escaped)'"
    }
}

private struct SandboxDesktopWebView: UIViewRepresentable {
    @ObservedObject var session: SandboxViewerSession

    func makeCoordinator() -> Coordinator { Coordinator(session: session) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "sagaxRfb")
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.navigationDelegate = context.coordinator
        if let html = Bundle.main.url(forResource: "sandbox-desktop", withExtension: "html") {
            let access = Bundle.main.url(forResource: "novnc.min", withExtension: "js")?.deletingLastPathComponent()
                ?? html.deletingLastPathComponent()
            view.loadFileURL(html, allowingReadAccessTo: access)
        }
        session.attach(view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        session.attach(view)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let session: SandboxViewerSession
        init(session: SandboxViewerSession) { self.session = session }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            session.markHTMLReady()
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return }
            if op == "send", let b64 = body["data"] as? String, let data = Data(base64Encoded: b64) {
                session.send(data)
            } else if op == "close" {
                session.stop()
            }
        }
    }
}


